"use client";

import React, { useActionState } from "react";
import { workflowCommand, type WorkflowCommandState } from "@/lib/actions/workflows";
import type { WorkflowResourceView } from "@/lib/workflows/dto";

type Workflow = WorkflowResourceView["workflows"][number];
type Occurrence = Workflow["occurrences"][number];
type Delivery = Occurrence["deliveries"][number];

const money = (value: { microusd: number } | undefined) => `$${((value?.microusd ?? 0) / 1_000_000).toFixed(2)}`;
const timestamp = (value: string | null | undefined, timeZone: string) =>
  !value ? "not scheduled" : new Intl.DateTimeFormat("en-US", { timeZone, dateStyle: "medium", timeStyle: "short" }).format(new Date(value));

const pauseCopy: Record<string, string> = {
  insufficient_credit: "Paused (insufficient credit): available credit is below this workflow's reservation. No paid work is running.",
  model_unavailable: "Paused (model unavailable): the pinned model is not qualified, so no provider calls are being made.",
  execution_unavailable: "Paused (execution unavailable): the quoted-run execution queue is not configured. Nothing was queued and nothing was charged.",
  confirmed_context_required: "Paused (confirmed context required): confirm a Brand Context version before the next update.",
  permission_revoked: "Paused (permission revoked): a required permission was revoked. No further runs, sends or artifact access.",
};

function WorkflowRow({ row }: { row: Workflow }) {
  const [state, action] = useActionState<WorkflowCommandState, FormData>(workflowCommand, { status: "idle" });
  const rows: Occurrence[] = Array.isArray(row?.occurrences) ? row.occurrences : [];
  return (
    <article className="border p-4 flex flex-col gap-3">
      <h2 className="font-semibold">{String(row?.objective ?? "")}</h2>
      <p className="text-sm">
        {String(row?.status ?? "")} · {String(row?.timezone ?? "")} {String(row?.local_time ?? "")}
        {row?.weekday === null || row?.weekday === undefined ? " daily" : ` weekday ${row.weekday}`} · next{" "}
        {timestamp(row?.next_at, "UTC")} UTC ({timestamp(row?.next_at, String(row?.timezone ?? "UTC"))} local)
      </p>
      {row?.pause_reason ? <p role="status">{pauseCopy[String(row.pause_reason)] ?? `Paused: ${String(row.pause_reason)}.`}</p> : null}
      <ul className="text-sm">
        <li>{row?.run_granted ? "Run allowed" : "Run not authorized"}</li>
        <li>{row?.schedule_granted ? "Schedule authorized" : "Schedule not authorized"}</li>
        <li>{Array.isArray(row?.delivery_granted) && row.delivery_granted.length ? `${row.delivery_granted.length} recipient authorized` : "No recipient authorized"}</li>
        <li>Review before send: required</li>
        <li>Model {String(row?.model?.model ?? "")} ({String(row?.model?.provider ?? "")}) · rate {String(row?.rate_card_version ?? "")} · method {String(row?.method_version ?? "")}</li>
        <li>Ceilings {money(row?.customer_max)} customer / {money(row?.upstream_max)} upstream</li>
      </ul>
      <form action={action} className="flex gap-2">
        <input type="hidden" name="workflow_id" value={String(row?.id ?? "")} />
        <input type="hidden" name="version_id" value={String(row?.version_id ?? "")} />
        <button name="command" value="pause" type="submit">Pause</button>
        <button name="command" value="activate" type="submit">Resume after grants</button>
        <button name="command" value="cancel" type="submit">Cancel</button>
      </form>
      {state.status === "error" ? <p role="alert">{state.message}</p> : null}
      {state.status === "ok" ? <p role="status">{state.message}</p> : null}
      {rows.map((occurrence) => (
        <div key={String(occurrence?.id ?? "")} className="border-t pt-2 text-sm">
          <p>
            Occurrence {timestamp(occurrence?.scheduled_at, "UTC")} UTC · {String(occurrence?.state ?? "")} · context{" "}
            {String(occurrence?.context_version_id ?? "").slice(0, 8)} · version {String(occurrence?.version_id ?? "").slice(0, 8)}
          </p>
          <p>{occurrence?.artifact_version_id ? `Reviewed artifact ${String(occurrence.artifact_version_id).slice(0, 8)} ready for recipient review.` : "No cited update to review yet."}</p>
          {(Array.isArray(occurrence?.deliveries) ? occurrence.deliveries : []).map((delivery: Delivery) => (
            <p key={String(delivery?.id ?? "")}>
              {delivery?.status === "sent"
                ? "Delivered"
                : delivery?.status === "reconciling"
                  ? "reconciling — provider acceptance is unconfirmed; the artifact link stays revocable"
                  : `delivery ${String(delivery?.status ?? "")}`}
              {delivery?.sent_at ? ` ${timestamp(delivery.sent_at, "UTC")} UTC` : ""}
            </p>
          ))}
        </div>
      ))}
    </article>
  );
}

/**
 * Owner surface for the single saved brand-review workflow. Only whitelisted
 * fields are rendered: provider receipts, storage paths and recipient emails
 * never leave the server.
 */
export function WorkflowOwner({ ownerId, resource }: { ownerId: string; resource: WorkflowResourceView }) {
  const visible: Workflow[] = Array.isArray(resource?.workflows) ? resource.workflows : [];
  return (
    <section className="alm-shell flex flex-col gap-6 py-8" aria-label="Saved brand reviews">
      <header className="flex flex-col gap-1">
        <h1 className="text-xl font-semibold">Brand reviews</h1>
        <p className="text-sm">
          One saved review per brand. Saving does not start a run, a schedule or a send — run, schedule and recipient permissions are separate decisions.
        </p>
      </header>
      {visible.length === 0 ? <p className="text-sm">No saved brand review yet. Draft one from a brand&apos;s page.</p> : null}
      {visible.map((row, index) => (
        <WorkflowRow key={String(row?.id ?? index)} row={row} />
      ))}
      <p className="text-xs">
        Owner scope {String(ownerId).slice(0, 8)}. Permissions and recipient grants are re-checked on every read and immediately before any send.
      </p>
    </section>
  );
}
