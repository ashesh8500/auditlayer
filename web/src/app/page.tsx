import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  FileSearch,
  LockKeyhole,
  Route,
  ShieldCheck,
  UserRoundCheck,
} from "lucide-react";

import { PublicShell } from "@/components/public-shell";
import { SampleReportPreview } from "@/components/sample-report-preview";
import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

const REPORT_ANSWERS = [
  ["01", "Diagnosis", "Where the account stands across content, growth, engagement, brand, and conversion — plus the structural issue limiting reach, trust, or audience action."],
  ["02", "Competitive context", "Relevant same-tier accounts that reveal a credible gap, with benchmark scores and format comparisons that explain where the difference comes from."],
  ["03", "Action plan", "A ranked next-week execution plan with formats, angles, owners, and measurable checkpoints for the next 30 and 90 days."],
  ["04", "Revenue move", "The commercial action that fits the audience and current maturity, timed to land when trust and engagement are strongest."],
] as const;

const PRICING = [
  {
    name: "Pulse",
    price: "Free",
    cadence: "",
    note: "One focused decision-ready diagnostic",
    features: ["Six-dimension score", "Primary constraint", "Three immediate moves"],
    cta: "Run a Free Pulse Audit",
    featured: false,
  },
  {
    name: "Starter",
    price: "$30",
    cadence: "/ month",
    note: "5 complete reports per month",
    features: ["15-section intelligence report", "Same-tier peer benchmarking", "7-day and 90-day plans", "One refinement"],
    cta: "Choose Starter",
    featured: true,
  },
  {
    name: "Pro",
    price: "$50",
    cadence: "/ month",
    note: "15 extended reports per month",
    features: ["Everything in Starter", "Extended content diagnosis", "Competitor deep-dives", "Two refinements"],
    cta: "Choose Pro",
    featured: false,
  },
] as const;

