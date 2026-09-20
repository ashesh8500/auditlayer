import Link from "next/link";
import { loadAuditAllowance } from "@/lib/allowance";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
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
  searchParams: Promise<{ subject?: string; account_id?: string; channel?: string }>;
}) {
  const profile = await requireProfile();
  const { subject: subjectParam, account_id: accountId, channel: channelParam } = await searchParams;
  const supabase = await createClient();

  const allowance = await loadAuditAllowance(supabase, profile.id);
  // Keep the form reachable for lost-response retries; the action recovers prior
  // commits before mutable allowance checks and SQL authoritatively reserves slots.
  const plan = allowance.effective_plan;
  const { subjects } = await listSubjectsForUser();

  let initialSubjectId =
    subjectParam &&
    subjects.some((s) => s.id === subjectParam) &&
    !subjectParam.startsWith("new-")
      ? subjectParam
      : undefined;

  let initialChannelId: string | undefined;
  let accountWarning: string | undefined;
  if (accountId) {
    const { data: account, error } = await supabase.from("accounts").select("id")
      .eq("id", accountId).eq("user_id", profile.id).maybeSingle();
    if (error) throw new Error("Account could not be loaded. Please retry.");
    if (account) {
      const { data: links, error: linkError } = await supabase.from("subject_channels")
        .select("id, subject_id").eq("account_id", account.id).order("id").limit(2);
      if (linkError) throw new Error("Account association could not be loaded. Please retry.");
      const owned = (links ?? []).filter((link) => subjects.some((subject) => subject.id === link.subject_id));
      if (owned.length === 1) { initialSubjectId = owned[0].subject_id; initialChannelId = owned[0].id; }
      else accountWarning = "This account has no unique subject association. Choose the intended subject and channel below.";
    } else accountWarning = "That account is not available in your workspace. Choose a subject below.";
  }

  // Only preload the selected subject — other subjects load on pick (snappy TTFB).
  const channelsBySubject: Record<string, ChannelSummary[]> = {};
  const briefsBySubject: Record<string, LivingBriefVersion[]> = {};
  if (initialSubjectId) {
    const subject = subjects.find((s) => s.id === initialSubjectId);
    if (subject) {
      const [channels, briefs] = await Promise.all([
        listChannelsForSubject(subject.id),
        listBriefVersionsForSubject(subject.id, subject.type),
      ]);
      channelsBySubject[subject.id] = channels;
      if (!initialChannelId && channelParam && channels.some((channel) => channel.id === channelParam)) initialChannelId = channelParam;
      if (initialChannelId && !channels.some((channel) => channel.id === initialChannelId)) {
        initialChannelId = undefined;
        accountWarning = "The selected channel is no longer available. Choose a current channel below.";
      }
      briefsBySubject[subject.id] = briefs;
    }
  }

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
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
      {accountWarning && <p role="status" className="mb-4">{accountWarning}</p>}
      {!allowance.can_submit && <p role="status" className="mb-4">
        {allowance.window_valid ? "Your current audit allowance is used." : "Your billing period is awaiting confirmation."}
        {" "}<Link href="/dashboard?billing=allowance" className="underline">Review your access</Link>. You can still retry an unconfirmed submission.
      </p>}
      <IntelligenceWizard
        plan={plan}
        entitledReportTypes={allowance.allowed_report_types}
        initialChannelId={initialChannelId}
        initialSubjectId={initialSubjectId}
        initialSubjects={subjects}
        initialChannelsBySubject={channelsBySubject}
        initialBriefsBySubject={briefsBySubject}
      />
    </main>
  );
}
