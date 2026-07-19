export type AccountRecord = {
  id: string;
  handle: string;
  platform: string;
  display_name: string | null;
  last_researched_at: string | null;
  cache_valid_until: string | null;
  memory?: unknown;
  research_snapshot?: string | null;
};

export type ConnectionRecord = {
  account_type: string | null;
  followers_count: number | null;
  media_count: number | null;
  is_active: boolean;
  long_lived_expires_at: string;
  last_refreshed_at: string | null;
};

export type ProgressionRecord = {
  recorded_at: string;
  followers: number | null;
  engagement: number | null;
  avg_likes: number | null;
  avg_comments: number | null;
  score: number | null;
};

export type AuditRecord = {
  id: string;
  account_id: string | null;
  status: string;
  report_type: string | null;
  goal: string | null;
  created_at: string;
  updated_at: string;
  prompt_version: string | null;
  report_path?: string | null;
  research_cache?: unknown;
};

export interface McpRepository {
  listAccounts(userId: string): Promise<AccountRecord[]>;
  getAccount(userId: string, accountId: string): Promise<AccountRecord | null>;
  getConnection(userId: string, account: AccountRecord): Promise<ConnectionRecord | null>;
  getProgression(userId: string, accountId: string, limit: number): Promise<ProgressionRecord[]>;
  listAudits(userId: string, accountId: string, limit: number): Promise<AuditRecord[]>;
  getAudit(userId: string, accountId: string, auditId: string): Promise<AuditRecord | null>;
  getReportText(userId: string, audit: AuditRecord): Promise<string | null>;
}

function researchStatus(account: AccountRecord): "current" | "stale" | "unavailable" {
  if (!account.last_researched_at) return "unavailable";
  if (!account.cache_valid_until) return "stale";
  return Date.parse(account.cache_valid_until) > Date.now() ? "current" : "stale";
}

export function createMcpService(userId: string, repository: McpRepository) {
  return {
    async listAccounts() {
      const accounts = await repository.listAccounts(userId);
      return {
        accounts: accounts.map((account) => ({
          id: account.id,
          handle: account.handle,
          platform: account.platform,
          display_name: account.display_name,
          last_researched_at: account.last_researched_at,
          research_status: researchStatus(account),
        })),
      };
    },

    async getAccountContext(accountId: string) {
      const account = await repository.getAccount(userId, accountId);
      if (!account) throw new Error("Account not found");

      const connection = await repository.getConnection(userId, account);
      const connectionStatus = !connection
        ? "not_connected"
        : !connection.is_active || Date.parse(connection.long_lived_expires_at) <= Date.now()
          ? "reconnection_required"
          : "active";

      return {
        account: {
          id: account.id,
          handle: account.handle,
          platform: account.platform,
          display_name: account.display_name,
          last_researched_at: account.last_researched_at,
          research_status: researchStatus(account),
        },
        connection: connection
          ? {
              status: connectionStatus,
              account_type: connection.account_type,
              followers_count: connection.followers_count,
              media_count: connection.media_count,
              observed_at: connection.last_refreshed_at,
              expires_at: connection.long_lived_expires_at,
            }
          : { status: connectionStatus },
        memory:
          account.memory && typeof account.memory === "object" && !Array.isArray(account.memory)
            ? account.memory
            : {},
      };
    },

    async listArtifacts(accountId: string, limit = 10) {
      const account = await repository.getAccount(userId, accountId);
      if (!account) throw new Error("Account not found");

      const boundedLimit = Math.max(1, Math.min(limit, 25));
      const [audits, progression] = await Promise.all([
        repository.listAudits(userId, accountId, boundedLimit),
        repository.getProgression(userId, accountId, boundedLimit),
      ]);

      return {
        account_id: accountId,
        artifacts: audits.map((audit) => ({
          id: audit.id,
          type: audit.report_type ?? "audit",
          status: audit.status,
          goal: audit.goal,
          created_at: audit.created_at,
          updated_at: audit.updated_at,
          methodology_version: audit.prompt_version,
        })),
        progression,
      };
    },

    async getArtifact(accountId: string, auditId: string) {
      const account = await repository.getAccount(userId, accountId);
      if (!account) throw new Error("Account not found");

      const audit = await repository.getAudit(userId, accountId, auditId);
      if (!audit) throw new Error("Artifact not found");
      if (audit.status !== "ready") throw new Error("Artifact is not ready");

      const reportText = await repository.getReportText(userId, audit);
      if (!reportText) throw new Error("Artifact content is unavailable");

      return {
        id: audit.id,
        account_id: accountId,
        type: audit.report_type ?? "audit",
        goal: audit.goal,
        created_at: audit.created_at,
        updated_at: audit.updated_at,
        methodology_version: audit.prompt_version,
        content: reportText.slice(0, 50000),
      };
    },

    async buildCreatorContext(accountId: string, task: string, auditId?: string) {
      const account = await repository.getAccount(userId, accountId);
      if (!account) throw new Error("Account not found");

      const [connection, progression, audits] = await Promise.all([
        repository.getConnection(userId, account),
        repository.getProgression(userId, accountId, 12),
        auditId ? Promise.resolve([]) : repository.listAudits(userId, accountId, 1),
      ]);
      const selectedAuditId = auditId ?? audits[0]?.id;
      let sourceArtifact = null;
      if (selectedAuditId) {
        const audit = await repository.getAudit(userId, accountId, selectedAuditId);
        if (!audit) throw new Error("Artifact not found");
        const content = audit.status === "ready" ? await repository.getReportText(userId, audit) : null;
        sourceArtifact = {
          id: audit.id,
          type: audit.report_type ?? "audit",
          methodology_version: audit.prompt_version,
          content: content?.slice(0, 30000) ?? null,
        };
      }

      return {
        task,
        account: {
          id: account.id,
          handle: account.handle,
          platform: account.platform,
          display_name: account.display_name,
          research_status: researchStatus(account),
          last_researched_at: account.last_researched_at,
        },
        connected_metrics: connection
          ? {
              followers_count: connection.followers_count,
              media_count: connection.media_count,
              observed_at: connection.last_refreshed_at,
              provenance: "connected_instagram",
            }
          : null,
        latest_progression: progression[0] ?? null,
        progression,
        source_artifact: sourceArtifact,
        evidence: {
          research_snapshot: account.research_snapshot?.slice(0, 12000) ?? null,
          instagram_snapshot: null,
          instagram_snapshot_note:
            "Use connected_metrics and progression; legacy cached Instagram snapshots are not authoritative.",
        },
      };
    },
  };
}
