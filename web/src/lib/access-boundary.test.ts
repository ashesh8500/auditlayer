import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_ROLE,
  decideArtifactAccess,
  decideShareAccess,
  isShareCookieReachable,
  isValidShareToken,
  PRINCIPALS,
  PRIVATE_RESOURCE_CLASSES,
  redactStorageError,
  resolveReportVersionRequest,
  shareCookiePath,
  shareRoutesForToken,
  shareSessionCookieName,
  auditAccessGate,
  shareAccessGate,
  type ArtifactResource,
  type Principal,
  type ShareLinkState,
} from "./access-boundary";

// ---------------------------------------------------------------------------
// Fixture generators
// ---------------------------------------------------------------------------

const OWNER_ID = "00000000-0000-0000-0000-0000000000aa";
const ADMIN_ID = "00000000-0000-0000-0000-0000000000bb";
const OTHER_ID = "00000000-0000-0000-0000-0000000000cc";
// A third-party user who owns nothing in the fixture set.
const STRANGER_ID = "00000000-0000-0000-0000-0000000000dd";

const PRINCIPAL_FIXTURES: readonly Principal[] = [
  { kind: "owner", userId: OWNER_ID, role: "client" },
  { kind: "admin", userId: ADMIN_ID, role: ADMIN_ROLE },
  { kind: "other", userId: OTHER_ID, role: "client" },
  { kind: "anonymous", userId: null, role: null },
];

/** Fixture resource: resolved owner id per resource class. */
function resourceFixtures(): { resource: ArtifactResource; ownedByOwner: boolean }[] {
  return PRIVATE_RESOURCE_CLASSES.flatMap((resourceClass) => [
    { resource: { resourceClass, ownerUserId: OWNER_ID }, ownedByOwner: true },
    { resource: { resourceClass, ownerUserId: STRANGER_ID }, ownedByOwner: false },
  ]);
}

function expectedDecision(principal: Principal, ownedByOwner: boolean): "allow" | "deny" {
  if (principal.kind === "admin") return "allow";
  if (principal.kind === "owner") return ownedByOwner ? "allow" : "deny";
  // other/anonymous never own the fixture resources → always deny.
  return "deny";
}

