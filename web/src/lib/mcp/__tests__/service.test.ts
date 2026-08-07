import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createMcpService, type McpRepository } from "../service";

function repository(): McpRepository {
  return {
    async listAccounts(userId) {
      return userId === "user-one"
        ? [
            {
              id: "account-one",
              handle: "creator.one",
              platform: "instagram",
              display_name: "Creator One",
              last_researched_at: "2026-07-16T12:00:00Z",
              cache_valid_until: "2026-07-23T12:00:00Z",
              memory: { niche: "wellness" },
            },
          ]
        : [];
    },
    async getAccount(userId, accountId) {
      return userId === "user-one" && accountId === "account-one"
        ? {
            id: "account-one",
            handle: "creator.one",
            platform: "instagram",
            display_name: "Creator One",
            last_researched_at: "2026-07-16T12:00:00Z",
            cache_valid_until: "2026-07-23T12:00:00Z",
            memory: { niche: "wellness", voice_notes: "Clear and evidence led" },
          }
        : null;
    },
    async getConnection(userId) {
      return userId === "user-one"
        ? {
            account_type: "CREATOR",
            followers_count: 12500,
            media_count: 340,
            is_active: true,
            long_lived_expires_at: "2026-08-20T12:00:00Z",
            last_refreshed_at: "2026-07-16T12:00:00Z",
          }
        : null;
    },
    async getProgression(userId, accountId) {
      return userId === "user-one" && accountId === "account-one"
        ? [{ recorded_at: "2026-07-16T12:00:00Z", followers: 12500, engagement: 3.8, avg_likes: 410, avg_comments: 22, score: 74 }]
        : [];
    },
    async listAudits(userId, accountId) {
      return userId === "user-one" && accountId === "account-one"
        ? [{ id: "audit-one", account_id: "account-one", status: "ready", report_type: "standard", goal: "growth", created_at: "2026-07-15T12:00:00Z", updated_at: "2026-07-16T12:00:00Z", prompt_version: "1.1", report_path: "audit-one/report.html" }]
        : [];
    },
    async getAudit(userId, accountId, auditId) {
      return userId === "user-one" && accountId === "account-one" && auditId === "audit-one"
        ? { id: "audit-one", account_id: "account-one", status: "ready", report_type: "standard", goal: "growth", created_at: "2026-07-15T12:00:00Z", updated_at: "2026-07-16T12:00:00Z", prompt_version: "1.1", report_path: "audit-one/report.html" }
        : null;
    },
    async getReportText(userId, audit) {
      return userId === "user-one" && audit.id === "audit-one"
        ? "Executive Summary Creator One has strong authority. Quick Wins Publish two evidence led Reels."
        : null;
    },
  };
}

