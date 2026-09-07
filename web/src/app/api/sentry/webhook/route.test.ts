import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { isSupabaseAdminConfigured } from "@/lib/env";
import { captureWebFailure } from "@/lib/sentry";
import { createAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/env", () => ({ isSupabaseAdminConfigured: vi.fn() }));
vi.mock("@/lib/sentry", () => ({ captureWebFailure: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));

import { POST } from "./route";

const secret = "test-webhook-secret";
const originalSecret = process.env.SENTRY_WEBHOOK_SECRET;

function signedRequest(payload: unknown): Request {
  const rawBody = JSON.stringify(payload);
  const signature = createHmac("sha256", secret).update(rawBody).digest("hex");
  return new Request("https://auditlayermedia.com/api/sentry/webhook", {
    method: "POST",
    body: rawBody,
    headers: { "sentry-hook-signature": signature },
  });
}

const issueAlertPayload = {
  action: "triggered",
  data: {
    event: {
      event_id: "e4874d664c3540c1a32eab185f12c5ab",
      issue_id: "1117540176",
      project: 1,
      level: "error",
      web_url: "https://sentry.example/issues/1117540176/events/e487",
      tags: [
        ["environment", "preview"],
        ["release", "f6cfaf9a69bf0c4b1e9ad819c9a1f47dc9c68ef1"],
        ["service", "auditlayer-web"],
        ["surface", "instagram_oauth"],
        ["operation", "token_exchange"],
        ["error_class", "OAuthExchangeError"],
        ["status", "failed"],
      ],
    },
  },
};

describe("Sentry webhook intake", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SENTRY_WEBHOOK_SECRET = secret;
    vi.mocked(isSupabaseAdminConfigured).mockReturnValue(true);
  });

  afterEach(() => {
    if (originalSecret === undefined) delete process.env.SENTRY_WEBHOOK_SECRET;
    else process.env.SENTRY_WEBHOOK_SECRET = originalSecret;
  });

  it("accepts the official issue shape and writes only reconstructed diagnostics", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "incident-id", error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const response = await POST(
      signedRequest({
        action: "created",
        data: {
          issue: {
            id: "1234567890",
            web_url: "https://example.sentry.io/issues/1234567890/?token=PRIVATE_CANARY",
            title: "PRIVATE_CANARY for a customer",
            culprit: "customer/private/path",
            level: "fatal",
            status: "unresolved",
            project: {
              id: "4509877862268928",
              slug: "web",
            },
            metadata: { title: "PRIVATE_CANARY" },
            issueType: "error",
          },
        },
        installation: { uuid: "PRIVATE_CANARY" },
      }),
    );

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ accepted: true });
    expect(rpc).toHaveBeenCalledWith("ingest_operator_incident", {
      p_fingerprint: "sentry:4509877862268928:1234567890",
      p_source: "sentry",
      p_severity: "fatal",
      p_environment: "unknown",
      p_title: "Error in sentry_issue",
      p_external_url: "https://example.sentry.io/issues/1234567890/",
      p_metadata: {
        service: "auditlayer-web",
        surface: "sentry_issue",
        operation: "issue_created",
        error_class: "Error",
        status: "unresolved",
        release: "unknown",
      },
    });
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("PRIVATE_CANARY");
    expect(JSON.stringify(rpc.mock.calls)).not.toContain("customer/private/path");
  });

  it("accepts repeated official issue alerts with one immutable deduplication fingerprint", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: "incident-id", error: null });
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);

    const first = await POST(signedRequest(issueAlertPayload));
    const second = await POST(signedRequest(issueAlertPayload));

    expect(first.status).toBe(202);
    expect(second.status).toBe(202);
    expect(rpc).toHaveBeenCalledTimes(2);
    expect(rpc.mock.calls.map((call) => call[1].p_fingerprint)).toEqual([
      "sentry:1:1117540176",
      "sentry:1:1117540176",
    ]);
  });

  it("rejects invalid HMAC signatures and oversized bodies before persistence", async () => {
    const rpc = vi.fn();
    vi.mocked(createAdminClient).mockReturnValue({ rpc } as never);
    const invalidSignature = new Request(
      "https://auditlayermedia.com/api/sentry/webhook",
      {
        method: "POST",
        body: JSON.stringify(issueAlertPayload),
        headers: { "sentry-hook-signature": "0".repeat(64) },
      },
    );
    const oversized = new Request(
      "https://auditlayermedia.com/api/sentry/webhook",
      {
        method: "POST",
        body: "{}",
        headers: {
          "content-length": "262145",
          "sentry-hook-signature": "0".repeat(64),
        },
      },
    );

    expect((await POST(invalidSignature)).status).toBe(401);
    expect((await POST(oversized)).status).toBe(413);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("captures an incident-write failure with safe static dimensions", async () => {
    vi.mocked(createAdminClient).mockReturnValue({
      rpc: vi.fn().mockResolvedValue({ error: { message: "private database detail" } }),
    } as never);

    const response = await POST(
      signedRequest({
        action: "created",
        data: { issue: { id: "123", project: { slug: "web" }, level: "error" } },
      }),
    );

    expect(response.status).toBe(500);
    expect(captureWebFailure).toHaveBeenCalledWith(expect.any(Error), {
      surface: "sentry_webhook",
      operation: "incident_ingest",
      status: "failed",
      errorClass: "IncidentWriteError",
    });
  });
});
