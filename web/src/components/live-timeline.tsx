"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  CircleDashed,
  Loader2,
  Radio,
  RefreshCw,
  TriangleAlert,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { StatusBadge } from "@/components/status-badge";
import type { AuditEventPhase } from "@/lib/supabase/types";
import type { AuditStatus } from "@/lib/domain";
import { MAX_RETRIES, retryStatusLabel } from "@/lib/domain";

export interface TimelineEvent {
  id: string;
  phase: AuditEventPhase | null;
  event_type: string;
  detail: string;
  actor: string;
  created_at: string;
}

const PHASE_STEPS: { phase: AuditEventPhase; label: string; blurb: string }[] = [
  { phase: "intake", label: "Intake", blurb: "Request captured and evaluated." },
  { phase: "queued", label: "Queued", blurb: "Accepted, waiting for the worker." },
  { phase: "approved", label: "Approved", blurb: "Cleared to run." },
  { phase: "started", label: "Started", blurb: "Worker claimed the audit." },
  {
    phase: "researching",
    label: "Researching handle",
    blurb: "Gathering signals on the account.",
  },
  {
    phase: "metrics",
    label: "Pulling metrics",
    blurb: "Calculating followers, engagement, cadence, and format mix.",
  },
  {
    phase: "peers",
    label: "Peer analysis",
    blurb: "Benchmarking same-tier competitors.",
  },
  {
    phase: "scoring",
    label: "Scoring",
    blurb: "Computing the performance score.",
  },
  {
    phase: "composing",
    label: "Building report",
    blurb: "Validating structured analysis and filling the report template.",
  },
  { phase: "uploaded", label: "Uploaded", blurb: "Report written to storage." },
  { phase: "succeeded", label: "Ready", blurb: "Your report is ready." },
];

const TERMINAL: AuditStatus[] = ["ready", "failed", "blocked"];

const POLL_MS = 15000; // Silent backup — Supabase Realtime handles the fast path

