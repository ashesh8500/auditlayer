import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { SampleReportPreview } from "@/components/sample-report-preview";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Sample Report — AuditLayerMedia",
  description: "Explore a fictional AuditLayerMedia report structure from diagnosis to action plan.",
};

export default function SamplePage() {
  return (
    <PublicShell>
      <main className="alm-shell py-12 sm:py-16">
        <div className="mx-auto max-w-4xl">
          <div className="max-w-2xl">
            <p className="alm-kicker">Product demonstration</p>
            <h1 className="mt-3 text-4xl font-semibold tracking-[-0.045em] sm:text-5xl">See how an audit becomes a decision.</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">This fictional sample demonstrates the report hierarchy without presenting invented results as client proof. Explore the diagnosis, same-tier benchmark, and ranked action plan.</p>
          </div>

          <div className="mt-10">
            <SampleReportPreview full />
          </div>

          <div className="mt-10 flex flex-col items-start justify-between gap-5 border-y border-border py-6 sm:flex-row sm:items-center">
            <div><p className="font-semibold">Run the focused version on your account.</p><p className="mt-1 text-xs text-muted-foreground">Two free Pulse runs. No credit card.</p></div>
            <Button asChild size="lg" className="min-h-11 px-5"><Link href="/login">Run a Free Pulse Audit <ArrowRight className="size-4" /></Link></Button>
          </div>
        </div>
      </main>
    </PublicShell>
  );
}
