import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  Compass,
  FileSearch,
  Layers3,
  Rocket,
  Route,
  ShieldCheck,
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

        <section id="method" className="scroll-mt-16 border-y border-border bg-[color:var(--panel)] py-20 sm:py-28">
          <div className="alm-shell">
            <div className="grid gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:items-start lg:gap-20">
              <div className="max-w-lg">
                <p className="alm-kicker">The method</p>
                <h2 className="mt-4 text-4xl font-semibold leading-[1.08] tracking-[-0.05em] sm:text-5xl">
                  From signal to a decision you can use.
                </h2>
                <p className="mt-6 text-base leading-7 text-muted-foreground">
                  We separate what can be observed from what must be interpreted. Then we rank the actions most likely to change the account.
                </p>
                <p className="mt-8 font-mono text-xs uppercase tracking-[0.1em] text-[color:var(--accent)]">
                  Evidence → diagnosis → decision
                </p>
              </div>

              <div className="border-l border-t border-border bg-card">
                {[
                  [FileSearch, "01", "Observe", "We collect public content, approved account metrics, and repeatable format signals."],
                  [BarChart3, "02", "Diagnose", "We separate evidence from interpretation, compare like with like, and state where the data stops."],
                  [Route, "03", "Decide", "We rank the next actions by impact, effort, and the account’s current stage."],
                ].map(([Icon, number, title, body]) => {
                  const MethodIcon = Icon as typeof FileSearch;
                  return (
                    <article key={number as string} className="grid gap-5 border-b border-r border-border p-6 sm:grid-cols-[3rem_1fr] sm:gap-7 sm:p-8">
                      <div>
                        <span className="font-mono text-xs text-[color:var(--accent)]">{number as string}</span>
                        <MethodIcon className="mt-5 size-5 text-[color:var(--accent)]" />
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold tracking-[-0.02em]">{title as string}</h3>
                        <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">{body as string}</p>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div aria-label="Operating standards" className="mt-14 grid border-y border-border md:grid-cols-3">
              {[
                ["Private by default", "Reports stay owner-scoped, with controlled sharing when you choose it."],
                ["Limits stay visible", "Unknowns remain unknown instead of being filled with invented certainty."],
                ["Calibrated by media strategy", "Interpretation reflects account maturity, audience behavior, and format context."],
              ].map(([title, body], index) => (
                <div key={title} className={`py-5 md:px-6 ${index > 0 ? "border-t border-border md:border-l md:border-t-0" : ""}`}>
                  <p className="text-sm font-semibold">{title}</p>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{body}</p>
                </div>
              ))}
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

        <section id="community" className="scroll-mt-16 border-y border-border bg-background py-10 sm:py-14">
          <div className="alm-shell">
            <figure className="mx-auto grid max-w-5xl gap-7 border-l-2 border-[color:var(--accent)] pl-5 sm:pl-7 lg:grid-cols-[13rem_1fr] lg:gap-10">
              <figcaption>
                <p className="alm-kicker">Audit feedback</p>
                <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-[-0.04em]">
                  Loved by our community.
                </h2>
                <cite className="mt-5 block not-italic">
                  <span className="block text-sm font-semibold">Kas di Kos Team</span>
                </cite>
              </figcaption>

              <blockquote className="max-w-3xl text-base font-medium leading-7 tracking-[-0.012em] text-foreground/85">
                <p>
                  The information you provided is incredibly insightful and offers actionable steps that align with our direction. We fully agree with your recommendation to showcase products in real lived-in spaces that are attainable because we believe that curation exists at every level. Your analysis confirms that we are making the right decisions with this pivot, and we cannot thank you enough.
                </p>
              </blockquote>
            </figure>
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
            <div className="mt-6 flex flex-col items-start justify-between gap-4 border border-border bg-card p-5 sm:flex-row sm:items-center sm:p-6">
              <div>
                <p className="text-sm font-semibold">Companies and agencies</p>
                <p className="mt-1 text-xs text-muted-foreground">Custom engagements with hands-on onboarding, scoped to your portfolio and operating rhythm.</p>
              </div>
              <Button asChild variant="outline" className="min-h-10 shrink-0 px-4">
                <Link href="/enterprise">Enterprise <ArrowRight className="size-4" /></Link>
              </Button>
            </div>
          </div>
        </section>

        <section id="blueprint" className="scroll-mt-16 border-b border-border py-20 sm:py-28">
          <div className="alm-shell">
            <div className="grid gap-12 lg:grid-cols-[0.82fr_1.18fr] lg:items-end lg:gap-20">
              <div>
                <p className="alm-kicker">Blueprint Audit · Pre-launch strategy</p>
                <h2 className="mt-4 text-4xl font-semibold leading-[1.04] tracking-[-0.05em] sm:text-5xl">
                  Build the account before you try to grow it.
                </h2>
              </div>
              <div className="border-l-2 border-[color:var(--accent)] pl-5 sm:pl-7">
                <p className="text-base leading-7 text-muted-foreground">
                  For new, early-stage, or repositioning brands. The Blueprint turns a loose idea into a clear niche, a repeatable content system, and a practical first 90 days.
                </p>
                <p className="mt-4 font-mono text-xs uppercase tracking-[0.1em] text-foreground">
                  Best for pre-launches · Rebrands · Early-stage accounts
                </p>
              </div>
            </div>

            <div className="mt-12 grid border-l border-t border-border lg:grid-cols-3">
              {[
                [Compass, "01", "Position", "Define the niche, audience, competitive whitespace, and profile direction."],
                [Layers3, "02", "Build", "Shape the content pillars, visual identity, brand voice, and format mix."],
                [Rocket, "03", "Launch", "Follow a month-one calendar, Stories plan, engagement playbook, and 90-day growth path."],
              ].map(([Icon, number, title, body]) => {
                const PhaseIcon = Icon as typeof Compass;
                return (
                  <article key={number as string} className="border-b border-r border-border bg-card p-6 sm:p-8">
                    <div className="flex items-center justify-between">
                      <PhaseIcon className="size-5 text-[color:var(--accent)]" />
                      <span className="font-mono text-xs text-muted-foreground">{number as string}</span>
                    </div>
                    <h3 className="mt-10 text-xl font-semibold">{title as string}</h3>
                    <p className="mt-3 text-sm leading-6 text-muted-foreground">{body as string}</p>
                  </article>
                );
              })}
            </div>

            <div className="grid border-x border-b border-border bg-[color:var(--forest)] text-white lg:grid-cols-[1.2fr_0.8fr]">
              <div className="p-6 sm:p-8 lg:p-10">
                <p className="font-mono text-xs uppercase tracking-[0.12em] text-[color:var(--teal-on-forest)]">Your 15-section launch foundation</p>
                <div className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2">
                  {[
                    "Niche and positioning audit",
                    "Competitive landscape",
                    "Content pillar architecture",
                    "Profile optimization checklist",
                    "Visual identity framework",
                    "Brand voice and format mix",
                    "Month-one content calendar",
                    "Launch readiness and blind spots",
                  ].map((item) => (
                    <div key={item} className="flex gap-3 text-sm text-white/75">
                      <Check className="mt-0.5 size-4 shrink-0 text-[color:var(--teal-on-forest)]" />
                      <span>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex flex-col justify-between border-t border-white/15 p-6 sm:p-8 lg:border-l lg:border-t-0 lg:p-10">
                <div>
                  <p className="text-sm text-white/60">One-time strategy</p>
                  <p className="mt-3 font-mono text-5xl font-semibold tracking-[-0.05em]">$79</p>
                  <p className="mt-4 text-sm leading-6 text-white/65">A complete pre-launch foundation and 90-day roadmap. No subscription.</p>
                </div>
                <Button asChild variant="secondary" className="mt-8 min-h-11 w-full">
                  <Link href="/support?topic=blueprint">Get the Blueprint <ArrowRight className="size-4" /></Link>
                </Button>
              </div>
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