export function LiveTimeline({
  auditId,
  initialEvents,
  status: initialStatus,
  retryCount,
}: {
  auditId: string;
  initialEvents: TimelineEvent[];
  status: AuditStatus;
  retryCount?: number;
}) {
  const router = useRouter();
  const [currentStatus, setCurrentStatus] = useState<AuditStatus>(initialStatus);
  const [liveEvents, setLiveEvents] = useState<TimelineEvent[]>([]);
  const [realtimeConnected, setRealtimeConnected] = useState(false);
  const [lastEventAt, setLastEventAt] = useState<number | null>(null);
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const pollingRef = useRef(false);

  useEffect(() => {
    // The server can refresh this prop after an admin/worker status transition.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentStatus(initialStatus);
  }, [initialStatus]);

  const mergeEvents = useCallback((incoming: TimelineEvent[]) => {
    if (incoming.length === 0) return;
    setLiveEvents((prev) => {
      const map = new Map<string, TimelineEvent>();
      for (const e of [...prev, ...incoming]) map.set(e.id, e);
      return Array.from(map.values());
    });
    setLastEventAt(Date.now());
  }, []);

  const merged = new Map<string, TimelineEvent>();
  for (const e of [...initialEvents, ...liveEvents]) merged.set(e.id, e);
  const events = Array.from(merged.values()).sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  );

  const poll = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      const res = await fetch(`/api/audits/${auditId}/live`, {
        cache: "no-store",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        status: AuditStatus;
        events: TimelineEvent[];
      };
      setLastPollAt(Date.now());
      setCurrentStatus(body.status);
      mergeEvents(body.events);
      if (body.status === "ready") {
        router.refresh();
      }
    } finally {
      pollingRef.current = false;
    }
  }, [auditId, mergeEvents, router]);

  // Realtime — primary live stream. Polling is the silent backup.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`audit:${auditId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "audit_events",
          filter: `audit_id=eq.${auditId}`,
        },
        (payload) => {
          mergeEvents([payload.new as TimelineEvent]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "audits",
          filter: `id=eq.${auditId}`,
        },
        (payload) => {
          const row = payload.new as { status?: AuditStatus };
          if (row.status) {
            setCurrentStatus(row.status);
            if (row.status === "ready") router.refresh();
          }
        },
      )
      .subscribe((s) => setRealtimeConnected(s === "SUBSCRIBED"));

    return () => {
      supabase.removeChannel(channel);
    };
  }, [auditId, mergeEvents, router]);

  // Always poll while non-terminal — silent backup for Realtime drops.
  useEffect(() => {
    if (TERMINAL.includes(currentStatus)) return;
    void poll();
    const interval = setInterval(() => void poll(), POLL_MS);
    return () => clearInterval(interval);
  }, [currentStatus, poll]);

  const status = currentStatus;
  const seenPhases = new Set(events.map((e) => e.phase).filter(Boolean));
  const failed = status === "failed";
  const blocked = status === "blocked";
  const errorEvent = events.find(
    (e) => e.event_type === "error" || e.event_type === "cost_cap",
  );
  const isCostCap = errorEvent?.event_type === "cost_cap";
  const instagramSourceEvent = [...events]
    .reverse()
    .find((event) =>
      ["instagram_api", "instagram_api_fallback", "instagram_public_fallback"].includes(
        event.event_type,
      ),
    );
  const hasConnectedInstagramData = instagramSourceEvent?.event_type === "instagram_api";
  // Never render raw worker exceptions to clients. Historical rows may predate
  // server-side sanitisation, so the UI keeps generic errors generic too.
  const researchCacheEvent = [...events]
    .reverse()
    .find((event) => event.event_type === "research_cached");
  const errorDetail = isCostCap ? errorEvent?.detail || "" : "";
  const activeIndex = PHASE_STEPS.findIndex((s) => !seenPhases.has(s.phase));
  const isLiveStream =
    realtimeConnected &&
    lastEventAt !== null &&
    (lastPollAt ?? lastEventAt) - lastEventAt < 10_000;
  const isUpdating = !TERMINAL.includes(status) && !seenPhases.has("failed");
  const canRetry = (retryCount ?? 0) < MAX_RETRIES;
  const retryLabel = retryStatusLabel(retryCount ?? 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <StatusBadge status={status} />
        {isUpdating && (
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <RefreshCw className="size-3.5 animate-spin text-[color:var(--accent)]" />
            Auto-updating
              <>
                <span className="text-border">·</span>
                <Radio
                  className={`size-3.5 ${isLiveStream ? "text-[color:var(--green)]" : "text-muted-foreground"}`}
                />
                {isLiveStream ? "Live stream" : realtimeConnected ? "Realtime idle" : "Connecting…"}
              </>
            {lastPollAt && (
              <span className="hidden font-mono text-[10px] sm:inline">
                · synced {new Date(lastPollAt).toLocaleTimeString()}
              </span>
            )}
          </span>
        )}
      </div>

      {blocked && (
        <Banner
          tone="var(--red)"
          icon={<TriangleAlert className="size-4" />}
          title="This audit is blocked"
          body="A founder needs to review it before it can run. We'll reach out if anything's needed."
        />
      )}
      {failed && (
        <Banner
          tone="var(--red)"
          icon={<TriangleAlert className="size-4" />}
          title={isCostCap ? "Cost cap exceeded" : "Generation failed"}
          body={
            errorDetail
              ? errorDetail
              : isCostCap
                ? "Token usage exceeded the configured cap. A founder has been notified."
                : "Something went wrong during generation. A founder has been notified."
          }
          footer={
            (retryCount ?? 0) > 0
              ? canRetry
                ? `${retryLabel} — will retry automatically`
                : `${retryLabel} — maximum retries reached`
              : ""
          }
        />
      )}
      {status === "needs_review" && (
        <Banner
          tone="var(--amber)"
          icon={<CircleDashed className="size-4" />}
          title="Awaiting founder review"
          body="We couldn't detect which platform this handle belongs to. A founder will confirm the platform, then generation starts."
        />
      )}
      {status === "running" && (
        <Banner
          tone="var(--accent)"
          icon={<Loader2 className="size-4 animate-spin" />}
          title={(retryCount ?? 0) > 0 ? `Agent is working (retry ${retryCount})` : "Agent is working"}
          body="Most audits take about 1 to 3 minutes. This page updates automatically."
        />
      )}
      {instagramSourceEvent && (
        <Banner
          tone={hasConnectedInstagramData ? "var(--green)" : "var(--amber)"}
          icon={hasConnectedInstagramData ? <Check className="size-4" /> : <CircleDashed className="size-4" />}
          title={
            hasConnectedInstagramData
              ? "Connected Instagram data loaded"
              : "Using public Instagram signals"
          }
          body={instagramSourceEvent.detail}
        />
      )}
      {researchCacheEvent && (
        <Banner
          tone="var(--accent)"
          icon={<Check className="size-4" />}
          title="Research cache hit"
          body={researchCacheEvent.detail}
        />
      )}

      <ol className="relative space-y-0">
        {PHASE_STEPS.map((step, i) => {
          const done = seenPhases.has(step.phase);
          const isActive =
            !TERMINAL.includes(status) && i === activeIndex && !blocked;
          const event = [...events]
            .reverse()
            .find((e) => e.phase === step.phase);
          return (
            <li key={step.phase} className="flex gap-3 pb-5 last:pb-0">
              <div className="flex flex-col items-center">
                <span
                  className={`grid size-7 shrink-0 place-items-center rounded-full border transition-colors ${
                    done
                      ? "border-[color:var(--accent)] bg-[color:var(--accent)] text-white"
                      : isActive
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--accent)]"
                        : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  {done ? (
                    <Check className="size-3.5" />
                  ) : isActive ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <CircleDashed className="size-3.5" />
                  )}
                </span>
                {i < PHASE_STEPS.length - 1 && (
                  <span
                    className={`mt-1 w-px flex-1 ${done ? "bg-[color:var(--accent)]/40" : "bg-border"}`}
                  />
                )}
              </div>
              <div className={`pb-1 ${done || isActive ? "" : "opacity-55"}`}>
                <div className="flex items-center gap-2">
                  <h4 className="text-sm font-medium">{step.label}</h4>
                  {event && (
                    <span className="font-mono text-[10px] text-muted-foreground">
                      {new Date(event.created_at).toLocaleTimeString()}
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {event?.detail || step.blurb}
                </p>
              </div>
            </li>
          );
        })}
      </ol>

      {events.length > 0 && (
        <details className="rounded-[var(--radius)] border border-border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-xs font-medium text-muted-foreground">
            Full event log ({events.length})
          </summary>
          <ul className="border-t border-border px-4 py-3 text-xs">
            {events.map((e) => (
              <li
                key={e.id}
                className="flex gap-3 border-b border-border/60 py-1.5 last:border-0"
              >
                <span className="font-mono text-[10px] text-muted-foreground">
                  {new Date(e.created_at).toLocaleTimeString()}
                </span>
                <span className="font-medium">{e.event_type}</span>
                {e.detail && (
                  <span className="truncate text-muted-foreground">
                    {e.event_type === "error"
                      ? "Diagnostic details are available to founders."
                      : e.detail}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Banner({
  tone,
  icon,
  title,
  body,
  footer,
}: {
  tone: string;
  icon: React.ReactNode;
  title: string;
  body: string;
  footer?: string;
}) {
  return (
    <div
      className="flex gap-3 rounded-[var(--radius)] border px-4 py-3"
      style={{
        borderColor: `color-mix(in oklch, ${tone}, transparent 70%)`,
        background: `color-mix(in oklch, ${tone}, transparent 93%)`,
      }}
    >
      <span style={{ color: tone }}>{icon}</span>
      <div>
        <h4 className="text-sm font-medium" style={{ color: tone }}>
          {title}
        </h4>
        <p className="max-h-40 overflow-auto whitespace-pre-wrap text-xs text-muted-foreground">{body}</p>
        {footer && (
          <p className="mt-1 text-[10px] text-muted-foreground">{footer}</p>
        )}
      </div>
    </div>
  );
}
