import { notFound } from "next/navigation";
import { Metadata } from "next";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ImmersiveReport } from "@/components/immersive-report";

export const metadata: Metadata = {
  title: "Read Report — AuditLayerMedia",
};

export default async function ReadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: audit } = await supabase
    .from("audits")
    .select("id, user_id, status, handle, report_path")
    .eq("id", id)
    .maybeSingle();

  if (!audit) notFound();
  if (audit.user_id !== profile.id && profile.role !== "admin") notFound();
  if (audit.status !== "ready" || !audit.report_path) notFound();

  return (
    <ImmersiveReport
      reportUrl={`/api/audits/${id}/read`}
      backHref={`/audits/${id}`}
      backLabel={`@${audit.handle}`}
    />
  );
}
