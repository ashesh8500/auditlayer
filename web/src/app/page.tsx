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
                Instagram Audit · Sample Report
              </span>
              <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-[color:var(--green)]">
                Generated
              </span>
            </div>
            {/* Report body — scrollable */}
            <div className="max-h-[520px] overflow-y-auto px-6 py-6 sm:px-8 sm:py-8">
              {/* Label + handle */}
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                Instagram Account Audit
              </p>
              <h3 className="mt-0.5 text-xl font-bold tracking-[-0.02em]">
                @glowstate
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Premium adaptogenic supplements — functional mushrooms, nootropics, and plant-based wellness.
              </p>
              <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[0.65rem] text-muted-foreground">
                <span>📅 June 2026</span>
                <span>📊 Public data + Social Blade</span>
                <span>⏱ 14-day analysis window</span>
              </div>

              {/* ── Score Bar Graph ── */}
              <div className="mt-5 rounded-[var(--radius)] border border-border bg-[#fcfcfb] p-4 sm:p-5">
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-3">
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Score Breakdown</span>
                  <span className="font-mono text-xl font-semibold">48<span className="text-xs font-normal text-muted-foreground">/100</span></span>
                </div>
                {[
                  { label: "Content Strategy", pct: 32, color: "bg-[color:var(--red)]" },
                  { label: "Growth Momentum", pct: 18, color: "bg-[color:var(--red)]" },
                  { label: "Engagement Depth", pct: 55, color: "bg-[color:var(--amber)]" },
                  { label: "Platform Optimization", pct: 40, color: "bg-[color:var(--amber)]" },
                  { label: "Brand Cohesion", pct: 68, color: "bg-[color:var(--green)]" },
                  { label: "Conversion Architecture", pct: 22, color: "bg-[color:var(--red)]" },
                ].map((dim) => (
                  <div key={dim.label} className="mb-2 flex items-center gap-3 text-xs last:mb-0">
                    <span className="w-36 flex-shrink-0 text-right font-medium text-muted-foreground">{dim.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                      <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                    </div>
                    <span className="w-6 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}</span>
                  </div>
                ))}
              </div>

              {/* ── Key Metrics ── */}
              <h4 className="mt-5 text-sm font-bold">Key Metrics</h4>
              <div className="mt-3 grid grid-cols-4 gap-2">
                {[
                  { value: "24.8K", label: "Followers", tone: "" },
                  { value: "1.42%", label: "Engagement", tone: "text-[color:var(--red)]" },
                  { value: "312", label: "Avg Likes", tone: "" },
                  { value: "+0.3%", label: "30-Day Growth", tone: "text-[color:var(--amber)]" },
                ].map((m) => (
                  <div key={m.label} className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                    <div className={`font-mono text-lg font-semibold leading-none ${m.tone}`}>{m.value}</div>
                    <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">{m.label}</div>
                  </div>
                ))}
              </div>
              <table className="mt-3 w-full border-collapse text-[0.72rem]">
                <thead>
                  <tr className="border-b-2 border-border text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="pb-2 pr-3">Metric</th><th className="pb-2 pr-3 text-right">@glowstate</th><th className="pb-2 pr-3 text-right">Benchmark</th><th className="pb-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">Engagement Rate</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[color:var(--red)]">1.42%</td>
                    <td className="py-1.5 pr-3 text-right font-mono">~3.5%</td>
                    <td className="py-1.5"><span className="rounded-sm bg-[color:var(--red-muted)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[color:var(--red)]">Below</span></td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-3 font-medium">30-Day Growth</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[color:var(--amber)]">+0.3%</td>
                    <td className="py-1.5 pr-3 text-right font-mono">+1.2%</td>
                    <td className="py-1.5"><span className="rounded-sm bg-[color:var(--amber-muted)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[color:var(--amber)]">Slow</span></td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-3 font-medium">Reel Adoption</td>
                    <td className="py-1.5 pr-3 text-right font-mono text-[color:var(--red)]">22%</td>
                    <td className="py-1.5 pr-3 text-right font-mono">60%+</td>
                    <td className="py-1.5"><span className="rounded-sm bg-[color:var(--red-muted)] px-1.5 py-0.5 text-[0.6rem] font-semibold text-[color:var(--red)]">Under</span></td>
                  </tr>
                </tbody>
              </table>

              {/* ── Executive Summary ── */}
              <h4 className="mt-5 text-sm font-bold">Executive Summary</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                @glowstate operates in one of Instagram&rsquo;s fastest-growing niches — functional wellness — with a product line that genuinely differentiates: dual-extract lion&rsquo;s mane, cordyceps-schisandra blends, and nootropic stacks backed by third-party testing. The brand has <strong className="text-foreground">24.8K followers</strong> and a clean, recognizable visual identity anchored in deep forest greens and warm amber tones. But the numbers tell a different story from the aesthetics.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Engagement sits at <strong className="text-foreground">1.42%</strong> — barely half the 3.5% benchmark for the 20K–50K tier. Thirty-day follower growth is effectively flat at +0.3%. The account posts consistently (4–5× per week) but the content mix is heavily skewed toward static product photography and ingredient close-ups. Reels account for only 22% of output despite being the highest-reach format on the platform. The comment section is quiet — most posts generate likes but not discussion. When questions do appear, response time averages 18 hours, well outside the critical first-hour engagement window.
              </p>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                The root cause is not product quality or brand positioning — it&rsquo;s <strong className="text-foreground">format strategy and community activation</strong>. @glowstate treats Instagram as a catalog when it should treat it as a publication. The fix is structural: shift 60% of output to Reels, introduce a weekly founder Q&A, shorten reply latency, and build a highlight architecture that educates new visitors instead of just displaying products. With these changes, the account can realistically reach 40K followers and 3%+ engagement within 90 days.
              </p>

              {/* ── Strengths ── */}
              <h4 className="mt-5 text-sm font-bold">Top Strengths</h4>
              <div className="mt-2 space-y-2">
                {[
                  { n: "1", title: "Product Differentiation", body: "Dual-extract formulations and third-party lab testing are rare in the adaptogen space — this is a structural moat that most competitors cannot replicate." },
                  { n: "2", title: "Visual Identity", body: "Forest green + amber palette is consistent and memorable. The grid reads as intentional and premium at a glance, which builds trust before a single word is read." },
                  { n: "3", title: "Posting Consistency", body: "4–5 posts per week maintained over 8+ months. The habit infrastructure is already in place — it just needs a format upgrade." },
                ].map((s) => (
                  <div key={s.n} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <p className="text-xs"><strong className="text-foreground">{s.n}. {s.title}.</strong> <span className="text-muted-foreground">{s.body}</span></p>
                  </div>
                ))}
              </div>

              {/* ── Weaknesses ── */}
              <h4 className="mt-5 text-sm font-bold">Top Weaknesses</h4>
              <div className="mt-2 space-y-2">
                {[
                  { n: "1", title: "Reel Under-Adoption", body: "Only 22% of posts are Reels. Instagram&rsquo;s algorithm weights native video 3–5× over static images. This alone explains roughly half the engagement gap." },
                  { n: "2", title: "Silent Community", body: "Average reply latency of 18 hours. Comments that go unanswered in the first 60 minutes signal low engagement depth to the algorithm, capping reach." },
                  { n: "3", title: "No Highlight Architecture", body: "The profile lacks organized story highlights — no education, no founder story, no testimonials. New visitors have no guided path after the bio." },
                ].map((w) => (
                  <div key={w.n} className="rounded-[var(--radius-sm)] border-l-2 border-[color:var(--red)]/30 bg-[color:var(--red-muted)]/30 p-3">
                    <p className="text-xs"><strong className="text-foreground">{w.n}. {w.title}.</strong> <span className="text-muted-foreground">{w.body}</span></p>
                  </div>
                ))}
              </div>

              {/* ── Competitive Comparison snippet ── */}
              <h4 className="mt-5 text-sm font-bold">Competitive Context</h4>
              <table className="mt-2 w-full border-collapse text-[0.72rem]">
                <thead>
                  <tr className="border-b-2 border-border text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                    <th className="pb-2 pr-2"></th><th className="pb-2 pr-2">@glowstate</th><th className="pb-2 pr-2">Peer A</th><th className="pb-2">Peer B</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-2 font-medium">Followers</td>
                    <td className="py-1.5 pr-2 font-mono">24.8K</td><td className="py-1.5 pr-2 font-mono">31K</td><td className="py-1.5 font-mono">19K</td>
                  </tr>
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-2 font-medium">Engagement</td>
                    <td className="py-1.5 pr-2 font-mono text-[color:var(--red)]">1.42%</td><td className="py-1.5 pr-2 font-mono text-[color:var(--green)]">3.8%</td><td className="py-1.5 font-mono text-[color:var(--green)]">2.9%</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-2 font-medium">Reel Share</td>
                    <td className="py-1.5 pr-2 font-mono text-[color:var(--red)]">22%</td><td className="py-1.5 pr-2 font-mono">65%</td><td className="py-1.5 font-mono">48%</td>
                  </tr>
                </tbody>
              </table>

              {/* Teaser */}
              <p className="mt-5 text-[0.65rem] italic text-muted-foreground">
                + 10 more sections in the full report — content gaps, audience psychology patterns, viral opportunities, content ideas, the 90-day growth map, content mix &amp; weekly calendar, the four-hour engagement window, visual branding blueprint, right hashtags, and how often to re-audit.
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