function shareState(overrides: Partial<ShareLinkState> = {}): ShareLinkState {
  return {
    exists: true,
    mode: "public",
    revokedAt: null,
    expiresAt: null,
    verifiedAt: null,
    hasVerifiedSession: false,
    auditReady: true,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Principal × private-resource access matrix (fixture-generated)
// ---------------------------------------------------------------------------

describe("canonical artifact access matrix", () => {
  const cases = PRINCIPAL_FIXTURES.flatMap((principal) =>
    resourceFixtures().map(({ resource, ownedByOwner }) => ({
      principal,
      resource,
      ownedByOwner,
      expected: expectedDecision(principal, ownedByOwner),
    })),
  );

  it("generates at least 4 principals × 5 private resource classes", () => {
    expect(PRINCIPAL_FIXTURES.length).toBeGreaterThanOrEqual(4);
    expect(PRIVATE_RESOURCE_CLASSES.length).toBeGreaterThanOrEqual(5);
    expect(cases.length).toBeGreaterThanOrEqual(4 * 5);
  });

  it.each(cases)(
    "$principal.kind on $resource.resourceClass (ownedByOwner=$ownedByOwner) → $expected",
    ({ principal, resource, expected }) => {
      expect(decideArtifactAccess({ principal, resource })).toBe(expected);
    },
  );

  it("denies uniformly and never reveals existence for non-owners", () => {
    for (const principal of PRINCIPAL_FIXTURES) {
      for (const resourceClass of PRIVATE_RESOURCE_CLASSES) {
        const onOwnedResource = decideArtifactAccess({
          principal,
          resource: { resourceClass, ownerUserId: OWNER_ID },
        });
        const onStrangerResource = decideArtifactAccess({
          principal,
          resource: { resourceClass, ownerUserId: STRANGER_ID },
        });
        if (principal.kind === "admin") {
          expect(onOwnedResource).toBe("allow");
          expect(onStrangerResource).toBe("allow");
        } else if (principal.kind === "owner") {
          expect(onOwnedResource).toBe("allow");
          expect(onStrangerResource).toBe("deny");
        } else {
          expect(onOwnedResource).toBe("deny");
          expect(onStrangerResource).toBe("deny");
        }
      }
    }
  });

  it("does not treat a missing owner as allow (fail closed)", () => {
    for (const principal of PRINCIPAL_FIXTURES) {
      const decision = decideArtifactAccess({
        principal,
        resource: { resourceClass: "audit", ownerUserId: null },
      });
      expect(decision).toBe(principal.kind === "admin" ? "allow" : "deny");
    }
  });
});

// ---------------------------------------------------------------------------
// 2. Share-link states (explicit token-scoped exception)
// ---------------------------------------------------------------------------

describe("share-link access states", () => {
  it("public link with ready audit → allow", () => {
    const decision = decideShareAccess(shareState({ mode: "public" }));
    expect(decision).toEqual({ allow: true, mode: "public" });
  });

  it("email link verified via verified_at → allow", () => {
    const decision = decideShareAccess(
      shareState({
        mode: "email",
        verifiedAt: "2026-08-01T00:00:00Z",
      }),
    );
    expect(decision).toEqual({ allow: true, mode: "email" });
  });

  it("email link verified via session cookie → allow", () => {
    const decision = decideShareAccess(
      shareState({ mode: "email", hasVerifiedSession: true }),
    );
    expect(decision).toEqual({ allow: true, mode: "email" });
  });

  it("email link without verification → deny needs_verification", () => {
    const decision = decideShareAccess(shareState({ mode: "email" }));
    expect(decision).toEqual({
      allow: false,
      reason: "needs_verification",
    });
  });

  it("revoked link → deny revoked even when otherwise valid", () => {
    const decision = decideShareAccess(
      shareState({ mode: "public", revokedAt: "2026-08-02T00:00:00Z" }),
    );
    expect(decision).toEqual({ allow: false, reason: "revoked" });
  });

  it("expired link → deny expired (deterministic clock)", () => {
    const now = new Date("2026-08-03T12:00:00Z");
    const decision = decideShareAccess(
      shareState({ mode: "public", expiresAt: "2026-08-03T11:59:59Z" }),
      now,
    );
    expect(decision).toEqual({ allow: false, reason: "expired" });
    // At the exact boundary the link is expired (<= now).
    const atBoundary = decideShareAccess(
      shareState({ mode: "public", expiresAt: "2026-08-03T12:00:00Z" }),
      now,
    );
    expect(atBoundary).toEqual({ allow: false, reason: "expired" });
    // Before expiry it is still valid.
    const notYet = decideShareAccess(
      shareState({ mode: "public", expiresAt: "2026-08-03T12:00:01Z" }),
      now,
    );
    expect(notYet).toEqual({ allow: true, mode: "public" });
  });

  it("audit not ready → deny not_ready", () => {
    const decision = decideShareAccess(shareState({ auditReady: false }));
    expect(decision).toEqual({ allow: false, reason: "not_ready" });
  });

  it("missing link row → deny not_found", () => {
    const decision = decideShareAccess(shareState({ exists: false }));
    expect(decision).toEqual({ allow: false, reason: "not_found" });
  });

  it("revoked beats expired beats readiness in ordering", () => {
    const now = new Date("2026-08-03T12:00:00Z");
    expect(
      decideShareAccess(
        shareState({
          revokedAt: "2026-08-01T00:00:00Z",
          expiresAt: "2026-08-02T00:00:00Z",
          auditReady: false,
        }),
        now,
      ),
    ).toEqual({ allow: false, reason: "revoked" });
    expect(
      decideShareAccess(
        shareState({ expiresAt: "2026-08-02T00:00:00Z", auditReady: false }),
        now,
      ),
    ).toEqual({ allow: false, reason: "expired" });
  });
});

// ---------------------------------------------------------------------------
// 3. Authorization ordering: gates deny before any service-role read
// ---------------------------------------------------------------------------

describe("route access gates (pure, no service-role)", () => {
  it("auditAccessGate maps the canonical decision to HTTP", () => {
    expect(auditAccessGate({ audit: { id: "a" } })).toEqual({ ok: true });
    expect(auditAccessGate({ error: "unauthorized" })).toEqual({
      ok: false,
      status: 401,
      error: "unauthorized",
    });
    expect(auditAccessGate({ error: "forbidden" })).toEqual({
      ok: false,
      status: 403,
      error: "forbidden",
    });
    expect(auditAccessGate({ error: "not_found" })).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
  });

  it("shareAccessGate maps the canonical share decision to HTTP", () => {
    expect(shareAccessGate({ audit: {}, link: {}, mode: "public" })).toEqual({
      ok: true,
    });
    expect(
      shareAccessGate({ audit: {}, link: {}, mode: "email", needsVerification: true }),
    ).toEqual({ ok: false, status: 403, error: "Email verification required" });
    expect(shareAccessGate({ error: "not_found" })).toEqual({
      ok: false,
      status: 404,
      error: "not_found",
    });
    expect(shareAccessGate({ error: "revoked" })).toEqual({
      ok: false,
      status: 410,
      error: "revoked",
    });
    expect(shareAccessGate({ error: "expired" })).toEqual({
      ok: false,
      status: 410,
      error: "expired",
    });
    expect(shareAccessGate({ error: "not_ready" })).toEqual({
      ok: false,
      status: 403,
      error: "not_ready",
    });
  });

  it("denied gates never expose existence or paths", () => {
    for (const error of ["not_found", "forbidden", "unauthorized"] as const) {
      const gate = auditAccessGate({ error });
      expect(gate).not.toHaveProperty("audit");
      expect(JSON.stringify(gate)).not.toMatch(/reports\/|report_path|eyJ/);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Report-version scoping stays within the authorized audit
// ---------------------------------------------------------------------------

describe("report-version scoping", () => {
  it("accepts a valid version for the authorized audit", () => {
    expect(
      resolveReportVersionRequest({
        requestedVersion: 2,
        auditId: "audit-1",
        authorizedAuditId: "audit-1",
      }),
    ).toEqual({ ok: true, version: 2 });
  });

  it("accepts no version parameter", () => {
    expect(
      resolveReportVersionRequest({
        requestedVersion: null,
        auditId: "audit-1",
        authorizedAuditId: "audit-1",
      }),
    ).toEqual({ ok: true, version: -1 });
  });

  it("rejects non-positive and non-integer versions", () => {
    for (const bad of [0, -1, 1.5, Number.NaN]) {
      expect(
        resolveReportVersionRequest({
          requestedVersion: bad,
          auditId: "audit-1",
          authorizedAuditId: "audit-1",
        }),
      ).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("rejects a version request for a different audit (out of scope)", () => {
    expect(
      resolveReportVersionRequest({
        requestedVersion: 1,
        auditId: "audit-2",
        authorizedAuditId: "audit-1",
      }),
    ).toEqual({ ok: false, reason: "out_of_scope" });
  });
});

// ---------------------------------------------------------------------------
// 5. Email-share session cookie reaches the report route
// ---------------------------------------------------------------------------

describe("email-share session cookie reachability", () => {
  const TOKEN = "share_token_abc123";

  it("covers both the landing page and the report route", () => {
    const routes = shareRoutesForToken(TOKEN);
    expect(routes).toEqual([`/s/${TOKEN}`, `/api/share/${TOKEN}/report`]);
    expect(isShareCookieReachable(shareCookiePath(TOKEN), TOKEN)).toBe(true);
  });

  it("proves the baseline bug: /s/{token} cookie never reaches /api/share", () => {
    // The previous cookie path only covered the landing page, so the verified
    // email session never reached the report route.
    expect(isShareCookieReachable(`/s/${TOKEN}`, TOKEN)).toBe(false);
    expect(isShareCookieReachable("/", TOKEN)).toBe(true);
  });

  it("keeps the cookie name token-scoped", () => {
    expect(shareSessionCookieName("tok1")).toBe("alm_share_tok1");
    expect(shareSessionCookieName("tok1")).not.toBe(shareSessionCookieName("tok2"));
  });

  it("rejects malformed tokens before they become cookie names", () => {
    expect(isValidShareToken("ok_token_12345678")).toBe(true);
    expect(isValidShareToken("")).toBe(false);
    expect(isValidShareToken("has space")).toBe(false);
    expect(isValidShareToken("short")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 6. Client output never contains private paths or credentials
// ---------------------------------------------------------------------------

describe("storage error redaction", () => {
  it("redacts private report/pdfs object paths", () => {
    const message =
      "The resource 'reports/550e8400-e29b-41d4-a716-446655440000/revisions/r1.html' was not found";
    const out = redactStorageError(message);
    expect(out).not.toMatch(/reports\//);
    expect(out).not.toMatch(/revisions\//);
    expect(out).toContain("[redacted]");
  });

  it("redacts service-role-looking JWT and secret values", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature";
    const secret = "sb_secret_abcdef1234567890";
    const env = "SUPABASE_SERVICE_ROLE_KEY=eyJsb25nLnNlY3JldC52YWx1ZS4xMjM0NTY3ODkw";
    for (const input of [jwt, secret, env]) {
      const out = redactStorageError(input);
      expect(out).not.toMatch(/eyJ/);
      expect(out).not.toMatch(/sb_secret_/);
      expect(out).toContain("[redacted]");
    }
  });

  it("redacts long opaque tokens that could be credentials", () => {
    const out = redactStorageError("auth failed for " + "A".repeat(48));
    expect(out).not.toMatch(/A{40,}/);
    expect(out).toContain("[redacted]");
  });

  it("keeps ordinary messages and fails closed on empty input", () => {
    expect(redactStorageError("Download failed")).toBe("Download failed");
    expect(redactStorageError(null)).toBe("Download failed");
    expect(redactStorageError("")).toBe("Download failed");
    expect(redactStorageError("object not found")).toBe("object not found");
  });
});

// ---------------------------------------------------------------------------
// 7. Static route-source checks: canonical gate precedes service-role reads
// ---------------------------------------------------------------------------

function routeSource(relative: string): string {
  // Vitest runs with cwd = web/ (the package root); the test lives in src/lib.
  return readFileSync(join(process.cwd(), "src", relative), "utf8");
}

describe("service-role artifact routes (static ordering contract)", () => {
  const routes = [
    {
      name: "report route",
      file: "app/api/audits/[id]/report/route.ts",
      accessCall: "getAuditForViewer",
      gateCall: "auditAccessGate",
    },
    {
      name: "read route",
      file: "app/api/audits/[id]/read/route.ts",
      accessCall: "getAuditForViewer",
      gateCall: "auditAccessGate",
    },
    {
      name: "share report route",
      file: "app/api/share/[token]/report/route.ts",
      accessCall: "getAuditForShare",
      gateCall: "shareAccessGate",
    },
  ] as const;

  it.each(routes)("$name: access decision precedes service-role client", ({ file, accessCall, gateCall }) => {
    const source = routeSource(file);
    // Match call sites, not import lines: the access call and the pure gate
    // must appear in the handler BEFORE the service-role client is constructed.
    const accessIndex = source.indexOf(`${accessCall}(`);
    const gateIndex = source.indexOf(`${gateCall}(`);
    const adminIndex = source.indexOf("createAdminClient()");
    expect(accessIndex).toBeGreaterThanOrEqual(0);
    expect(gateIndex).toBeGreaterThanOrEqual(0);
    expect(adminIndex).toBeGreaterThan(accessIndex);
    expect(adminIndex).toBeGreaterThan(gateIndex);
  });

  it.each(routes)("$name: consumes the canonical access-boundary contract", ({ file }) => {
    const source = routeSource(file);
    expect(source).toContain("@/lib/access-boundary");
  });

  it("report route: version lookup stays scoped to the authorized audit", () => {
    const source = routeSource("app/api/audits/[id]/report/route.ts");
    expect(source).toContain('.eq("audit_id", audit.id)');
    expect(source).not.toContain('.eq("audit_id", id)');
    expect(source).toContain("resolveReportVersionRequest");
  });

  it("report and read routes: storage errors are redacted before client output", () => {
    const report = routeSource("app/api/audits/[id]/report/route.ts");
    const read = routeSource("app/api/audits/[id]/read/route.ts");
    const share = routeSource("app/api/share/[token]/report/route.ts");
    for (const source of [report, read, share]) {
      expect(source).toContain("redactStorageError");
    }
  });

  it("share-access.ts: session cookie uses the reachable canonical path", () => {
    const shareSource = routeSource("lib/share-access.ts");
    expect(shareSource).toContain("shareCookiePath");
    // The previous implementation scoped the cookie to /s/{token}, which never
    // reached the report route — that literal must not come back.
    expect(shareSource).not.toContain("path: `/s/${token}`");
  });

  it("audit-access.ts: decision flows through the canonical contract", () => {
    const auditSource = routeSource("lib/audit-access.ts");
    expect(auditSource).toContain("decideArtifactAccess");
    expect(auditSource).toContain("@/lib/access-boundary");
  });
});
