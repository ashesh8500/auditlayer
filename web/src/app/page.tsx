import Link from "next/link";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";

const REPORT_ANSWERS = [
  {
    label: "01",
    title: "Where you're at",
    body: "A calibrated read on your current standing — followers, engagement, format mix, and authority.",
  },
  {
    label: "02",
    title: "What's holding you back",
    body: "The specific structural gaps suppressing reach, ranked by impact and effort to fix.",
  },
  {
    label: "03",
    title: "Who's doing it better",
    body: "Same-tier peers benchmarked head-to-head — credentials, formats, and cadence.",
  },
  {
    label: "04",
    title: "What to post next week",
    body: "A concrete content calendar with formats, pillars, and ready-to-film examples.",
  },
  {
    label: "05",
    title: "When you hit the next milestone",
    body: "A phased 90-day map with follower and engagement targets you can actually track.",
  },
  {
    label: "06",
    title: "The money move",
    body: "The highest-leverage monetization path, matched to your audience and credibility.",
  },
];

const PREVIEW_METRICS = [
  { value: "11K", label: "Followers", tone: "" },
  { value: "1.96%", label: "Engagement", tone: "text-[color:var(--red)]" },
  { value: "34", label: "Audit Score", tone: "text-[color:var(--amber)]" },
  { value: "20K", label: "90-Day Target", tone: "text-[color:var(--green)]" },
];

const PRICING = [
  {
    name: "Starter",
    price: "$30",
    cadence: "/mo",
    audits: "5 audits / month",
    features: [
      "Full 15-section report",
      "Same-tier peer benchmarks",
      "HTML + PDF export",
      "Section-scoped refinements",
    ],
    cta: "Start with Starter",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "$50",
    cadence: "/mo",
    audits: "15 audits / month",
    features: [
      "Everything in Starter",
      "Priority generation queue",
      "Deeper competitive context",
      "Founder review on request",
    ],
    cta: "Go Pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Let's talk",
    cadence: "",
    audits: "Unlimited audits",
    features: [
      "Volume + multi-creator",
      "Custom benchmarks & cadence",
      "Dedicated founder support",
      "White-glove onboarding",
    ],
    cta: "Contact sales",
    highlighted: false,
  },
];

