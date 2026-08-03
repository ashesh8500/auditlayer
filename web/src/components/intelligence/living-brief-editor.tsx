"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2, Save, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { saveLivingBriefVersionAction } from "@/lib/actions/intelligence";
import { emptyBriefContent } from "@/lib/intelligence/brief-project";
import type {
  LivingBriefContent,
  SubjectType,
} from "@/lib/intelligence/types";
import { BRIEF_EDIT_FIELDS } from "@/components/intelligence/living-brief-view";

export function LivingBriefEditor({
  subjectId,
  subjectType,
  initial,
  onCancel,
}: {
  subjectId: string;
  subjectType: SubjectType;
  initial: LivingBriefContent | null;
  onCancel: () => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<LivingBriefContent>(
    () => initial ?? emptyBriefContent(subjectType),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const update = (key: keyof LivingBriefContent, value: string) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
  };

  const save = () => {
    setError(null);
    startTransition(async () => {
      const result = await saveLivingBriefVersionAction({
        subjectId,
        content: { ...draft, subjectType },
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
      onCancel();
    });
  };

  return (
    <div className="space-y-5 border border-border bg-card p-5 shadow-[var(--shadow)]">
      <div>
        <h3 className="text-base font-semibold">Edit Living Brief</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Update the strategy behind future audits. Saving creates a new
          version — past reports stay unchanged.
        </p>
      </div>

      <div className="grid gap-4">
        {BRIEF_EDIT_FIELDS.map(({ key, label, hint, rows }) => (
          <div key={key} className="space-y-1.5">
            <Label
              htmlFor={`brief-${key}`}
              className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
            >
              {label}
            </Label>
            {hint ? (
              <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
            <Textarea
              id={`brief-${key}`}
              value={String(draft[key] ?? "")}
              onChange={(e) => update(key, e.target.value)}
              rows={rows}
              className="resize-y border border-border p-3 text-sm"
            />
          </div>
        ))}
      </div>

      {error && <p className="text-sm text-[color:var(--red)]">{error}</p>}

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={save}
          disabled={pending}
          className="font-semibold"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Save className="size-4" />
          )}
          Save new version
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onCancel}
          disabled={pending}
        >
          <X className="size-4" />
          Cancel
        </Button>
      </div>
    </div>
  );
}
