import type { Metadata } from "next";
import Link from "next/link";

import { PublicShell } from "@/components/public-shell";

export const metadata: Metadata = {
  title: "Privacy Policy — AuditLayerMedia",
  description: "How AuditLayerMedia collects, uses, and protects your data.",
};

export default function PrivacyPage() {
  return (
    <PublicShell>
    <main className="mx-auto max-w-3xl px-6 py-12 text-sm leading-relaxed text-foreground sm:py-16">
      <p className="alm-kicker">Privacy</p>
      <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em]">Privacy Policy</h1>
      <p className="mt-2 text-muted-foreground">Effective: July 20, 2026</p>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">1. What we collect</h2>
        <p>
          When you use AuditLayerMedia, we collect:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Your email address</strong> — to create and secure your account.
          </li>
          <li>
            <strong className="text-foreground">Social media handles</strong> — the public handles you submit for audit reports.
          </li>
          <li>
            <strong className="text-foreground">Optional context</strong> — any niche, goals, or competitor information you provide to calibrate your report.
          </li>
          <li>
            <strong className="text-foreground">Payment information</strong> — processed by our secure payment provider. We never see or store your credit card details.
          </li>
          <li>
            <strong className="text-foreground">Instagram connection data</strong> — if you connect a Business or Creator account, we retain the connection details and approved profile and content metrics needed for your reports.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">2. How we use it</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">To generate your audit reports.</strong>{" "}
            Your handle and context are used to create a strategic analysis of your social media presence.
          </li>
          <li>
            <strong className="text-foreground">To manage your account.</strong>{" "}
            Email is used for login, account recovery, and service-related notifications (not marketing).
          </li>
          <li>
            <strong className="text-foreground">To process payments.</strong>{" "}
            Our payment provider handles billing. We receive subscription status and plan information to manage your account tier.
          </li>
          <li>
            <strong className="text-foreground">To improve the product.</strong>{" "}
            We may analyze aggregate, anonymized usage patterns to improve report quality and user experience.
          </li>
        </ul>
        <p>
          We do <strong>not</strong> sell your data, share it with advertisers, or use it for any purpose not directly related to providing the AuditLayerMedia service.
        </p>
      </section>

      <section id="instagram-data" className="mt-8 scroll-mt-24 space-y-4">
        <h2 className="text-base font-semibold">3. Instagram data use</h2>
        <p className="text-muted-foreground">
          Connecting Instagram is optional. If you connect a Business or Creator account, we use the profile and recent-content data you approve only to provide verified metrics, account progression, and strategic reports for you.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>We cannot publish, edit, comment, follow, unfollow, send messages, or manage advertising.</li>
          <li>Your connection credentials are protected and are never exposed to another customer.</li>
          <li>Connected Instagram data is associated only with your AuditLayerMedia account.</li>
          <li>Disconnecting removes the saved connection immediately.</li>
        </ul>
        <p>
          See the <Link href="/data-deletion" className="text-[color:var(--accent)] hover:underline">Instagram and account data deletion instructions</Link>.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">4. Service providers</h2>
        <p className="text-muted-foreground">
          We use carefully selected service providers to operate AuditLayerMedia, process payments, deliver essential account emails, protect your account, and store your reports. They may process only the information needed to provide those services and may not use it for their own advertising.
        </p>
        <p className="text-muted-foreground">
          If you connect Instagram, Instagram processes the connection and approved account data under its{" "}
          <a href="https://privacycenter.instagram.com/policy" className="text-[color:var(--accent)] hover:underline" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">5. Cookies</h2>
        <p>
          We use essential cookies to operate the service:
        </p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Authentication cookies</strong> — to keep you signed in securely.
          </li>
          <li>
            <strong className="text-foreground">Share link cookies</strong> — to remember verified share link sessions (30 days).
          </li>
          <li>
            <strong className="text-foreground">Trial invitation cookies</strong> — to remember an invitation during signup (7 days).
          </li>
        </ul>
        <p>
          We do <strong>not</strong> use analytics cookies, tracking pixels, or advertising identifiers.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">6. Data retention</h2>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <strong className="text-foreground">Account data</strong> — retained for the life of your account. You can request deletion at any time.
          </li>
          <li>
            <strong className="text-foreground">Audit reports</strong> — retained while your account is active. Reports are stored securely and are accessible only to you and the AuditLayerMedia team.
          </li>
          <li>
            <strong className="text-foreground">Instagram connection data</strong> — retained until you disconnect Instagram, revoke access, request deletion, or the connection can no longer be used.
          </li>
          <li>
            <strong className="text-foreground">Payment records</strong> — retained as required by our payment provider and applicable financial regulations.
          </li>
        </ul>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">7. Your rights</h2>
        <p className="text-muted-foreground">
          You may request access to your personal data, ask us to correct inaccuracies, or request deletion of your account and associated data. 
          Email us at{" "}
          <a href="mailto:support@auditlayermedia.com" className="text-[color:var(--accent)] hover:underline">
            support@auditlayermedia.com
          </a>{" "}
          and we'll respond within 10 business days.
        </p>
      </section>

      <section className="mt-8 space-y-4">
        <h2 className="text-base font-semibold">8. Contact</h2>
        <p className="text-muted-foreground">
          For privacy questions or data requests:{" "}
          <a href="mailto:support@auditlayermedia.com" className="text-[color:var(--accent)] hover:underline">
            support@auditlayermedia.com
          </a>
        </p>
      </section>

    </main>
    </PublicShell>
  );
}
