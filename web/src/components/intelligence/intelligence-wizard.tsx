"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  Globe,
  Loader2,
  Plus,
  Search,
  Sparkles,
  AlertTriangle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

import type {
  SubjectSummary,
  ChannelSummary,
  ChannelPlatform,
  LivingBriefVersion,
  BatchAuditRequest,
  BatchSubmission,
  SubjectType,
} from "@/lib/intelligence/types";
import {
  estimateBatchDuration,
  validateBatch,
} from "@/lib/intelligence/batch";
import { prepareAndSubmitIntelligenceBatch } from "@/lib/actions/intelligence";
import { allowedReportTypes, type Plan } from "@/lib/domain";
import { LivingBriefView } from "@/components/intelligence/living-brief-view";
import {
  canonicalizeWebsiteLocator,
  channelDedupeKey,
  displayWebsiteHost,
  inputLooksLikeWebsite,
  suggestChannelsForInput,
} from "@/lib/intelligence/channel-locator";

type BatchReportType = "pulse" | "standard" | "extended" | "blueprint";

const PlatformIcon = ({ platform }: { platform: ChannelPlatform }) => {
  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
      </svg>
    );
  }
  if (platform === "website") return <Globe className="size-4 shrink-0" />;
  if (platform === "tiktok") {
    return (
      <svg className="size-4 shrink-0" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.6-4.09-1.51l-.09-.08v7.44c.01 4.54-3.56 8.16-8.1 8.16-3.88 0-7.3-2.73-8.1-6.52-.96-4.51 2.3-8.8 6.81-9.76.62-.13 1.25-.2 1.88-.2 1.34-.01 2.68.01 4.02-.03.01.21.01.42.01.62-.02 1.2-.01 2.4-.02 3.6-1.15.11-2.34-.23-3.23-.97-.99-.81-1.49-2.09-1.34-3.34.09-1.28.79-2.45 1.86-3.11.95-.59 2.1-.79 3.2-.62.59.09 1.16.32 1.63.69-.02.16-.03.32-.05.48h.04z" />
      </svg>
    );
  }
  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-4 shrink-0">
        <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42a29 29 0 0 0-.46 5.33a29 29 0 0 0 .46 5.33a2.78 2.78 0 0 0 1.94 2C4.72 19.6 11.6 19.6 11.6 19.6s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2a29 29 0 0 0 .46-5.25a29 29 0 0 0-.46-5.33z" />
        <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
      </svg>
    );
  }
  return <Search className="size-4 shrink-0" />;
};

interface NewAuditState {
  subjectId: string;
  newSubjectName: string;
  newSubjectType: SubjectType;
  selectedChannelIds: string[];
  newWebsiteUrl: string;
  changeNotes: string;
  batchRequests: BatchAuditRequest[];
  reportType: BatchReportType;
}

function defaultReportTypeForPlan(plan: Plan): BatchReportType {
  const allowed = allowedReportTypes(plan);
  if (allowed.includes("standard")) return "standard";
  return (allowed[0] ?? "pulse") as BatchReportType;
}

function initialWizardState(
  plan: Plan,
  initialSubjectId?: string,
): NewAuditState {
  return {
    subjectId: initialSubjectId ?? "",
    newSubjectName: "",
    newSubjectType: "creator",
    selectedChannelIds: [],
    newWebsiteUrl: "",
    changeNotes: "",
    batchRequests: [],
    reportType: defaultReportTypeForPlan(plan),
  };
}

