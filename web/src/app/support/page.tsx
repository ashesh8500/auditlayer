import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/public-shell";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: "Support — AuditLayerMedia",
  description: "Get help with your AuditLayerMedia account, reports, billing, or Instagram connection.",
};

export default function SupportPage() {
  return (
    <PublicShell>
      <main className="alm-shell py-12 sm:py-16">
        <div className="grid gap-10 lg:grid-cols-[0.75fr_1.25fr] lg:gap-16">
          <div>
            <p className="alm-kicker">Support</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Get help from the team.</h1>
            <p className="mt-4 max-w-md text-sm leading-6 text-muted-foreground">
              Tell us what happened and include the account handle or report URL when relevant. We normally reply within one business day.
            </p>
            <div id="instagram" className="mt-8 border-l-2 border-[color:var(--accent)] bg-[color:var(--accent-muted)] p-5">
              <h2 className="font-semibold">Instagram connection help</h2>
              <ul className="mt-3 list-disc space-y-2 pl-5 text-xs leading-5 text-muted-foreground">
                <li>Use an Instagram Business or Creator account. A Facebook Page is not required.</li>
                <li>Approve the read-only profile and media permission shown by Instagram.</li>
                <li>If the session expired, return to Accounts or Reports and start the connection again.</li>
                <li>Disconnecting deletes the stored access token immediately.</li>
              </ul>
              <Link href="/data-deletion" className="mt-4 inline-block text-xs font-semibold text-[color:var(--accent)] hover:underline">
                Instagram data deletion instructions
              </Link>
            </div>
          </div>

          <div>
            <div className="alm-panel p-6 sm:p-8">
              <SupportForm />
            </div>
            <div className="mt-6 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
              <div className="alm-panel p-4">
                <p className="font-semibold text-foreground">Audit still running?</p>
                <p className="mt-1 leading-5">Most audits are ready in 6–8 minutes. Contact us if the status has not changed after 15 minutes.</p>
              </div>
              <div className="alm-panel p-4">
                <p className="font-semibold text-foreground">Account or billing?</p>
                <p className="mt-1 leading-5">Include the email on the account. Never send passwords, access tokens, or card details.</p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
