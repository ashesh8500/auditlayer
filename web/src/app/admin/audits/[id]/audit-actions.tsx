"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  approveAudit,
  requeueAudit,
  blockAudit,
  addAuditNote,
  uploadManualReport,
  type AdminActionState,
} from "@/lib/actions/admin";

const initial: AdminActionState = { status: "idle" };

function Feedback({ state }: { state: AdminActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p
      className={`text-xs ${state.status === "ok" ? "text-[color:var(--green)]" : "text-[color:var(--red)]"}`}
    >
      {state.message}
    </p>
  );
}

export function AuditActions({
  auditId,
  status,
}: {
  auditId: string;
  status: string;
}) {
  const [approveState, approve, approving] = useActionState(approveAudit, initial);
  const [requeueState, requeue, requeuing] = useActionState(requeueAudit, initial);
  const [blockState, block, blocking] = useActionState(blockAudit, initial);
  const [noteState, note, noting] = useActionState(addAuditNote, initial);
  const [uploadState, upload, uploading] = useActionState(
    uploadManualReport,
    initial,
  );

  const canApprove = status === "needs_review" || status === "blocked";
  const canRequeue = status === "failed" || status === "ready";

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Approve */}
        <form
          action={approve}
          className="rounded-[var(--radius)] border border-border bg-card p-4"
        >
          <input type="hidden" name="auditId" value={auditId} />
          <h4 className="text-sm font-semibold">Approve & queue</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Clear this audit to run on the worker.
          </p>
          <Input
            name="note"
            placeholder="Optional approval note"
            className="mt-3 h-9"
          />
          <Button
            type="submit"
            size="sm"
            disabled={approving || !canApprove}
            className="mt-3 w-full"
          >
            {approving && <Loader2 className="size-4 animate-spin" />}
            Approve
          </Button>
          <div className="mt-2">
            <Feedback state={approveState} />
          </div>
        </form>

        {/* Block */}
        <form
          action={block}
          className="rounded-[var(--radius)] border border-border bg-card p-4"
        >
          <input type="hidden" name="auditId" value={auditId} />
          <h4 className="text-sm font-semibold">Block</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Stop this audit. Requires a clear founder note.
          </p>
          <Input
            name="note"
            placeholder="Why is this blocked?"
            className="mt-3 h-9"
          />
          <Button
            type="submit"
            size="sm"
            variant="destructive"
            disabled={blocking}
            className="mt-3 w-full"
          >
            {blocking && <Loader2 className="size-4 animate-spin" />}
            Block audit
          </Button>
          <div className="mt-2">
            <Feedback state={blockState} />
          </div>
        </form>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {/* Note */}
        <form
          action={note}
          className="rounded-[var(--radius)] border border-border bg-card p-4"
        >
          <input type="hidden" name="auditId" value={auditId} />
          <h4 className="text-sm font-semibold">Add note</h4>
          <Textarea
            name="note"
            rows={2}
            placeholder="Internal founder note…"
            className="mt-3"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={noting}
            className="mt-3 w-full"
          >
            {noting && <Loader2 className="size-4 animate-spin" />}
            Save note
          </Button>
          <div className="mt-2">
            <Feedback state={noteState} />
          </div>
        </form>

        {/* Re-queue */}
        <form
          action={requeue}
          className="rounded-[var(--radius)] border border-border bg-card p-4"
        >
          <input type="hidden" name="auditId" value={auditId} />
          <h4 className="text-sm font-semibold">Re-queue</h4>
          <p className="mt-1 text-xs text-muted-foreground">
            Send a failed or completed audit back for another run.
          </p>
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={requeuing || !canRequeue}
            className="mt-3 w-full"
          >
            {requeuing && <Loader2 className="size-4 animate-spin" />}
            Re-queue audit
          </Button>
          <div className="mt-2">
            <Feedback state={requeueState} />
          </div>
        </form>
      </div>

      {/* Manual upload */}
      <form
        action={upload}
        className="rounded-[var(--radius)] border border-[color:var(--accent)]/30 bg-[color:var(--accent-muted)] p-4"
      >
        <input type="hidden" name="auditId" value={auditId} />
        <h4 className="text-sm font-semibold">Manual report upload</h4>
        <p className="mt-1 text-xs text-muted-foreground">
          Attach a hand-built HTML report (e.g. generated with Hermes directly).
          Stored privately and marked ready for the client.
        </p>
        <div className="mt-3 space-y-1.5">
          <Label htmlFor="manual-file">HTML file</Label>
          <input
            id="manual-file"
            type="file"
            name="file"
            accept="text/html,.html,.htm"
            className="block w-full text-xs file:mr-3 file:rounded-md file:border-0 file:bg-[color:var(--accent)] file:px-3 file:py-1.5 file:text-xs file:font-medium file:text-white"
          />
        </div>
        <Button type="submit" size="sm" disabled={uploading} className="mt-3">
          {uploading && <Loader2 className="size-4 animate-spin" />}
          Upload & mark ready
        </Button>
        <div className="mt-2">
          <Feedback state={uploadState} />
        </div>
      </form>
    </div>
  );
}
