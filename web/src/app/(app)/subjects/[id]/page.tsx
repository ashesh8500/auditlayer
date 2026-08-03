import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";

import { requireProfile } from "@/lib/auth";
import { SubjectHome } from "@/components/intelligence/subject-home";
import { getSubjectHomeBundle } from "@/lib/intelligence/subjects";

export const metadata = { title: "Subject — AuditLayerMedia" };

export default async function SubjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requireProfile();

  const liveBundle = await getSubjectHomeBundle(id);
  if (!liveBundle) notFound();

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
        <SubjectHome
          subjectId={liveBundle.subject.id}
          data={liveBundle}
        />
      </div>
    </main>
  );
}
