import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { SubjectHome } from "@/components/intelligence/subject-home";
import { listSubjectsForUser } from "@/lib/intelligence/subjects";
import { fixtureSubjects } from "@/lib/intelligence/fixtures";

export const metadata = { title: "Subject — AuditLayerMedia" };

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();

  const { subjects, source } = await listSubjectsForUser();
  const liveMatch = subjects.find((s) => s.id === id);
  const fixtureMatch = fixtureSubjects().some((s) => s.id === id);
  const subjectId =
    liveMatch?.id ??
    (fixtureMatch ? id : subjects[0]?.id ?? fixtureSubjects()[0]?.id ?? id);
  const fixtureMode = source === "fixture" || !liveMatch;

  return (
    <main className="alm-shell py-8 sm:py-12 animate-page-in">
      <Link
        href="/subjects"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        All subjects
      </Link>
      <div className="mt-5">
        <SubjectHome subjectId={subjectId} fixtureMode={fixtureMode} />
      </div>
    </main>
  );
}