export default async function Home() {
  const user = await getSession();
  if (user) redirect("/accounts");

  return (
    <PublicShell>
      <main>
        <section className="alm-shell grid min-h-[calc(100vh-4rem)] items-center gap-10 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-20">
          <div className="max-w-xl">
            <p className="alm-kicker">Competitive intelligence for health, wellness, and expert-led brands</p>
            <h1 className="mt-5 text-[clamp(3.2rem,8vw,6.9rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
              Know what to do <span className="text-[color:var(--accent)]">next.</span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              See where your account stands, what is limiting growth, which peers prove the gap, and the next actions to take.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="min-h-11 px-5">
                <Link href="/login">Run a Free Pulse Audit <ArrowRight className="size-4" /></Link>
              </Button>
              <Button asChild size="lg" variant="outline" className="min-h-11 px-5">
                <Link href="/sample">View a Sample Report</Link>
              </Button>
            </div>
            <div className="mt-9 grid grid-cols-3 border-y border-border py-4 font-mono text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <span><b className="block text-lg text-foreground">6</b>dimensions</span>
              <span><b className="block text-lg text-foreground">15</b>sections</span>
              <span><b className="block text-lg text-foreground">90</b>day path</span>
            </div>
          </div>

          <div id="sample" className="scroll-mt-24">
            <SampleReportPreview />
          </div>
        </section>

        <section aria-label="Product trust" className="border-y border-border bg-card/60">
          <div className="alm-shell grid gap-px bg-border sm:grid-cols-3">
            {[
              [LockKeyhole, "Private reports", "Owner-scoped access and controlled share links."],
              [ShieldCheck, "Evidence with limits", "Collection limits stay visible instead of being hidden."],
              [UserRoundCheck, "Human calibration", "Media strategy shapes the diagnosis, not a generic analytics template."],
            ].map(([Icon, title, body]) => {
              const TrustIcon = Icon as typeof LockKeyhole;
              return <div key={title as string} className="bg-card px-5 py-6"><TrustIcon className="size-5 text-[color:var(--accent)]" /><h2 className="mt-4 text-sm font-semibold">{title as string}</h2><p className="mt-1 text-xs leading-5 text-muted-foreground">{body as string}</p></div>;
            })}
          </div>
        </section>

        <section id="method" className="scroll-mt-16 border-y border-border bg-[color:var(--forest)] py-20 text-white">
          <div className="alm-shell">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
              <div><p className="alm-kicker text-[color:var(--teal-on-forest)]">Evidence → diagnosis → decision</p><h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">Research that ends in a decision.</h2><p className="mt-5 max-w-lg text-sm leading-6 text-white/70">The report is the product. Every layer moves from observable signal to strategic implication to an action someone can own.</p></div>
              <div className="grid gap-px bg-white/15 sm:grid-cols-3">
                {[
                  [FileSearch, "Observe", "Public content, approved account metrics, and format patterns."],
                  [BarChart3, "Calibrate", "Scores and same-tier comparisons with limitations attached."],
                  [Route, "Act", "A ranked next-week plan and measurable trajectory."],
                ].map(([Icon, title, body]) => {
                  const MethodIcon = Icon as typeof FileSearch;
                  return <article key={title as string} className="bg-[color:var(--forest)] p-6"><MethodIcon className="size-5 text-[color:var(--teal-on-forest)]" /><h3 className="mt-8 text-lg font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-white/65">{body as string}</p></article>;
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="alm-shell py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div><p className="alm-kicker">Inside every report</p><h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]">The answers that matter. No dashboard theater.</h2><p className="mt-5 text-sm leading-6 text-muted-foreground">The report is designed to be read, discussed, and used. Every section moves from evidence to implication to action.</p></div>
            <div className="grid border-l border-t border-border sm:grid-cols-2">
              {REPORT_ANSWERS.map(([number, title, body]) => <article key={number} className="border-b border-r border-border bg-card p-5 sm:p-6"><span className="font-mono text-xs text-[color:var(--accent)]">{number}</span><h3 className="mt-7 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></article>)}
            </div>
          </div>
          <div className="mt-12 flex flex-col items-start justify-between gap-5 border-y border-border py-6 sm:flex-row sm:items-center">
            <div><p className="text-sm font-semibold">Start with the focused diagnosis.</p><p className="mt-1 text-xs text-muted-foreground">No credit card. Upgrade only when the reports earn their keep.</p></div>
            <Button asChild className="min-h-11 px-5"><Link href="/login">Run a Free Pulse Audit <ArrowRight className="size-4" /></Link></Button>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 border-y border-border bg-[color:var(--panel)] py-20">
          <div className="alm-shell">
            <div className="max-w-2xl"><p className="alm-kicker">Pricing</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">Start with a Pulse. Upgrade for depth.</h2><p className="mt-4 text-muted-foreground">The free Pulse identifies the decision. Paid plans add complete evidence, peer context, execution detail, and refinements.</p></div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {PRICING.map((tier) => <article key={tier.name} className={`flex min-h-[24rem] flex-col border p-6 ${tier.featured ? "border-[color:var(--forest)] bg-[color:var(--forest)] text-white shadow-[var(--shadow-lg)]" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">{tier.name}</h3>{tier.featured && <span className="font-mono text-xs uppercase tracking-widest text-[color:var(--teal-on-forest)]">Most popular</span>}</div>
                <div className="mt-9"><b className="font-mono text-4xl">{tier.price}</b><span className={`text-xs ${tier.featured ? "text-white/60" : "text-muted-foreground"}`}>{tier.cadence}</span><p className={`mt-2 text-xs ${tier.featured ? "text-white/60" : "text-muted-foreground"}`}>{tier.note}</p></div>
                <ul className="mt-8 flex-1 space-y-3">{tier.features.map(feature => <li key={feature} className={`flex gap-2 text-sm ${tier.featured ? "text-white/80" : "text-muted-foreground"}`}><Check className="mt-0.5 size-4 shrink-0 text-[color:var(--accent)]" />{feature}</li>)}</ul>
                <Button asChild variant={tier.featured ? "secondary" : "outline"} className="mt-8 min-h-11 w-full"><Link href="/login">{tier.cta}</Link></Button>
              </article>)}
            </div>
          </div>
        </section>

        <section className="alm-shell grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div><p className="alm-kicker">What to expect</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">Evidence with its limits attached.</h2><div className="mt-8 flex gap-4 border-t border-border pt-5"><ShieldCheck className="size-5 shrink-0 text-[color:var(--accent)]" /><p className="text-sm leading-6 text-muted-foreground">AuditLayerMedia uses public information and approved account data. Reports state collection limitations and confidence context rather than filling gaps with invented certainty.</p></div></div>
          <div className="space-y-2">
            {[
              ["How long does an audit take?", "Most reports are ready in 6–8 minutes. Status pages show the real worker phase while research is running."],
              ["Which platforms are supported?", "Instagram, TikTok, and YouTube are the primary supported platforms. Data access varies by account and platform."],
              ["Can I connect Instagram without a Facebook Page?", "Yes. Business and Creator accounts connect directly through Instagram Business Login with read-only access."],
              ["Can I share the report?", "Yes. Ready reports can be read in the focused reader and shared through controlled links."],
            ].map(([question, answer]) => <details key={question} className="group border-b border-border bg-card"><summary className="alm-focus flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium"><span>{question}</span><ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" /></summary><p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">{answer}</p></details>)}
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
