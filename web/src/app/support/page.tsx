import type { Metadata } from "next";
import Link from "next/link";
import { SupportForm } from "./support-form";

export const metadata: Metadata = {
  title: "Support — AuditLayerMedia",
  description: "Get help with your AuditLayerMedia account, reports, or billing.",
};

export default function SupportPage() {
  return (
    <main className="mx-auto max-w-lg px-6 py-16 text-sm text-foreground">
      <Link
        href="/"
        className="mb-8 inline-block text-xs text-[color:var(--accent)] hover:underline"
      >
        ← Back to AuditLayerMedia
      </Link>

      <h1 className="text-2xl font-bold tracking-tight">Support</h1>
      <p className="mt-2 text-muted-foreground">
        Something not working? Have a question? We'll get back to you within 24 hours.
      </p>

      <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-6">
        <SupportForm />
      </div>

      <div className="mt-8 space-y-2 rounded-[var(--radius)] border border-border bg-muted/40 p-5 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Common questions</p>
        <ul className="mt-1 space-y-1.5">
          <li>
            <strong className="text-foreground">Report taking too long?</strong>{" "}
            Most reports complete in 3-5 minutes. If it's been over 15 minutes, send us the handle and we'll check.
          </li>
          <li>
            <strong className="text-foreground">Wrong plan or billing?</strong>{" "}
            Include the email on your account and we'll fix it.
          </li>
          <li>
            <strong className="text-foreground">Need to delete your account?</strong>{" "}
            Email us with your account email and we'll handle it.
          </li>
        </ul>
      </div>
    </main>
  );
}
