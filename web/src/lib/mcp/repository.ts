import "server-only";

import { WORKSPACE_ACCOUNT_STATUSES } from "@/lib/account-ownership";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ReportProvenanceSource } from "@/lib/report-provenance";

import type {
  AccountRecord,
  AuditRecord,
  ConnectionRecord,
  McpRepository,
  ProgressionRecord,
} from "./service";
import { reportHtmlToText } from "./report-text";

export function createSupabaseMcpRepository(): McpRepository {
  const admin = createAdminClient() as any;

  return {
    async listAccounts(userId) {
      const { data, error } = await admin
        .from("accounts")
        .select("id,handle,platform,display_name,last_researched_at,cache_valid_until,research_snapshot")
        .eq("user_id", userId)
        .in("ownership_status", [...WORKSPACE_ACCOUNT_STATUSES])
        .order("created_at", { ascending: false });
      if (error) throw new Error(`Could not list accounts: ${error.message}`);
      return (data ?? []) as AccountRecord[];
    },

    async getAccount(userId, accountId) {
      const { data, error } = await admin
        .from("accounts")
        .select("id,handle,platform,display_name,last_researched_at,cache_valid_until,research_snapshot")
        .eq("user_id", userId)
        .eq("id", accountId)
        .in("ownership_status", [...WORKSPACE_ACCOUNT_STATUSES])
        .maybeSingle();
      if (error) throw new Error(`Could not read account: ${error.message}`);
      return (data as AccountRecord | null) ?? null;
    },

    async getConnection(userId, account) {
      if (account.platform !== "instagram") return null;
      const { data, error } = await admin
        .from("instagram_connections")
        .select("account_type,followers_count,media_count,is_active,long_lived_expires_at,last_refreshed_at")
        .eq("user_id", userId)
        .eq("ig_username", account.handle.replace(/^@/, ""))
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(`Could not read connection health: ${error.message}`);
      return (data as ConnectionRecord | null) ?? null;
    },

    async getProgression(userId, accountId, limit) {
      const { data, error } = await admin
        .from("account_progression")
        .select("recorded_at,followers,engagement,avg_likes,avg_comments,score,accounts!inner(user_id)")
        .eq("account_id", accountId)
        .eq("accounts.user_id", userId)
        .order("recorded_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Could not read progression: ${error.message}`);
      return (data ?? []).map((row: any) => ({
        recorded_at: row.recorded_at,
        followers: row.followers,
        engagement: row.engagement,
        avg_likes: row.avg_likes,
        avg_comments: row.avg_comments,
        score: row.score,
      })) as ProgressionRecord[];
    },

    async listAudits(userId, accountId, limit) {
      const { data, error } = await admin
        .from("audits")
        .select("id,account_id,status,report_type,goal,created_at,updated_at,prompt_version,report_path,research_cache")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .order("created_at", { ascending: false })
        .limit(limit);
      if (error) throw new Error(`Could not list artifacts: ${error.message}`);
      return (data ?? []) as AuditRecord[];
    },

    async getAudit(userId, accountId, auditId) {
      const { data, error } = await admin
        .from("audits")
        .select("id,account_id,status,report_type,goal,created_at,updated_at,prompt_version,report_path,research_cache")
        .eq("user_id", userId)
        .eq("account_id", accountId)
        .eq("id", auditId)
        .maybeSingle();
      if (error) throw new Error(`Could not read artifact: ${error.message}`);
      const audit = (data as AuditRecord | null) ?? null;
      if (!audit) return null;
      // Attach the pinned canonical intelligence run when the newest report
      // version references one. Absence/error yields null → the projection
      // emits explicit UNKNOWN provenance; it never blocks retrieval.
      audit.intelligence_provenance = await readReportProvenance(admin, auditId);
      return audit;
    },

    async getReportText(userId, audit) {
      if (!audit.report_path) return null;
      const { data: ownedAudit, error: ownershipError } = await admin
        .from("audits")
        .select("id")
        .eq("id", audit.id)
        .eq("user_id", userId)
        .maybeSingle();
      if (ownershipError || !ownedAudit) return null;

      const { data, error } = await admin.storage.from("reports").download(audit.report_path);
      if (error || !data) return null;
      return reportHtmlToText(await data.text());
    },
  };
}

/**
 * Read the newest report version's pinned canonical intelligence run.
 *
 * Returns null when the audit has no report version, no intelligence_run_id,
 * the run row is absent, or the query fails — the projection then emits
 * explicit UNKNOWN provenance. This is a bounded, defensive read that never
 * blocks artifact retrieval and never reads report prose into canonical state.
 */
async function readReportProvenance(
  admin: any,
  auditId: string,
): Promise<ReportProvenanceSource | null> {
  try {
    const { data: versionRow, error: versionError } = await admin
      .from("audit_report_versions")
      .select("intelligence_run_id")
      .eq("audit_id", auditId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (versionError || !versionRow?.intelligence_run_id) return null;

    const { data: run, error: runError } = await admin
      .from("intelligence_runs")
      .select(
        "id,brief_version,evidence_snapshot_id,methodology_version,expertise_pack_version,prompt_version,model_config_hash,output_schema_version",
      )
      .eq("id", versionRow.intelligence_run_id)
      .maybeSingle();
    if (runError || !run) return null;

    return {
      intelligence_run_id: String(run.id),
      living_brief_version: run.brief_version,
      evidence_snapshot_id: String(run.evidence_snapshot_id),
      methodology_version: String(run.methodology_version),
      expertise_pack_version: String(run.expertise_pack_version),
      prompt_version: String(run.prompt_version),
      model_config_hash: String(run.model_config_hash),
      output_schema_version: String(run.output_schema_version),
    };
  } catch {
    return null;
  }
}
