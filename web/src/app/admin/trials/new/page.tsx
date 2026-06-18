import Link from "next/link";
import { ArrowLeft } from "lucide-react";

import { createAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/env";
import { CreateTrialForm } from "./create-trial-form";

export default async function AdminTrialNewPage() {
  if (!isSupabaseAdminConfigured()) {
    return (
      <main className="mx-auto w-full max-w-xl px-6 py-10 text-sm text-muted-foreground">
        Service-role key required to create trial links.
      </main>
    );
  }

  return (
    <main className="mx-auto w-full max-w-xl px-6 py-10">
      <Link
        href="/admin/trials"
        className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-3.5" />
        Back to trials
      </Link>

      <h1 className="mt-4 text-2xl font-bold tracking-tight">
        Create trial link
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Generate a link that grants free audits on signup.
      </p>

      <div className="mt-8 rounded-[var(--radius)] border border-border bg-card p-6">
        <CreateTrialForm />
      </div>
    </main>
  );
}
