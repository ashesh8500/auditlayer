import "server-only";
import type { createClient } from "@/lib/supabase/server";
import type { ReportArchiveItem } from "./types";

type Client = Awaited<ReturnType<typeof createClient>>;

/** A short page may be the server's cap, not the end. Stop only on an empty page. */
export async function readSubjectPages<T>(query: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const result = await query(rows.length, rows.length + 199);
    if (result.error || !result.data) throw new Error("Subject data could not be loaded. Please retry.");
    if (!result.data.length) return rows;
    rows.push(...result.data);
  }
}

export async function readSubjectHistory(client: Client, ownerId: string, subjectId: string): Promise<ReportArchiveItem[]> {
  const [batches, channels] = await Promise.all([
    readSubjectPages((a, b) => client.from("audit_batches").select("id").eq("user_id", ownerId).eq("subject_id", subjectId).order("id").range(a, b)),
    readSubjectPages((a, b) => client.from("subject_channels").select("account_id").eq("subject_id", subjectId).order("id").range(a, b)),
  ]);
  const auditIds = new Set<string>();
  for (let i = 0; i < batches.length; i += 100) {
    const links = await readSubjectPages((a, b) => client.from("batch_audits").select("batch_id, audit_id").in("batch_id", batches.slice(i, i + 100).map(r => r.id)).order("batch_id").order("audit_id").range(a, b));
    links.forEach(r => auditIds.add(r.audit_id));
  }
  const accountIds = [...new Set(channels.flatMap(r => r.account_id ? [r.account_id] : []))];
  const reports = new Map<string, ReportArchiveItem>();
  const fields = "id, handle, status, report_version, prompt_version, created_at";
  const add = (rows: { id: string; handle: string; status: string; report_version: number; prompt_version: string | null; created_at: string | null }[]) => {
    for (const row of rows) reports.set(row.id, {
      id: row.id, auditId: row.id, channelLabel: `@${row.handle ?? "unknown"}`,
      status: row.status, reportVersion: row.report_version ?? 1,
      promptVersion: row.prompt_version, createdAt: row.created_at ?? "", href: `/audits/${row.id}`,
    });
  };
  for (let i = 0; i < accountIds.length; i += 100) {
    const accounts = await readSubjectPages((a, b) => client.from("accounts").select("id").eq("user_id", ownerId).in("id", accountIds.slice(i, i + 100)).order("id").range(a, b));
    if (accounts.length) add(await readSubjectPages((a, b) => client.from("audits").select(fields).eq("user_id", ownerId).in("account_id", accounts.map(r => r.id)).order("id").range(a, b)));
  }
  const ids = [...auditIds];
  for (let i = 0; i < ids.length; i += 100) {
    add(await readSubjectPages((a, b) => client.from("audits").select(fields).eq("user_id", ownerId).in("id", ids.slice(i, i + 100)).order("id").range(a, b)));
  }
  return [...reports.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id));
}
