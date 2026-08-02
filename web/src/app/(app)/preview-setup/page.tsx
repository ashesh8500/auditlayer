import { redirect } from "next/navigation";

import { requireProfile } from "@/lib/auth";
import {
  isPreviewLoginAllowed,
  isPreviewTesterEmail,
} from "@/lib/env";
import type { Plan } from "@/lib/domain";
import { PreviewSetupForm } from "./preview-setup-form";

export const metadata = { title: "Preview tester setup — AuditLayerMedia" };

export default async function PreviewSetupPage() {
  const profile = await requireProfile();

  if (!isPreviewLoginAllowed() || !isPreviewTesterEmail(profile.email)) {
    redirect("/subjects");
  }

  return (
    <main className="alm-shell py-8 sm:py-12">
      <div className="mx-auto max-w-2xl">
        <p className="alm-kicker">Preview only</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.04em]">
          Tester setup
        </h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          Configure plan entitlements and demo subjects for user-story QA.
          Signed in as {profile.email}. Current plan:{" "}
          <span className="font-mono text-foreground">{profile.plan}</span>.
        </p>

        <div className="mt-8">
          <PreviewSetupForm currentPlan={profile.plan as Plan} />
        </div>
      </div>
    </main>
  );
}
