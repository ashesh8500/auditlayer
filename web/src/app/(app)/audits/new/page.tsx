import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  auditLimitForProfile,
  USAGE_STATUSES,
  type AuditStatus,
  type Plan,
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
  const limit = auditLimitForProfile(profile);

  // Server-side guard: bounce capped users to the dashboard's upgrade path.
  if (usage >= limit) redirect("/dashboard?billing=unconfigured");

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-12">
      <div className="mb-8">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[color:var(--accent)]">
          New audit
        </p>
      </div>
      <IntakeWizard plan={(profile.plan as Plan) || "free"} />
    </main>
  );
}
