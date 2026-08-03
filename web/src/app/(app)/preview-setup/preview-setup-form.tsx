"use client";

import { useActionState } from "react";
import { FlaskConical, Loader2, RefreshCw } from "lucide-react";

import {
  reseedPreviewDemoSubjects,
  setPreviewTesterPlan,
  type PreviewTesterActionState,
} from "@/lib/actions/preview-tester";
import type { Plan } from "@/lib/domain";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

const idle: PreviewTesterActionState = { status: "idle" };

const PLAN_OPTIONS: { value: Plan; label: string; blurb: string }[] = [
  { value: "free", label: "Free", blurb: "Pulse only" },
  { value: "starter", label: "Starter", blurb: "Pulse + Standard" },
  { value: "pro", label: "Pro", blurb: "Standard + Extended + Blueprint" },
  { value: "enterprise", label: "Enterprise", blurb: "All report types" },
];

export function PreviewSetupForm({ currentPlan }: { currentPlan: Plan }) {
  const [planState, planAction, planPending] = useActionState(
    setPreviewTesterPlan,
    idle,
  );
  const [seedState, seedAction, seedPending] = useActionState(
    reseedPreviewDemoSubjects,
    idle,
  );

  return (
    <div className="space-y-8">
      <section className="border border-border bg-card p-5 sm:p-6">
        <div className="flex items-start gap-3">
          <FlaskConical className="mt-0.5 size-5 text-[color:var(--accent)]" />
          <div>
            <h2 className="text-lg font-semibold tracking-[-0.03em]">
              Plan entitlement
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Change the preview tester plan so report-type gates match the
              story you are testing. Production never shows this panel.
            </p>
          </div>
        </div>

        <form action={planAction} className="mt-5 space-y-4">
          <Label htmlFor="plan" className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Active plan
          </Label>
          <select
            id="plan"
            name="plan"
            defaultValue={currentPlan}
            className="h-11 w-full border border-border bg-background px-3 text-sm"
          >
            {PLAN_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label} — {opt.blurb}
              </option>
            ))}
          </select>
          <Button type="submit" disabled={planPending} className="font-medium">
            {planPending && <Loader2 className="size-4 animate-spin" />}
            Apply plan
          </Button>
          {planState.status === "ok" && (
            <p className="text-sm text-[color:var(--green)]">{planState.message}</p>
          )}
          {planState.status === "error" && (
            <p className="text-sm text-[color:var(--red)]">{planState.message}</p>
          )}
        </form>
      </section>

      <section className="border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold tracking-[-0.03em]">
          Demo subjects
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Refreshes <strong>AuditLayerMedia</strong> (live @auditlayermedia
          Instagram + auditlayermedia.com), plus demos Narin Fazlalipour and
          GlowState Wellness. Prior demos are archived — Living Briefs cannot be
          deleted.
        </p>
        <form action={seedAction} className="mt-5">
          <Button
            type="submit"
            variant="outline"
            disabled={seedPending}
            className="font-medium"
          >
            {seedPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <RefreshCw className="size-4" />
            )}
            Reseed demo subjects
          </Button>
          {seedState.status === "ok" && (
            <p className="mt-3 text-sm text-[color:var(--green)]">
              {seedState.message}
            </p>
          )}
          {seedState.status === "error" && (
            <p className="mt-3 text-sm text-[color:var(--red)]">
              {seedState.message}
            </p>
          )}
        </form>
      </section>
    </div>
  );
}