export function IntelligenceWizard({
  plan,
  initialSubjectId,
  initialSubjects = [],
  initialChannelsBySubject = {},
  initialBriefsBySubject = {},
}: {
  plan: Plan;
  /** Pre-select this subject (e.g. from /audits/new?subject=…). */
  initialSubjectId?: string;
  initialSubjects?: SubjectSummary[];
  initialChannelsBySubject?: Record<string, ChannelSummary[]>;
  initialBriefsBySubject?: Record<string, LivingBriefVersion[]>;
}) {
  const router = useRouter();
  const [step, setStep] = useState(() => (initialSubjectId ? 1 : 0));
  const [state, setState] = useState<NewAuditState>(() =>
    initialWizardState(plan, initialSubjectId),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitNotice, setSubmitNotice] = useState<string | null>(null);

  const baseSubjects = useMemo(() => initialSubjects, [initialSubjects]);
  const subjects = useMemo(() => {
    if (state.subjectId.startsWith("new-") && state.newSubjectName) {
      return [
        {
          id: state.subjectId,
          name: state.newSubjectName,
          type: state.newSubjectType,
          avatarUrl: null,
          channelCount: 0,
          lastAuditAt: null,
        } satisfies SubjectSummary,
        ...baseSubjects,
      ];
    }
    return baseSubjects;
  }, [baseSubjects, state.newSubjectName, state.newSubjectType, state.subjectId]);

  const channels = useMemo(() => {
    if (!state.subjectId || state.subjectId.startsWith("new-")) return [];
    return initialChannelsBySubject[state.subjectId] ?? [];
  }, [state.subjectId, initialChannelsBySubject]);

  const briefVersions = useMemo(() => {
    if (!state.subjectId || state.subjectId.startsWith("new-")) return [];
    return initialBriefsBySubject[state.subjectId] ?? [];
  }, [state.subjectId, initialBriefsBySubject]);
  const currentBrief = briefVersions[0] ?? null;

  const effectiveChannels = useMemo(() => {
    const list = [...channels];
    const pending = state.newWebsiteUrl.trim();
    if (pending) {
      const canonical = canonicalizeWebsiteLocator(pending);
      const already = list.some(
        (c) =>
          c.platform === "website" &&
          channelDedupeKey("website", c.url || "") ===
            channelDedupeKey("website", canonical),
      );
      if (!already && canonical) {
        list.push({
          id: "pending-website",
          platform: "website",
          handle: "",
          url: canonical,
          ownershipStatus: "managed",
          displayName: displayWebsiteHost(canonical),
          avatarUrl: null,
          connected: false,
          subjectId: state.subjectId || "pending",
        });
      }
    }
    return list;
  }, [channels, state.newWebsiteUrl, state.subjectId]);

  const validation = useMemo(() => {
    if (state.batchRequests.length === 0) return null;
    const submission: BatchSubmission = {
      subjectId: state.subjectId,
      briefVersionId: currentBrief?.id ?? "",
      changeNotes: state.changeNotes,
      requests: state.batchRequests,
    };
    return validateBatch(submission, effectiveChannels, plan);
  }, [
    state.batchRequests,
    state.subjectId,
    state.changeNotes,
    currentBrief?.id,
    effectiveChannels,
    plan,
  ]);

  const update = (patch: Partial<NewAuditState>) =>
    setState((s) => ({ ...s, ...patch }));

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    setSubmitNotice(null);

    const submission: BatchSubmission = {
      subjectId: state.subjectId,
      briefVersionId: currentBrief?.id ?? "",
      changeNotes: state.changeNotes,
      requests: state.batchRequests,
    };

    const check = validateBatch(submission, effectiveChannels, plan);
    if (!check.valid) {
      setSubmitError(
        check.errors[0] ??
          check.review.entitlementWarnings[0] ??
          "Batch is invalid.",
      );
      setSubmitting(false);
      return;
    }

    const channelMeta = state.batchRequests.map((req) => {
      const ch = effectiveChannels.find((c) => c.id === req.channelId);
      const locator = ch?.url || (ch?.handle ? `@${ch.handle}` : req.channelId);
      return {
        locator,
        channelType: (ch?.platform ?? "instagram") as ChannelPlatform,
        channelId: req.channelId,
      };
    });
    const locators = channelMeta.map((c) => c.locator);

    const outcome = await prepareAndSubmitIntelligenceBatch({
      submission,
      channelLocators: locators,
      channelMeta,
      newSubjectName: state.newSubjectName || undefined,
      newSubjectType: state.newSubjectType,
    });
    setSubmitting(false);

    if (!outcome.ok) {
      setSubmitError(outcome.error);
      return;
    }

    setSubmitNotice(`Batch submitted — opening progress…`);
    const progressId = outcome.auditIds[0];
    if (progressId) {
      router.push(`/audits/${progressId}`);
      return;
    }
    router.push(`/subjects/${outcome.subjectId}`);
  };

  return (
    <div className="mx-auto max-w-2xl space-y-8">
      <Stepper step={step} labels={["Subject", "Channels", "Lens", "Batch"]} />

      {step === 0 && (
        <SubjectStep
          subjects={subjects}
          selectedId={state.subjectId}
          newName={state.newSubjectName}
          newType={state.newSubjectType}
          onSelect={(id) => {
            update({
              subjectId: id,
              newSubjectName: "",
              selectedChannelIds: [],
              batchRequests: [],
              newWebsiteUrl: "",
            });
          }}
          onCreateDraft={(name, type) => {
            const id = `new-${name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .slice(0, 24)}`;
            update({
              subjectId: id,
              newSubjectName: name,
              newSubjectType: type,
              selectedChannelIds: [],
              batchRequests: [],
              newWebsiteUrl: "",
            });
          }}
          onNext={() => setStep(1)}
        />
      )}

      {step === 1 && (
        <ChannelStep
          channels={effectiveChannels}
          selectedIds={state.selectedChannelIds}
          newWebsiteUrl={state.newWebsiteUrl}
          onToggleChannel={(id) => {
            const next = state.selectedChannelIds.includes(id)
              ? state.selectedChannelIds.filter((cid) => cid !== id)
              : [...state.selectedChannelIds, id];
            update({ selectedChannelIds: next });
          }}
          onWebsiteUrlChange={(url) => update({ newWebsiteUrl: url })}
          onPickSuggestedChannel={(id) => {
            const next = state.selectedChannelIds.includes(id)
              ? state.selectedChannelIds
              : [...state.selectedChannelIds, id];
            update({ selectedChannelIds: next, newWebsiteUrl: "" });
          }}
          onNext={() => {
            const ids = [...state.selectedChannelIds];
            if (
              state.newWebsiteUrl.trim() &&
              !ids.includes("pending-website")
            ) {
              const canonical = canonicalizeWebsiteLocator(
                state.newWebsiteUrl,
              );
              const match = channels.find(
                (c) =>
                  c.platform === "website" &&
                  channelDedupeKey("website", c.url || "") ===
                    channelDedupeKey("website", canonical),
              );
              if (match) {
                if (!ids.includes(match.id)) ids.push(match.id);
              } else if (canonical) {
                ids.push("pending-website");
              }
            }
            const requests: BatchAuditRequest[] = ids.map((cid) => ({
              channelId: cid,
              reportType: state.reportType,
              forceRefresh: false,
            }));
            update({ selectedChannelIds: ids, batchRequests: requests });
            setStep(2);
          }}
          onBack={() => setStep(0)}
        />
      )}

      {step === 2 && (
        <LensStep
          subjectId={state.subjectId}
          currentBrief={currentBrief}
          changeNotes={state.changeNotes}
          onChangeNotes={(notes) => update({ changeNotes: notes })}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      )}

      {step === 3 && (
        <BatchStep
          batchRequests={state.batchRequests}
          channels={effectiveChannels}
          validation={validation}
          onAddChannel={(channelId) => {
            update({
              batchRequests: [
                ...state.batchRequests,
                {
                  channelId,
                  reportType: state.reportType,
                  forceRefresh: false,
                },
              ],
            });
          }}
          onRemoveRequest={(index) => {
            update({
              batchRequests: state.batchRequests.filter((_, i) => i !== index),
            });
          }}
          onSubmit={handleSubmit}
          submitting={submitting}
          submitError={submitError}
          submitNotice={submitNotice}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  );
}

function Stepper({ step, labels }: { step: number; labels: string[] }) {
  return (
    <ol
      aria-label="Audit setup progress"
      className="mx-auto flex items-center gap-2 border-y border-border bg-card px-2 py-3.5 sm:gap-4 sm:px-4"
    >
      {labels.map((label, i) => {
        const isCompleted = i < step;
        const isActive = i === step;
        return (
          <li key={label} className="flex flex-1 items-center gap-2.5">
            <span
              className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-all duration-300 ${
                isCompleted
                  ? "bg-[color:var(--green)] text-white"
                  : isActive
                    ? "bg-[color:var(--accent)] text-white shadow-sm ring-2 ring-[color:var(--accent)]/15"
                    : "border border-border bg-white text-muted-foreground"
              }`}
            >
              {isCompleted ? <Check className="size-3.5 stroke-[3]" /> : i + 1}
            </span>
            <span
              className={`hidden text-xs sm:inline ${
                isActive
                  ? "font-bold text-foreground"
                  : isCompleted
                    ? "font-semibold text-muted-foreground"
                    : "font-medium text-muted-foreground/80"
              }`}
            >
              {label}
            </span>
            {i < labels.length - 1 && (
              <span className="h-px flex-1 bg-border/60" />
            )}
          </li>
        );
      })}
    </ol>
  );
}

function SubjectStep({
  subjects,
  selectedId,
  newName,
  newType,
  onSelect,
  onCreateDraft,
  onNext,
}: {
  subjects: SubjectSummary[];
  selectedId: string;
  newName: string;
  newType: SubjectType;
  onSelect: (id: string) => void;
  onCreateDraft: (name: string, type: SubjectType) => void;
  onNext: () => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [draftName, setDraftName] = useState(newName);
  const [draftType, setDraftType] = useState<SubjectType>(newType);

  const canContinue =
    Boolean(selectedId) || (showNew && draftName.trim().length >= 2);

  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">Choose a subject</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          A subject is a person, creator, brand, organisation, or project. Each
          subject can own multiple channels.
        </p>
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Your subjects
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {subjects
            .filter((s) => !s.id.startsWith("new-") || s.id === selectedId)
            .map((subj) => (
              <button
                key={subj.id}
                type="button"
                onClick={() => onSelect(subj.id)}
                className={`flex items-center gap-3 border p-4 text-left transition-all alm-focus ${
                  selectedId === subj.id
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] shadow-sm"
                    : "border-border bg-card hover:border-[color:var(--accent)]/30"
                }`}
              >
                <div className="grid size-10 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-sm font-semibold text-[color:var(--accent)]">
                  {subj.name.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{subj.name}</p>
                  <p className="text-xs capitalize text-muted-foreground">
                    {subj.type} · {subj.channelCount} channel
                    {subj.channelCount === 1 ? "" : "s"}
                  </p>
                </div>
                {selectedId === subj.id && (
                  <CheckCircle2 className="ml-auto size-4 shrink-0 text-[color:var(--accent)]" />
                )}
              </button>
            ))}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowNew(!showNew)}
        className="flex w-full items-center gap-2 border border-dashed border-border p-4 text-left text-sm text-muted-foreground transition-colors hover:border-[color:var(--accent)]/40 hover:text-foreground"
      >
        <Plus className="size-4" />
        {showNew ? "Cancel" : "Create a new subject"}
      </button>

      {showNew && (
        <div className="space-y-3 border border-border bg-card p-4 animate-in fade-in duration-200">
          <Label
            htmlFor="new-subject-name"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Subject name
          </Label>
          <Input
            id="new-subject-name"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            placeholder="e.g., Narin Fazlalipour, GlowState Wellness"
            className="h-11 text-sm"
          />
          <Label
            htmlFor="new-subject-type"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Subject type
          </Label>
          <select
            id="new-subject-type"
            value={draftType}
            onChange={(e) => setDraftType(e.target.value as SubjectType)}
            className="h-11 w-full border border-border bg-background px-3 text-sm"
          >
            <option value="creator">Creator</option>
            <option value="person">Person</option>
            <option value="brand">Brand</option>
            <option value="organization">Organization</option>
            <option value="project">Project</option>
          </select>
          {draftName.trim().length >= 2 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onCreateDraft(draftName.trim(), draftType)}
            >
              Use this subject
            </Button>
          )}
        </div>
      )}

      <div className="flex justify-end pt-2">
        <Button
          type="button"
          onClick={() => {
            if (
              showNew &&
              draftName.trim().length >= 2 &&
              !selectedId
            ) {
              onCreateDraft(draftName.trim(), draftType);
            }
            onNext();
          }}
          disabled={!canContinue}
          className="h-11 px-5 font-semibold"
        >
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function ChannelStep({
  channels,
  selectedIds,
  newWebsiteUrl,
  onToggleChannel,
  onWebsiteUrlChange,
  onPickSuggestedChannel,
  onNext,
  onBack,
}: {
  channels: ChannelSummary[];
  selectedIds: string[];
  newWebsiteUrl: string;
  onToggleChannel: (id: string) => void;
  onWebsiteUrlChange: (url: string) => void;
  onPickSuggestedChannel: (id: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const managed = channels.filter(
    (c) => c.ownershipStatus !== "observed" && c.id !== "pending-website",
  );
  const suggestions = suggestChannelsForInput(newWebsiteUrl, managed);
  const exactWebsiteMatch =
    inputLooksLikeWebsite(newWebsiteUrl) &&
    suggestions.find(
      (s) =>
        s.platform === "website" &&
        channelDedupeKey("website", s.url || "") ===
          channelDedupeKey("website", newWebsiteUrl),
    );
  const canContinue =
    selectedIds.some((id) => id !== "pending-website") ||
    (newWebsiteUrl.trim().length > 0 && !exactWebsiteMatch);

  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">Choose channels</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          Select which channels to audit. Connected channels use live data;
          managed channels use public research.
        </p>
      </div>

      {managed.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Connected &amp; managed channels
          </p>
          <div className="grid gap-2">
            {managed.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onToggleChannel(ch.id)}
                className={`flex items-center gap-3 border p-3 text-left transition-all alm-focus ${
                  selectedIds.includes(ch.id)
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)]"
                    : "border-border bg-card hover:border-[color:var(--accent)]/30"
                }`}
              >
                <PlatformIcon platform={ch.platform} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {ch.displayName || ch.handle || ch.url}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ch.platform === "website"
                      ? displayWebsiteHost(ch.url || "")
                      : `@${ch.handle}`}
                    {" · "}
                    {ch.connected ? "Connected — live data" : "Public research"}
                  </p>
                </div>
                {selectedIds.includes(ch.id) && (
                  <CheckCircle2 className="size-4 shrink-0 text-[color:var(--accent)]" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {channels.some((c) => c.ownershipStatus === "observed") && (
        <div className="rounded-[var(--radius)] border-l-[3px] border-[color:var(--blue)] bg-[color:var(--blue-muted)] px-4 py-3">
          <p className="text-xs text-[color:var(--blue)]">
            Previously observed targets are not part of your managed workspace.
            Connect or promote them to include them in audits.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="website-url"
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          Add a website or handle
        </Label>
        <Input
          id="website-url"
          value={newWebsiteUrl}
          onChange={(e) => onWebsiteUrlChange(e.target.value)}
          placeholder="auditlayermedia.com or @handle"
          className="h-11 text-sm"
          autoComplete="off"
        />
        {suggestions.length > 0 && (
          <ul className="border border-border bg-card divide-y divide-border">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm hover:bg-[var(--surface-muted)]"
                  onClick={() => onPickSuggestedChannel(s.id)}
                >
                  <PlatformIcon platform={s.platform} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {s.displayName || s.handle || s.url}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Already in workspace — select
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {exactWebsiteMatch && (
          <p className="text-xs text-[color:var(--accent)]">
            That site is already on this subject. Use the match above instead of
            adding a duplicate.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-11 font-semibold"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          disabled={!canContinue}
          className="h-11 px-5 font-semibold"
        >
          Continue
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function LensStep({
  subjectId,
  currentBrief,
  changeNotes,
  onChangeNotes,
  onNext,
  onBack,
}: {
  subjectId: string;
  currentBrief: LivingBriefVersion | null;
  changeNotes: string;
  onChangeNotes: (notes: string) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const canLinkSubject =
    Boolean(subjectId) && !subjectId.startsWith("new-");

  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">
          Set the strategy for this audit
        </h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          This audit will use the current Living Brief to prioritize what
          matters. Review it here; edit strategy on the subject page if it has
          changed.
        </p>
      </div>

      {currentBrief ? (
        <div className="border border-border bg-card p-5 shadow-[var(--shadow)]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Using Living Brief · v{currentBrief.version}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">Active lens</Badge>
              {canLinkSubject && (
                <Link
                  href={`/subjects/${subjectId}`}
                  className="text-xs font-semibold text-[color:var(--accent)] hover:underline"
                >
                  Edit Living Brief
                </Link>
              )}
            </div>
          </div>
          <div className="mt-4">
            <LivingBriefView content={currentBrief.content} />
          </div>
        </div>
      ) : (
        <div className="border border-dashed border-border p-6 text-center space-y-3">
          <p className="text-sm text-muted-foreground">
            No Living Brief yet. A default brief will be created from your
            subject and channel data — or set strategy first on the subject
            page.
          </p>
          {canLinkSubject && (
            <Link
              href={`/subjects/${subjectId}`}
              className="inline-block text-sm font-semibold text-[color:var(--accent)] hover:underline"
            >
              Create Living Brief on subject
            </Link>
          )}
        </div>
      )}

      <div className="space-y-2">
        <Label
          htmlFor="change-notes"
          className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
        >
          What changed since your last audit? (optional)
        </Label>
        <Textarea
          id="change-notes"
          value={changeNotes}
          onChange={(e) => onChangeNotes(e.target.value)}
          rows={3}
          placeholder="e.g., Launched a new coaching offer, shifted to 3 posts/week..."
          className="resize-none border border-border p-4 text-sm shadow-sm focus-visible:ring-1 focus-visible:ring-[color:var(--accent)]"
        />
      </div>

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-11 font-semibold"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onNext}
          className="h-11 px-5 font-semibold"
        >
          Review batch
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </section>
  );
}

function BatchStep({
  batchRequests,
  channels,
  validation,
  onAddChannel,
  onRemoveRequest,
  onSubmit,
  submitting,
  submitError,
  submitNotice,
  onBack,
}: {
  batchRequests: BatchAuditRequest[];
  channels: ChannelSummary[];
  validation: ReturnType<typeof validateBatch> | null;
  onAddChannel: (channelId: string) => void;
  onRemoveRequest: (index: number) => void;
  onSubmit: () => Promise<void>;
  submitting: boolean;
  submitError: string | null;
  submitNotice: string | null;
  onBack: () => void;
}) {
  const channelById = useMemo(
    () => new Map(channels.map((c) => [c.id, c])),
    [channels],
  );

  const availableChannels = channels.filter(
    (c) =>
      c.ownershipStatus !== "observed" &&
      c.id !== "pending-website" &&
      !batchRequests.some((r) => r.channelId === c.id),
  );

  const review = validation?.review ?? null;
  const REPORT_TYPE_SHORT_LABELS: Record<BatchReportType, string> = {
    pulse: "Pulse",
    standard: "Standard",
    extended: "Extended",
    blueprint: "Blueprint",
  };

  return (
    <section className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl font-bold tracking-tight">Review &amp; submit</h2>
        <p className="text-sm leading-relaxed text-muted-foreground">
          All audits in a batch are submitted together atomically.
        </p>
      </div>

      {batchRequests.length === 0 ? (
        <div className="border border-dashed border-border p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No channels selected for this batch.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-border border-y border-border">
          {batchRequests.map((req, i) => {
            const ch = channelById.get(req.channelId);
            return (
              <li
                key={`${req.channelId}-${i}`}
                className="flex items-center gap-3 py-3"
              >
                <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[color:var(--accent-muted)] text-xs font-semibold text-[color:var(--accent)]">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {ch?.displayName ||
                      ch?.handle ||
                      ch?.url ||
                      "Unknown channel"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ch?.platform === "website" ? "Website" : `@${ch?.handle}`}
                    {" · "}
                    {REPORT_TYPE_SHORT_LABELS[req.reportType]}
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onRemoveRequest(i)}
                  className="h-8 text-xs text-muted-foreground"
                >
                  Remove
                </Button>
              </li>
            );
          })}
        </ul>
      )}

      {availableChannels.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Add another channel
          </p>
          <div className="flex flex-wrap gap-2">
            {availableChannels.map((ch) => (
              <button
                key={ch.id}
                type="button"
                onClick={() => onAddChannel(ch.id)}
                className="inline-flex items-center gap-1.5 border border-dashed border-border px-3 py-2 text-xs text-muted-foreground transition-colors hover:border-[color:var(--accent)]/40 hover:text-foreground"
              >
                <Plus className="size-3" />
                {ch.displayName || ch.handle || ch.url}
              </button>
            ))}
          </div>
        </div>
      )}

      {review && (
        <div className="border border-border bg-card p-5 shadow-[var(--shadow)]">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Batch summary
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Audits in batch
              </p>
              <p className="text-sm font-semibold">{review.auditCount}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground">
                Estimated duration
              </p>
              <p className="text-sm font-semibold">
                {estimateBatchDuration(review.auditCount)}
              </p>
            </div>
          </div>

          {review.duplicateChannelNames.length > 0 && (
            <div className="mt-3 flex items-start gap-2 rounded bg-[color:var(--amber-muted)] px-3 py-2 text-xs text-[color:var(--amber)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>
                {review.duplicateChannelNames.join(", ")} already has an active
                audit. Duplicates will be skipped.
              </span>
            </div>
          )}
          {review.entitlementWarnings.length > 0 && (
            <div className="mt-2 flex items-start gap-2 rounded bg-[color:var(--red-muted)] px-3 py-2 text-xs text-[color:var(--red)]">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
              <span>{review.entitlementWarnings[0]}</span>
            </div>
          )}
        </div>
      )}

      {submitError && (
        <div className="rounded-[var(--radius)] border border-[color:var(--red)]/30 bg-[color:var(--red-muted)] px-4 py-3 text-xs leading-relaxed text-[color:var(--red)]">
          {submitError}
        </div>
      )}
      {submitNotice && (
        <div className="rounded-[var(--radius)] border border-[color:var(--blue)]/30 bg-[color:var(--blue-muted)] px-4 py-3 text-xs leading-relaxed text-[color:var(--blue)]">
          {submitNotice}
        </div>
      )}

      <div className="flex justify-between pt-2">
        <Button
          type="button"
          variant="ghost"
          onClick={onBack}
          className="h-11 font-semibold"
        >
          <ArrowLeft className="size-4" />
          Back
        </Button>
        <Button
          type="button"
          onClick={onSubmit}
          disabled={
            submitting ||
            batchRequests.length === 0 ||
            (validation != null && !validation.valid)
          }
          className="h-11 px-5 font-semibold"
        >
          {submitting ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Submitting batch...
            </>
          ) : (
            <>
              <Sparkles className="size-4" />
              Submit {batchRequests.length} audit
              {batchRequests.length === 1 ? "" : "s"}
            </>
          )}
        </Button>
      </div>
    </section>
  );
}