export default async function Home() {
  const user = await getSession();
  const primaryHref = user ? "/dashboard" : "/login";

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-[color:var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-[color:var(--accent)] font-mono text-[10px] text-white">
              AL
            </span>
            AuditLayer
          </span>
          <div className="flex items-center gap-2">
            <Link href="#pricing">
              <Button variant="ghost" size="sm">
                Pricing
              </Button>
            </Link>
            <Link href={primaryHref}>
              <Button size="sm" className="font-medium">
                {user ? "Dashboard" : "Sign in"}
              </Button>
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-7 py-16 sm:py-24">
        {/* Hero */}
        <section className="border-b border-border pb-12 text-center">
          {/* Gradient header banner — full hero card */}
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-gradient-to-br from-[color:var(--accent)]/10 via-[color:var(--accent-muted)] to-transparent px-6 py-10 sm:px-12 sm:py-14">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-[color:var(--accent)]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 size-32 rounded-full bg-emerald-400/10 blur-2xl" />
            <p className="relative inline-block rounded-full border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-4 py-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[color:var(--accent)] backdrop-blur">
              Evidence-based competitive intelligence
            </p>
            <h1 className="relative mt-4 text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">
              Social Media Analysis That Reads Like a Strategic Breakdown
            </h1>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Competitive intelligence for media managers, creators, and personal
              brands. Built from real social media data — designed to turn
              performance into direction.
            </p>
            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href={primaryHref}>
                <Button size="lg" className="font-semibold">
                  Start Your Free Audit
                </Button>
              </Link>
              <Link href="#pricing">
                <Button size="lg" variant="outline" className="font-semibold">
                  See Pricing
                </Button>
              </Link>
            </div>
            <p className="relative mt-4 text-xs text-muted-foreground">
              First audit is free · No credit card required
            </p>
          </div>
        </section>

        {/* Metric preview */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            A glance at the numbers
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {PREVIEW_METRICS.map((metric) => (
              <div
                key={metric.label}
                className="rounded-[var(--radius)] border border-border bg-card px-4 py-5 text-center"
              >
                <div
                  className={`font-mono text-2xl font-medium leading-none ${metric.tone}`}
                >
                  {metric.value}
                </div>
                <div className="mt-2 text-[0.72rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">
                  {metric.label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* What you get — live report preview */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            What You Get At a Glance
          </h2>
          <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white shadow-[var(--shadow-md)]">
            {/* Report header bar */}
            <div className="flex items-center justify-between border-b border-border bg-[#f5f5f4] px-5 py-2.5">
              <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Instagram Audit · @versediscovery
              </span>
              <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-[color:var(--green)]">
                Generated
              </span>
            </div>
            {/* Report body */}
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                Instagram Account Audit
              </p>
              <h3 className="mt-0.5 text-xl font-bold tracking-[-0.02em]">
                @versediscovery
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Verséa Discovery — Mitochondrial biology for everyday wellness
              </p>
              <div className="mt-4 flex flex-wrap gap-2 text-[0.65rem] text-muted-foreground">
                <span>📅 June 2026</span>
                <span className="text-border">|</span>
                <span>📊 Public data + Social Blade</span>
                <span className="text-border">|</span>
                <span>⏱ 14-day analysis window</span>
              </div>

              {/* Metrics row */}
              <div className="mt-5 grid grid-cols-4 gap-2">
                <div className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                  <div className="font-mono text-lg font-semibold leading-none">11K</div>
                  <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">Followers</div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                  <div className="font-mono text-lg font-semibold leading-none text-[color:var(--red)]">1.96%</div>
                  <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">Engagement</div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                  <div className="font-mono text-lg font-semibold leading-none">178</div>
                  <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">Avg Likes</div>
                </div>
                <div className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                  <div className="font-mono text-lg font-semibold leading-none text-[color:var(--green)]">+149</div>
                  <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">14-Day Growth</div>
                </div>
              </div>

              {/* Sample section */}
              <h4 className="mt-5 text-sm font-bold">Executive Summary</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                Verséa Discovery brings <strong className="text-foreground">world-class mitochondrial science</strong> to Instagram — but the account reads like a lab notebook, not a consumer brand. With <strong className="text-foreground">1.96% engagement</strong> at 11K followers, the audience is real and engaged. The bottleneck is <strong className="text-foreground">content packaging</strong>: the feed leans on dense text slides that bury the brand&rsquo;s most compelling asset — the science itself, translated into stories people can feel.
              </p>

              <h4 className="mt-4 text-sm font-bold">Strengths</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                <strong className="text-foreground">1. Scientific Authority.</strong> CSO-led, mitochondrial focus — no other wellness brand owns this lane with this depth.{" "}
                <strong className="text-foreground">2. Loyal Community.</strong> 32 avg comments per post with high-quality discussion threads — rare at this tier.
              </p>

              <p className="mt-4 text-[0.65rem] italic text-muted-foreground">
                + 13 more sections in the full report — weaknesses, growth bottlenecks, content gaps, viral opportunities, competitive comparison, monetization, 90-day plan, and visual branding blueprint.
              </p>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="mt-16 scroll-mt-20">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pricing
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start free with one audit. Upgrade when the reports earn their keep.
          </p>
          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            {PRICING.map((tier) => (
              <div
                key={tier.name}
                className={`flex flex-col rounded-[calc(var(--radius)+2px)] border p-5 ${
                  tier.highlighted
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] shadow-[var(--shadow-md)]"
                    : "border-border bg-card"
                }`}
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-semibold">{tier.name}</h3>
                  {tier.highlighted && (
                    <span className="rounded-full bg-[color:var(--accent)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Popular
                    </span>
                  )}
                </div>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="font-mono text-2xl font-semibold">
                    {tier.price}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {tier.cadence}
                  </span>
                </div>
                <p className="mt-1 text-xs font-medium text-[color:var(--accent)]">
                  {tier.audits}
                </p>
                <ul className="mt-4 flex-1 space-y-2">
                  {tier.features.map((f) => (
                    <li
                      key={f}
                      className="flex items-start gap-2 text-xs text-muted-foreground"
                    >
                      <Check className="mt-0.5 size-3.5 shrink-0 text-[color:var(--green)]" />
                      {f}
                    </li>
                  ))}
                </ul>
                <Link href={primaryHref} className="mt-5">
                  <Button
                    variant={tier.highlighted ? "default" : "outline"}
                    className="w-full font-medium"
                  >
                    {tier.cta}
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          AuditLayer · Evidence-based competitive intelligence for creators
        </footer>
      </main>
    </div>
  );
}
