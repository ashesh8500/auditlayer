import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  USAGE_STATUSES,
  type AuditStatus,
} from "@/lib/domain";
import { IntakeWizard } from "./wizard";

export const metadata = { title: "New audit — AuditLayer" };

export default async function NewAuditPage() {
  const profile = await requireProfile();
  const supabase = await createClient();

  const { data: audits } = await supabase.from("audits").select("status");
  const usage = (audits ?? []).filter((a) =>
    USAGE_STATUSES.includes(a.status as AuditStatus),
  ).length;
  const limit = auditLimitForProfile(profile);

  // Server-side guard: bounce capped users to the dashboard's upgrade path.
  if (usage >= limit) redirect("/dashboard?billing=unconfigured");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent)]">
          New audit
        </p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight">
          Three questions. One research-grade report.
        </h1>
      </div>
      <IntakeWizard />
    </main>
  );
}
