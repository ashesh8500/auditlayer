import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  USAGE_STATUSES,
  effectivePlanForProfile,
  type AuditStatus,
} from "@/lib/domain";
import { IntelligenceWizard } from "@/components/intelligence/intelligence-wizard";
import {
  listBriefVersionsForSubject,
  listSubjectsForUser,
  listChannelsForSubject,
} from "@/lib/intelligence/subjects";
import type {
  ChannelSummary,
  LivingBriefVersion,
} from "@/lib/intelligence/types";

export const metadata = { title: "New audit — AuditLayerMedia" };

export default async function NewAuditPage({
  searchParams,
}: {
  searchParams: Promise<{ subject?: string }>;
}) {
  const profile = await requireProfile();
  const { subject: subjectParam } = await searchParams;
  const supabase = await createClient();

  const { data: audits } = await supabase.from("audits").select("status");
  const usage = (audits ?? []).filter((a) =>
    USAGE_STATUSES.includes(a.status as AuditStatus),
  ).length;
  const limit = auditLimitForProfile(profile as any);

  // Server-side guard: bounce capped users to the dashboard's upgrade path.
  if (usage >= limit) redirect("/dashboard?billing=unconfigured");

  const plan = effectivePlanForProfile(profile as never);
  const { subjects, source } = await listSubjectsForUser();
  const channelsBySubject: Record<string, ChannelSummary[]> = {};
  const briefsBySubject: Record<string, LivingBriefVersion[]> = {};
  if (source === "live") {
    await Promise.all(
      subjects.map(async (subject) => {
        channelsBySubject[subject.id] = await listChannelsForSubject(subject.id);
        briefsBySubject[subject.id] = await listBriefVersionsForSubject(
          subject.id,
          subject.type,
        );
      }),
    );
  }

  const initialSubjectId =
    subjectParam &&
    subjects.some((s) => s.id === subjectParam) &&
    !subjectParam.startsWith("new-")
      ? subjectParam
      : undefined;

  return (
    <main className="alm-shell py-8 sm:py-12">
      <div className="mx-auto mb-8 max-w-2xl border-b border-border pb-6">
        <p className="alm-kicker">New audit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Build your intelligence batch.
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Choose a subject, select channels, review the brief, and submit —
          all in one atomic batch.
        </p>
      </div>
      <IntelligenceWizard
        plan={plan}
        initialSubjectId={initialSubjectId}
        initialSubjects={source === "live" ? subjects : undefined}
        initialChannelsBySubject={
          source === "live" ? channelsBySubject : undefined
        }
        initialBriefsBySubject={source === "live" ? briefsBySubject : undefined}
      />
    </main>
  );
}
