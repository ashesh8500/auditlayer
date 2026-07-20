import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Data Deletion — AuditLayerMedia",
  description: "How to disconnect Instagram and request deletion of AuditLayerMedia account data.",
};

export default function DataDeletionPage() {
  return (
    <PublicShell>
      <main className="alm-shell py-12 sm:py-16">
        <div className="mx-auto max-w-3xl">
          <p className="alm-kicker">Privacy control</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Delete your Instagram connection or account data.</h1>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">Last updated July 20, 2026</p>

          <div className="mt-10 space-y-6">
            <section className="alm-panel p-6 sm:p-8">
              <p className="font-mono text-xs text-[color:var(--accent)]">01</p>
              <h2 className="mt-3 text-xl font-semibold">Disconnect Instagram immediately</h2>
              <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 text-muted-foreground">
                <li>Sign in to AuditLayerMedia.</li>
                <li>Open Accounts or Reports and find the Instagram connection panel.</li>
                <li>Select <strong className="text-foreground">Disconnect and delete access</strong>.</li>
              </ol>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">This deletes the stored Instagram access token and connection metadata from AuditLayerMedia. Future reports use public signals unless you reconnect.</p>
            </section>

            <section className="alm-panel p-6 sm:p-8">
              <p className="font-mono text-xs text-[color:var(--accent)]">02</p>
              <h2 className="mt-3 text-xl font-semibold">Request full account deletion</h2>
              <p className="mt-4 text-sm leading-6 text-muted-foreground">
                Email <a className="font-semibold text-[color:var(--accent)] hover:underline" href="mailto:support@auditlayermedia.com?subject=AuditLayerMedia%20data%20deletion%20request">support@auditlayermedia.com</a> from the address used for your account with the subject “AuditLayerMedia data deletion request.” We will verify ownership, delete the account and associated reports, connections and profile data, and confirm completion within 10 business days.
              </p>
            </section>

            <section className="border-l-2 border-[color:var(--accent)] bg-[color:var(--accent-muted)] p-5 text-sm leading-6">
              Revoking AuditLayerMedia in Instagram or Meta settings also stops future API access. To ensure the copy stored by AuditLayerMedia is removed, use the in-product disconnect action or send the deletion request above.
            </section>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            See the complete <Link href="/privacy" className="text-[color:var(--accent)] hover:underline">Privacy Policy</Link> or <Link href="/support" className="text-[color:var(--accent)] hover:underline">contact support</Link>.
          </p>
        </div>
      </main>
    </PublicShell>
  );
}
