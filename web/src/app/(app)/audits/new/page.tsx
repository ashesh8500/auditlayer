import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  allowedReportTypesForProfile,
  USAGE_STATUSES,
  type AuditStatus,
} from "@/lib/domain";
import { IntakeWizard } from "./wizard";

export const metadata = { title: "New audit — AuditLayerMedia" };

export default async function NewAuditPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: audits } = await supabase.from("audits").select("status");
  const usage = (audits ?? []).filter((a) =>
    USAGE_STATUSES.includes(a.status as AuditStatus),
  ).length;
  const limit = auditLimitForProfile(profile as any);

  // Server-side guard: bounce capped users to the dashboard's upgrade path.
  if (usage >= limit) redirect("/dashboard?billing=unconfigured");

  return (
    <main className="alm-shell py-8 sm:py-12">
      <div className="mx-auto mb-8 max-w-2xl border-b border-border pb-6">
        <p className="alm-kicker">New audit</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">Set the research brief.</h1>
        <p className="mt-2 text-sm text-muted-foreground">Account, strategic goal, and optional context. Three short steps.</p>
      </div>
      <IntakeWizard reportTypes={allowedReportTypesForProfile(profile as never)} />
    </main>
  );
}
