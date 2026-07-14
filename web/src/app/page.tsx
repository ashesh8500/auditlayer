import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  ChevronRight,
  FileSearch,
  Route,
  ShieldCheck,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

const SCORE_ROWS = [
  ["Content strategy", 32],
  ["Engagement depth", 55],
  ["Brand cohesion", 68],
  ["Conversion path", 22],
] as const;

const REPORT_ANSWERS = [
  ["01", "Baseline", "Where the account stands across content, growth, engagement, brand, and conversion."],
  ["02", "Constraints", "The structural issues limiting reach, trust, and audience action."],
  ["03", "Peer context", "Same-tier accounts that reveal a credible competitive gap."],
  ["04", "Next week", "A short execution plan with formats, angles, and priorities."],
  ["05", "Trajectory", "Measurable checkpoints for the next 30 and 90 days."],
  ["06", "Revenue move", "The commercial action that fits the audience and current maturity."],
] as const;

const PRICING = [
  {
    name: "Pulse",
    price: "Free",
    cadence: "",
    note: "One focused diagnostic",
    features: ["Score breakdown", "Strengths and gaps", "Three immediate moves"],
    cta: "Run a Free Pulse Audit",
    featured: false,
  },
  {
    name: "Starter",
    price: "$30",
    cadence: "/ month",
    note: "5 full audits per month",
    features: ["15-section intelligence report", "Peer benchmarking", "7-day and 90-day plans", "One refinement"],
    cta: "Choose Starter",
    featured: true,
  },
  {
    name: "Pro",
    price: "$50",
    cadence: "/ month",
    note: "15 full audits per month",
    features: ["Everything in Starter", "Priority queue", "Competitor deep-dives", "Two refinements"],
    cta: "Choose Pro",
    featured: false,
  },
] as const;

