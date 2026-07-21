import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { StatusBadge } from "@/components/status-badge";
import { createAdminClient } from "@/lib/supabase/admin";
import { isOperatorConfigured, isSupabaseAdminConfigured } from "@/lib/env";
import {
  PLATFORM_LABELS,
  type AuditStatus,
  type Platform,
} from "@/lib/domain";
import { AuditActions } from "./audit-actions";
import { OperatorPanel } from "./operator-panel";

export default async function AdminAuditDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-10 text-sm text-muted-foreground">
        Service-role key required to load this audit.
      </main>
    );
  }

  const admin = createAdminClient();
  const { data: audit } = await admin
    .from("audits")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!audit) notFound();

  const [{ data: owner }, { data: events }] = await Promise.all([
    admin
      .from("profiles")
      .select("email, full_name, plan, onboarding_status")
      .eq("id", audit.user_id)
      .maybeSingle(),
    admin
      .from("audit_events")
      .select("id, phase, event_type, detail, actor, created_at")
      .eq("audit_id", id)
      .order("created_at", { ascending: true }),
  ]);

  const operatorTable = admin as any;
  const [{ data: thread }, { data: jobs }] = await Promise.all([
    operatorTable
      .from("operator_threads")
      .select("id")
      .eq("audit_id", id)
      .maybeSingle(),
    operatorTable
      .from("operator_jobs")
      .select("id,kind,status,approval_state,instruction,created_at")
      .eq("audit_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
  ]);
  const { data: operatorMessages } = thread
    ? await operatorTable
        .from("operator_messages")
        .select("id,role,content,created_at")
        .eq("thread_id", thread.id)
        .order("created_at", { ascending: true })
        .limit(100)
    : { data: [] };

  const eventList = events ?? [];
  const limitations = Array.isArray(audit.limitations)
    ? (audit.limitations as string[])
    : [];

  return (
    <main className="mx-auto w-full max-w-7xl px-6 py-10">
      <Link
        href="/admin"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to console
      </Link>

      <header className="mt-4 flex items-center justify-between border-b border-border pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">@{audit.handle}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {PLATFORM_LABELS[audit.platform as Platform] ?? audit.platform} ·{" "}
            {owner?.email ?? "unknown"} · {owner?.plan ?? ""}
          </p>
        </div>
        <div className="text-right">
          <StatusBadge status={audit.status as AuditStatus} />
          <p className="mt-2 font-mono text-[0.65rem] text-muted-foreground">
            Report v{(audit as any).report_version ?? 1} · Method {(audit as any).prompt_version || "—"}
          </p>
        </div>
      </header>

      {audit.admin_notes && (
        <pre className="mt-5 whitespace-pre-wrap rounded-[var(--radius)] border border-border bg-muted p-3 text-xs text-muted-foreground">
          {audit.admin_notes}
        </pre>
      )}

      {limitations.length > 0 && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {limitations.map((l) => (
            <li key={l}>• {l}</li>
          ))}
        </ul>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Report workspace
        </h2>
        <div className="mt-3 grid items-start gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(22rem,0.8fr)]">
          <div className="overflow-hidden rounded-[var(--radius)] border border-border bg-card">
            {audit.status === "ready" && audit.report_path ? (
              <iframe
                src={`/api/audits/${id}/report`}
                title={`Audit report for @${audit.handle}`}
                sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="h-[48rem] w-full bg-white"
              />
            ) : (
              <div className="grid h-56 place-items-center p-6 text-sm text-muted-foreground">
                The report is not ready for review yet.
              </div>
            )}
          </div>
          <OperatorPanel
            auditId={id}
            configured={isOperatorConfigured()}
            messages={(operatorMessages ?? []) as any}
            jobs={(jobs ?? []) as any}
          />
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Founder actions
        </h2>
        <div className="mt-3">
          <AuditActions auditId={id} status={audit.status} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          Event trail
        </h2>
        <ol className="mt-3 space-y-2">
          {eventList.length === 0 ? (
            <li className="text-sm text-muted-foreground">No events yet.</li>
          ) : (
            eventList.map((e) => (
              <li
                key={e.id}
                className="flex gap-3 rounded-[var(--radius)] border border-border bg-card px-4 py-2 text-xs"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(e.created_at ?? "").toLocaleString()}
                </span>
                <span className="font-medium">{e.event_type}</span>
                {e.phase && (
                  <span className="text-[color:var(--accent)]">{e.phase}</span>
                )}
                <span className="text-muted-foreground">{e.actor}</span>
                {e.detail && (
                  <span className="flex-1 truncate text-muted-foreground">
                    {e.detail}
                  </span>
                )}
              </li>
            ))
          )}
        </ol>
      </section>
    </main>
  );
}
