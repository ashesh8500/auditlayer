"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { Bot, Loader2, Send, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  createOperatorJob,
  sendOperatorMessage,
  type OperatorActionState,
} from "@/lib/actions/operator";

type Message = {
  id: string;
  role: string;
  content: string;
  created_at: string;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  approval_state: string;
  instruction: string;
  created_at: string;
};

const initial: OperatorActionState = { status: "idle" };

function Feedback({ state }: { state: OperatorActionState }) {
  if (state.status === "idle" || !state.message) return null;
  return (
    <p className={`text-xs ${state.status === "ok" ? "text-[color:var(--green)]" : "text-[color:var(--red)]"}`}>
      {state.message}
    </p>
  );
}

export function OperatorPanel({
  auditId,
  configured,
  messages,
  jobs,
}: {
  auditId: string;
  configured: boolean;
  messages: Message[];
  jobs: Job[];
}) {
  const router = useRouter();
  const messageForm = useRef<HTMLFormElement>(null);
  const jobForm = useRef<HTMLFormElement>(null);
  const [chatState, chatAction, chatting] = useActionState(sendOperatorMessage, initial);
  const [jobState, jobAction, jobbing] = useActionState(createOperatorJob, initial);

  useEffect(() => {
    if (chatState.status === "ok") {
      messageForm.current?.reset();
      router.refresh();
    }
  }, [chatState.status, router]);
  useEffect(() => {
    if (jobState.status === "ok") {
      jobForm.current?.reset();
      router.refresh();
    }
  }, [jobState.status, router]);

  return (
    <section className="rounded-[var(--radius)] border border-border bg-card">
      <header className="flex items-start gap-3 border-b border-border p-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-[color:var(--accent)]">
          <Bot className="size-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">ALM operator</h2>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Report-scoped discussion is read-only. Use a typed request below when you want work recorded.
          </p>
        </div>
      </header>

      <div className="max-h-[32rem] space-y-3 overflow-y-auto p-4">
        {messages.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No discussion yet. Ask about evidence, scoring, positioning, limitations, or presentation.
          </p>
        ) : (
          messages.map((message) => (
            <article
              key={message.id}
              className={`rounded-xl px-3 py-2 text-sm leading-relaxed ${
                message.role === "user"
                  ? "ml-6 bg-[color:var(--accent-muted)]"
                  : "mr-6 border border-border bg-background"
              }`}
            >
              <p className="whitespace-pre-wrap">{message.content}</p>
              <p className="mt-1 text-[10px] text-muted-foreground">
                {message.role === "user" ? "Admin" : "ALM"} · {new Date(message.created_at).toLocaleString()}
              </p>
            </article>
          ))
        )}
      </div>

      <form ref={messageForm} action={chatAction} className="space-y-3 border-t border-border p-4">
        <input type="hidden" name="auditId" value={auditId} />
        <Textarea
          name="message"
          rows={3}
          maxLength={4000}
          required
          disabled={!configured || chatting}
          placeholder={configured ? "Ask ALM about this report…" : "Operator connection is not configured yet."}
        />
        <div className="flex items-center justify-between gap-3">
          <Feedback state={chatState} />
          <Button type="submit" size="sm" disabled={!configured || chatting} className="ml-auto">
            {chatting ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            Ask ALM
          </Button>
        </div>
      </form>

      <form ref={jobForm} action={jobAction} className="space-y-3 border-t border-border bg-muted/30 p-4">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">
          <Wrench className="size-3.5" />
          Record a work request
        </div>
        <input type="hidden" name="auditId" value={auditId} />
        <select
          name="kind"
          required
          defaultValue="refinement"
          className="h-9 w-full rounded-md border border-border bg-background px-3 text-sm"
        >
          <option value="refinement">Report refinement</option>
          <option value="engineering">Product or engineering fix</option>
          <option value="operations">Production operation (approval required)</option>
        </select>
        <Textarea name="instruction" rows={2} maxLength={4000} required placeholder="State the outcome and acceptance criteria…" />
        <div className="flex items-center justify-between gap-3">
          <Feedback state={jobState} />
          <Button type="submit" size="sm" variant="outline" disabled={jobbing} className="ml-auto">
            {jobbing && <Loader2 className="size-4 animate-spin" />}
            Record request
          </Button>
        </div>
      </form>

      {jobs.length > 0 && (
        <div className="border-t border-border p-4">
          <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-muted-foreground">Recent requests</h3>
          <ul className="mt-2 space-y-2">
            {jobs.slice(0, 5).map((job) => (
              <li key={job.id} className="rounded-lg border border-border bg-background p-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium capitalize">{job.kind}</span>
                  <span className="text-muted-foreground">{job.status}{job.approval_state === "requested" ? " · approval requested" : ""}</span>
                </div>
                <p className="mt-1 line-clamp-2 text-muted-foreground">{job.instruction}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