describe("AuditLayerMedia MCP service", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-17T12:00:00Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("lists only accounts owned by the authenticated user", async () => {
    const service = createMcpService("user-one", repository());

    await expect(service.listAccounts()).resolves.toEqual({
      accounts: [
        {
          id: "account-one",
          handle: "creator.one",
          platform: "instagram",
          display_name: "Creator One",
          last_researched_at: "2026-07-16T12:00:00Z",
          research_status: "current",
        },
      ],
    });
  });

  it("returns connected metrics and account memory without credential fields", async () => {
    const service = createMcpService("user-one", repository());

    const result = await service.getAccountContext("account-one");

    expect(result).toMatchObject({
      account: { id: "account-one", handle: "creator.one" },
      connection: {
        status: "active",
        followers_count: 12500,
        media_count: 340,
        observed_at: "2026-07-16T12:00:00Z",
      },
      memory: { niche: "wellness", voice_notes: "Clear and evidence led" },
    });
    expect(JSON.stringify(result)).not.toContain("token");
  });

  it("rejects an account that is not owned by the authenticated user", async () => {
    const service = createMcpService("user-two", repository());

    await expect(service.getAccountContext("account-one")).rejects.toThrow("Account not found");
  });

  it("returns bounded owned audit artifacts and progression", async () => {
    const service = createMcpService("user-one", repository());

    await expect(service.listArtifacts("account-one", 10)).resolves.toMatchObject({
      account_id: "account-one",
      artifacts: [{ id: "audit-one", type: "standard", status: "ready" }],
      progression: [{ score: 74, followers: 12500 }],
    });

    const artifact = await service.getArtifact("account-one", "audit-one");
    expect(artifact.content).toContain("Executive Summary");
    expect(artifact.content.length).toBeLessThanOrEqual(50000);
  });

  it("builds one compact creator context bundle from metrics, history, and an audit", async () => {
    const service = createMcpService("user-one", repository());

    await expect(
      service.buildCreatorContext("account-one", "monthly_content_strategy", "audit-one"),
    ).resolves.toMatchObject({
      task: "monthly_content_strategy",
      account: { id: "account-one" },
      connected_metrics: { followers_count: 12500 },
      latest_progression: { score: 74 },
      source_artifact: { id: "audit-one" },
    });
  });

  it("never presents expired metrics as connected evidence", async () => {
    const expiredRepository = repository();
    expiredRepository.getConnection = async () => ({
      account_type: "CREATOR",
      followers_count: 12500,
      media_count: 340,
      is_active: true,
      long_lived_expires_at: "2000-01-01T00:00:00Z",
      last_refreshed_at: "2026-07-16T12:00:00Z",
    });
    const service = createMcpService("user-one", expiredRepository);

    await expect(service.getAccountContext("account-one")).resolves.toMatchObject({
      connection: { status: "reconnection_required" },
    });
    await expect(
      service.buildCreatorContext("account-one", "monthly_content_strategy", "audit-one"),
    ).resolves.toMatchObject({ connected_metrics: null });
  });

  it("projects legacy audits as UNKNOWN provenance instead of prompt-as-methodology", async () => {
    const service = createMcpService("user-one", repository());

    const artifacts = await service.listArtifacts("account-one", 10);
    const artifact = artifacts.artifacts[0];
    // The old conflation (methodology_version = prompt_version) is gone.
    expect("methodology_version" in artifact).toBe(false);
    expect(artifact.prompt_version).toBe("1.1");
    expect(artifact.provenance).toMatchObject({ status: "unknown" });
    if (artifact.provenance.status === "unknown") {
      expect(artifact.provenance.correction_tip.length).toBeGreaterThan(10);
    }
  });

  it("projects a pinned manifest with the exact seven-field vocabulary", async () => {
    const pinnedRepository = repository();
    const base = pinnedRepository.getAudit as (
      userId: string,
      accountId: string,
      auditId: string,
    ) => Promise<any>;
    pinnedRepository.getAudit = async (userId, accountId, auditId) => {
      const audit = await base(userId, accountId, auditId);
      return audit
        ? {
            ...audit,
            intelligence_provenance: {
              intelligence_run_id: "33333333-3333-4333-8333-333333333333",
              living_brief_version: 3,
              evidence_snapshot_id: "22222222-2222-4222-8222-222222222222",
              methodology_version: "alm-bridge-v1",
              expertise_pack_version: "social-media-audit",
              prompt_version: "1.1",
              model_config_hash: "abc123def456",
              output_schema_version: "1.0",
            },
          }
        : null;
    };
    const service = createMcpService("user-one", pinnedRepository);

    const artifact = await service.getArtifact("account-one", "audit-one");
    expect(artifact.provenance).toEqual({
      status: "pinned",
      manifest_version: "1.0",
      intelligence_run_id: "33333333-3333-4333-8333-333333333333",
      manifest: {
        living_brief_version: 3,
        evidence_snapshot_id: "22222222-2222-4222-8222-222222222222",
        methodology_version: "alm-bridge-v1",
        expertise_pack_version: "social-media-audit",
        prompt_version: "1.1",
        model_config_hash: "abc123def456",
        output_schema_version: "1.0",
      },
    });
    // prompt_version is projected under its own name, never as methodology.
    expect("methodology_version" in artifact).toBe(false);
    expect(artifact.prompt_version).toBe("1.1");
  });

  it("keeps owner scoping intact when attaching provenance", async () => {
    const pinnedRepository = repository();
    const service = createMcpService("user-two", pinnedRepository);

    await expect(service.getArtifact("account-one", "audit-one")).rejects.toThrow(
      "Account not found",
    );
  });
});