export default async function Home() {
  const user = await getSession();
  if (user) redirect("/dashboard");

  return (
    <div className="min-h-screen overflow-x-hidden bg-background text-foreground">
      <header className="sticky top-0 z-30 border-b border-border/90 bg-background/90 backdrop-blur-xl">
        <div className="alm-shell flex h-16 items-center justify-between">
          <Brand />
          <nav aria-label="Primary navigation" className="flex items-center gap-1 sm:gap-3">
            <Link href="#method" className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block">Method</Link>
            <Link href="#pricing" className="hidden px-3 py-2 text-sm text-muted-foreground hover:text-foreground sm:block">Pricing</Link>
            <Link href="/login"><Button size="sm">Sign in</Button></Link>
          </nav>
        </div>
      </header>

      <main>
        <section className="alm-shell grid min-h-[calc(100vh-4rem)] items-center gap-10 py-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-16 lg:py-20">
          <div className="max-w-xl">
            <p className="alm-kicker">Competitive intelligence for social growth</p>
            <h1 className="mt-5 text-[clamp(3.2rem,8vw,6.9rem)] font-semibold leading-[0.86] tracking-[-0.075em]">
              Know what to do <span className="text-[color:var(--accent)]">next.</span>
            </h1>
            <p className="mt-7 max-w-lg text-base leading-7 text-muted-foreground sm:text-lg">
              AuditLayerMedia turns public social signals into a clear diagnosis, a same-tier benchmark, and an executable growth plan.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/login"><Button size="lg" className="w-full sm:w-auto">Run a Free Pulse Audit <ArrowRight className="size-4" /></Button></Link>
              <Link href="#sample"><Button size="lg" variant="outline" className="w-full sm:w-auto">Explore the sample</Button></Link>
            </div>
            <div className="mt-9 grid grid-cols-3 border-y border-border py-4 font-mono text-[0.65rem] uppercase tracking-[0.08em] text-muted-foreground">
              <span><b className="block text-lg text-foreground">6</b>dimensions</span>
              <span><b className="block text-lg text-foreground">15</b>sections</span>
              <span><b className="block text-lg text-foreground">90</b>day path</span>
            </div>
          </div>

          <div id="sample" className="relative scroll-mt-24 bg-[#14241f] p-4 shadow-[var(--shadow-lg)] sm:p-7">
            <div className="absolute -right-20 -top-20 size-64 rounded-full bg-[color:var(--accent)]/25 blur-3xl" aria-hidden="true" />
            <div className="relative rotate-[0.5deg] bg-card p-5 shadow-2xl sm:p-8">
              <div className="flex items-start justify-between gap-4 border-b border-border pb-5">
                <div><p className="alm-kicker">Sample intelligence brief</p><h2 className="mt-2 text-2xl font-semibold tracking-tight">@glowstate</h2></div>
                <div className="text-right"><b className="font-mono text-4xl">48</b><span className="font-mono text-xs text-muted-foreground"> / 100</span></div>
              </div>
              <div className="py-5">
                {SCORE_ROWS.map(([label, score]) => (
                  <div key={label} className="grid grid-cols-[7.5rem_1fr_1.5rem] items-center gap-3 border-b border-border/70 py-2.5 text-xs">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="h-1.5 bg-muted"><span className="block h-full bg-[color:var(--accent)]" style={{ width: `${score}%` }} /></span>
                    <b className="font-mono">{score}</b>
                  </div>
                ))}
              </div>
              <div className="border-l-2 border-[color:var(--accent)] bg-[color:var(--accent-muted)] p-4">
                <p className="font-mono text-[0.62rem] font-semibold uppercase tracking-widest text-[color:var(--accent)]">Primary constraint</p>
                <p className="mt-2 text-sm font-medium leading-6">A coherent brand without a repeatable distribution system.</p>
              </div>
              <div className="mt-5 grid gap-2 sm:grid-cols-3">
                {["Shift the format mix", "Tighten reply time", "Guide first visits"].map((move, index) => (
                  <div key={move} className="border-t border-border pt-3 text-xs leading-5 text-muted-foreground"><b className="mr-2 font-mono text-[color:var(--accent)]">0{index + 1}</b>{move}</div>
                ))}
              </div>
            </div>
            <p className="relative mt-4 font-mono text-[0.62rem] uppercase tracking-[0.12em] text-white/55">Fictional sample · representative report structure</p>
          </div>
        </section>

        <section id="method" className="border-y border-border bg-[#14241f] py-20 text-white scroll-mt-16">
          <div className="alm-shell">
            <div className="grid gap-10 lg:grid-cols-[0.9fr_1.1fr] lg:gap-20">
              <div><p className="alm-kicker !text-[#76d7ca]">From signal to strategy</p><h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em] sm:text-5xl">Research that ends in a decision.</h2></div>
              <div className="grid gap-px bg-white/15 sm:grid-cols-3">
                {[
                  [FileSearch, "Observe", "Public content, account signals, and format patterns."],
                  [BarChart3, "Calibrate", "Scores and same-tier comparisons with visible limitations."],
                  [Route, "Act", "A ranked next-week plan and measurable trajectory."],
                ].map(([Icon, title, body]) => {
                  const MethodIcon = Icon as typeof FileSearch;
                  return <article key={title as string} className="bg-[#14241f] p-6"><MethodIcon className="size-5 text-[#76d7ca]" /><h3 className="mt-8 text-lg font-semibold">{title as string}</h3><p className="mt-2 text-sm leading-6 text-white/60">{body as string}</p></article>;
                })}
              </div>
            </div>
          </div>
        </section>

        <section className="alm-shell py-20 sm:py-28">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-20">
            <div><p className="alm-kicker">Inside every report</p><h2 className="mt-4 text-4xl font-semibold leading-tight tracking-[-0.045em]">Six answers. No dashboard theater.</h2><p className="mt-5 text-sm leading-6 text-muted-foreground">The report is designed to be read, discussed, and used. Every section moves from evidence to implication to action.</p></div>
            <div className="grid border-l border-t border-border sm:grid-cols-2">
              {REPORT_ANSWERS.map(([number, title, body]) => <article key={number} className="border-b border-r border-border bg-card p-5 sm:p-6"><span className="font-mono text-xs text-[color:var(--accent)]">{number}</span><h3 className="mt-7 text-lg font-semibold">{title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p></article>)}
            </div>
          </div>
        </section>

        <section id="pricing" className="border-y border-border bg-[color:var(--panel)] py-20 scroll-mt-16">
          <div className="alm-shell">
            <div className="max-w-2xl"><p className="alm-kicker">Pricing</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">Start with a Pulse. Upgrade for depth.</h2><p className="mt-4 text-muted-foreground">No credit card for the free Pulse audit. Paid plans unlock complete reports and refinements.</p></div>
            <div className="mt-10 grid gap-4 lg:grid-cols-3">
              {PRICING.map((tier) => <article key={tier.name} className={`flex min-h-[25rem] flex-col border p-6 ${tier.featured ? "border-[#14241f] bg-[#14241f] text-white shadow-[var(--shadow-lg)]" : "border-border bg-card"}`}>
                <div className="flex items-center justify-between"><h3 className="text-xl font-semibold">{tier.name}</h3>{tier.featured && <span className="font-mono text-[0.58rem] uppercase tracking-widest text-[#76d7ca]">Most popular</span>}</div>
                <div className="mt-9"><b className="font-mono text-4xl">{tier.price}</b>{"cadence" in tier && <span className={`text-xs ${tier.featured ? "text-white/55" : "text-muted-foreground"}`}>{tier.cadence}</span>}<p className={`mt-2 text-xs ${tier.featured ? "text-white/55" : "text-muted-foreground"}`}>{tier.note}</p></div>
                <ul className="mt-8 flex-1 space-y-3">{tier.features.map(feature => <li key={feature} className={`flex gap-2 text-sm ${tier.featured ? "text-white/75" : "text-muted-foreground"}`}><Check className="mt-0.5 size-4 shrink-0 text-[color:var(--accent)]" />{feature}</li>)}</ul>
                <Link href="/login" className="mt-8"><Button variant={tier.featured ? "secondary" : "outline"} className="w-full">{tier.cta}</Button></Link>
              </article>)}
            </div>
          </div>
        </section>

        <section className="alm-shell grid gap-12 py-20 lg:grid-cols-2 lg:py-28">
          <div><p className="alm-kicker">What to expect</p><h2 className="mt-4 text-4xl font-semibold tracking-[-0.045em]">Evidence with its limits attached.</h2><div className="mt-8 flex gap-4 border-t border-border pt-5"><ShieldCheck className="size-5 shrink-0 text-[color:var(--accent)]" /><p className="text-sm leading-6 text-muted-foreground">AuditLayerMedia uses public information and available account data. Reports state collection limitations and confidence context rather than filling gaps with invented certainty.</p></div></div>
          <div className="space-y-2">
            {[
              ["How long does an audit take?", "Most reports are ready in 6–8 minutes. Status pages show the real worker phase while research is running."],
              ["Which platforms are supported?", "Instagram, TikTok, and YouTube are the primary supported platforms. Data access varies by account and platform."],
              ["Can I share the report?", "Yes. Ready reports can be read in the focused reader, downloaded, and shared through controlled links."],
            ].map(([question, answer]) => <details key={question} className="group border-b border-border bg-card"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-5 font-medium alm-focus"><span>{question}</span><ChevronRight className="size-4 shrink-0 transition-transform group-open:rotate-90" /></summary><p className="px-5 pb-5 text-sm leading-6 text-muted-foreground">{answer}</p></details>)}
          </div>
        </section>
      </main>

      <footer className="border-t border-border py-8"><div className="alm-shell flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"><div><Brand /><p className="mt-3 max-w-md text-xs leading-5 text-muted-foreground">Competitive intelligence for evidence-led social growth.</p></div><div className="flex gap-5 text-xs text-muted-foreground"><Link href="/support">Support</Link><Link href="/privacy">Privacy</Link><span>© {new Date().getFullYear()}</span></div></div></footer>
    </div>
  );
}

function Brand() {
  return <Link href="/" className="flex items-center gap-2.5 font-semibold tracking-tight alm-focus"><span className="grid size-8 place-items-center bg-[#14241f] font-mono text-[0.58rem] font-bold text-[#9fe8dc]">ALM</span><span className="text-sm">AuditLayerMedia</span></Link>;
}