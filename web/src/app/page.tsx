import Link from "next/link";
import { redirect } from "next/navigation";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getSession } from "@/lib/auth";
import WhimsicalShapes from "@/components/whimsical-shapes";

const REPORT_ANSWERS = [
  {
    label: "📊",
    title: "Baseline Reality",
    body: "A precise read of your current distribution state — audience scale, engagement efficiency, content composition, and authority signals.",
  },
  {
    label: "🔒",
    title: "Primary Constraints",
    body: "The highest-leverage friction points limiting growth, mapped by severity and implementation cost.",
  },
  {
    label: "⚖️",
    title: "Relative Position",
    body: "A structured comparison against comparable creators — identifying differentiation, gaps, and outperforming patterns.",
  },
  {
    label: "⚡",
    title: "Immediate Execution Plan",
    body: "A constrained, high-probability content set for the next 7 days — defined by format, narrative intent, and performance rationale.",
  },
  {
    label: "📈",
    title: "Trajectory Model",
    body: "A 90-day projection of growth milestones grounded in observable velocity, not aspiration — with measurable checkpoints.",
  },
  {
    label: "💰",
    title: "Monetization Architecture",
    body: "The most viable revenue pathway based on audience behavior, trust depth, and conversion surface area.",
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
    audits: "2 accounts · 5 audits / month",
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
    audits: "5 accounts · 15 audits / month",
    features: [
      "Full 20-section report",
      "Priority generation queue",
      "Deeper competitive context",
      "Branding & account growth insights",
      "Founder review on request",
    ],
    cta: "Go Pro",
    highlighted: true,
  },
  {
    name: "Enterprise",
    price: "Let's Talk",
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
  if (user) redirect("/dashboard");
  const primaryHref = "/login";

  return (
    <div className="relative flex min-h-full flex-1 flex-col">
      <WhimsicalShapes />
      <header className="sticky top-0 z-20 border-b border-border bg-[color:var(--bg)]/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-6">
          <span className="flex items-center gap-2 text-sm font-semibold tracking-tight">
            <span className="grid size-6 place-items-center rounded-md bg-[#1c1917] text-[10px] font-bold text-white">ALM</span>
            AuditLayerMedia
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

      <main className="relative z-10 mx-auto w-full max-w-3xl flex-1 px-7 py-16 sm:py-24">
        {/* ── 1. Hero ── */}
        <section className="border-b border-border pb-12 text-center">
          {/* Gradient header banner — full hero card */}
          <div className="relative mx-auto max-w-2xl overflow-hidden rounded-2xl bg-gradient-to-br from-[color:var(--accent)]/10 via-[color:var(--accent-muted)] to-transparent px-6 py-10 sm:px-12 sm:py-14">
            <div className="pointer-events-none absolute -right-12 -top-12 size-40 rounded-full bg-[color:var(--accent)]/10 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-8 -left-8 size-32 rounded-full bg-emerald-400/10 blur-2xl" />
            <p className="relative inline-block rounded-full border border-[color:var(--accent)]/20 bg-[color:var(--accent)]/10 px-4 py-1.5 font-mono text-[0.62rem] font-bold uppercase tracking-[0.15em] text-[color:var(--accent)] backdrop-blur">
              Media strategy, behavioral science, and AI for repeatable social growth
            </p>
            <h1 className="relative mt-4 text-4xl font-bold leading-tight tracking-[-0.02em] sm:text-5xl">
              Social Media Analysis That Reads Like a Strategic Breakdown
            </h1>
            <p className="relative mx-auto mt-4 max-w-xl text-base text-muted-foreground">
              Stop guessing. Get a strategic read on your social presence — built
              from real data, calibrated to your niche, and delivered as an
              executable playbook.
            </p>
            <div className="relative mt-7 flex flex-wrap items-center justify-center gap-3">
              <Link href={primaryHref}>
                <Button size="lg" className="font-semibold">
                  Run a Free Pulse Audit
                </Button>
              </Link>
              <Link href="#pricing">
                <Button size="lg" variant="outline" className="font-semibold">
                  See Pricing
                </Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── 2. Six Questions — the value proposition ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Six questions every report answers
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {REPORT_ANSWERS.map((item) => (
              <div
                key={item.label}
                className="rounded-[var(--radius)] border border-border bg-card p-5"
              >
                <span className="text-lg">
                  {item.label}
                </span>
                <h3 className="mt-1 text-base font-semibold">{item.title}</h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            Here&rsquo;s how every question gets answered — starting free ↓
          </p>
        </section>

        {/* ── 3. Pulse Audit — compact preview ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Free Pulse Audit
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All you need is an email · 2 free runs · No credit card
          </p>
          <div className="mt-5 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white shadow-[var(--shadow-sm)]">
            {/* Report header bar */}
            <div className="flex items-center justify-between border-b border-border bg-[#f5f5f4] px-5 py-2">
              <span className="font-mono text-[0.6rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Brand Pulse · @solawellness
              </span>
              <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[0.55rem] font-semibold uppercase text-[color:var(--green)]">
                Sample
              </span>
            </div>
            <div className="px-5 py-4">
              {/* Score bars — compact */}
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Pulse Score</span>
                <span className="font-mono text-base font-semibold">51<span className="text-xs font-normal text-muted-foreground">/100</span></span>
              </div>
              {[
                { label: "Product", pct: 80, color: "bg-[color:var(--green)]" },
                { label: "Brand Story", pct: 72, color: "bg-[color:var(--green)]" },
                { label: "Visual ID", pct: 58, color: "bg-[color:var(--amber)]" },
                { label: "Retail→Social", pct: 45, color: "bg-[color:var(--amber)]" },
                { label: "Cadence", pct: 34, color: "bg-[color:var(--red)]" },
                { label: "Community", pct: 28, color: "bg-[color:var(--red)]" },
              ].map((dim) => (
                <div key={dim.label} className="mb-1.5 flex items-center gap-2 text-xs last:mb-0">
                  <span className="w-20 flex-shrink-0 text-right text-[0.65rem] text-muted-foreground">{dim.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                    <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                  </div>
                  <span className="w-5 flex-shrink-0 text-right font-mono text-[0.65rem] font-semibold">{dim.pct}</span>
                </div>
              ))}
              {/* What's Working / Missing — brief */}
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-4">
                <div>
                  <p className="text-[0.55rem] font-bold uppercase tracking-[0.06em] text-[color:var(--green)]">🟢 Working</p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground leading-relaxed">Product-market fit is a structural moat. Visual identity is premium and locked in.</p>
                </div>
                <div>
                  <p className="text-[0.55rem] font-bold uppercase tracking-[0.06em] text-[color:var(--red)]">🔴 Missing</p>
                  <p className="mt-1 text-[0.65rem] text-muted-foreground leading-relaxed">Zero Reels in 60 days. Founder story is invisible on the feed.</p>
                </div>
              </div>
              {/* Three Moves */}
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-[0.55rem] font-bold uppercase tracking-[0.06em] text-[color:var(--accent)]">⚡ Three Moves</p>
                <div className="mt-2 space-y-1.5">
                  {[
                    { n: "1", text: "Film the founder story — one session, four Reels, release over two weeks." },
                    { n: "2", text: "Launch 'Sunscreen Sundays' — weekly educational carousel, becomes an audience ritual." },
                    { n: "3", text: "Reply within 4 hours — no bots. Every reply signals the algorithm to push to non-followers." },
                  ].map((m) => (
                    <div key={m.n} className="flex gap-2">
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[color:var(--accent)] font-mono text-[0.55rem] font-bold text-white">{m.n}</span>
                      <p className="text-[0.65rem] text-muted-foreground leading-relaxed">{m.text}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
          {/* CTA */}
          <div className="mt-4 text-center">
            <Link href={primaryHref}>
              <Button size="lg" className="font-semibold">
                Run Your Free Pulse Audit
              </Button>
            </Link>
            <p className="mt-2 text-xs text-muted-foreground">
              Get a score, strengths, gaps, and three moves — all from just a handle and email.
            </p>
          </div>
        </section>

        <hr className="mt-14 border-border" />

        {/* ── 4. Full Mock Report — the evidence ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Full 15-Section Report At a Glance
          </h2>
          <div className="relative mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white shadow-[var(--shadow-md)]">
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
            <div className="max-h-[520px] overflow-y-auto px-4 py-4 sm:px-8 sm:py-8">
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
                    <span className="w-20 flex-shrink-0 text-right text-xs font-medium text-muted-foreground sm:w-36">{dim.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                      <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                    </div>
                    <span className="w-6 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}</span>
                  </div>
                ))}
              </div>

              {/* ── Key Metrics ── */}
              <h4 className="mt-5 text-sm font-bold">Key Metrics</h4>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
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
              <div className="overflow-x-auto">
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
              </div>

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
              <div className="overflow-x-auto">
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
                  <tr className="border-b border-border">
                    <td className="py-1.5 pr-2 font-medium">Posting Cadence</td>
                    <td className="py-1.5 pr-2 font-mono">4–5/wk</td><td className="py-1.5 pr-2 font-mono">6–7/wk</td><td className="py-1.5 font-mono">5/wk</td>
                  </tr>
                  <tr>
                    <td className="py-1.5 pr-2 font-medium">Promo Ratio</td>
                    <td className="py-1.5 pr-2 font-mono text-[color:var(--amber)]">40%</td><td className="py-1.5 pr-2 font-mono text-[color:var(--green)]">15%</td><td className="py-1.5 font-mono text-[color:var(--green)]">20%</td>
                  </tr>
                </tbody>
              </table>
              </div>

              {/* ── Content Format Analysis ── */}
              <h4 className="mt-5 text-sm font-bold">Content Format Analysis</h4>
              <p className="mt-1 text-xs text-muted-foreground">Current mix is product-heavy with minimal educational or community-building formats. The account treats Instagram as a catalog — not a publication.</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-[0.72rem]">
                  <thead>
                    <tr className="border-b-2 border-border text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="pb-1.5 pr-2">Format</th><th className="pb-1.5 pr-2 text-right">Current</th><th className="pb-1.5 pr-2 text-right">Target</th><th className="pb-1.5">Impact</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border"><td className="py-1.5 pr-2 font-medium">Reels</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--red)]">22%</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--green)]">60%</td><td className="py-1.5 text-xs text-muted-foreground">Algorithm reach multiplier</td></tr>
                    <tr className="border-b border-border"><td className="py-1.5 pr-2 font-medium">Carousels</td><td className="py-1.5 pr-2 text-right font-mono">18%</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--green)]">25%</td><td className="py-1.5 text-xs text-muted-foreground">Save-driven reach + education</td></tr>
                    <tr className="border-b border-border"><td className="py-1.5 pr-2 font-medium">Static Images</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--red)]">52%</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--green)]">10%</td><td className="py-1.5 text-xs text-muted-foreground">Lowest organic reach</td></tr>
                    <tr><td className="py-1.5 pr-2 font-medium">Stories</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--amber)]">8%</td><td className="py-1.5 pr-2 text-right font-mono text-[color:var(--green)]">15%</td><td className="py-1.5 text-xs text-muted-foreground">Community + link-in-bio funnel</td></tr>
                  </tbody>
                </table>
              </div>

              {/* ── Three Immediate Actions ── */}
              <h4 className="mt-5 text-sm font-bold">Three Immediate Actions</h4>
              <p className="mt-1 text-xs text-muted-foreground">Executable this week with zero new tools or skills.</p>
              <div className="mt-2 space-y-2">
                {[
                  { n: "1", body: "Film and post one Reel within 48 hours — product demo or founder clip. Instagram's algorithm is format-weighted: the first Reel signals you're a video-native account." },
                  { n: "2", body: "Reply to every comment in the first 4 hours after posting. Current reply latency averages 18 hours — well outside the critical algorithmic window." },
                  { n: "3", body: "Create three Story highlight covers: Education, Founder Story, Testimonials. Organize existing Stories into these buckets. New visitors need a guided path." },
                ].map((a) => (
                  <div key={a.n} className="flex gap-3 rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full bg-[color:var(--accent)] font-mono text-[0.6rem] font-bold text-white">{a.n}</span>
                    <p className="text-xs text-muted-foreground">{a.body}</p>
                  </div>
                ))}
              </div>

              {/* ── 90-Day Growth Map ── */}
              <h4 className="mt-5 text-sm font-bold">90-Day Growth Map</h4>
              <p className="mt-1 text-xs text-muted-foreground">Three-phase timeline targeting 24.8K → 40K followers (+15.2K). Achievable when format mix and engagement windows are fixed.</p>
              <div className="mt-3 space-y-3">
                {[
                  { phase: "Phase 1 — Foundation", days: "Days 1–30", target: "24.8K → 29K", items: "Shift to 60% Reels · Launch Sunscreen Sundays · Reply to every comment · Build highlight architecture", signal: "Success signal: 3+ Reels reach 10K+ views each" },
                  { phase: "Phase 2 — Acceleration", days: "Days 31–60", target: "29K → 34K", items: "Collaborate with 2 wellness creators · Introduce behind-the-scenes Stories · A/B test hook styles · Weekly live Q&A", signal: "Success signal: Engagement crosses 2.5%" },
                  { phase: "Phase 3 — Compound", days: "Days 61–90", target: "34K → 40K", items: "Cross-platform content pipeline · User-generated content program · Monthly founder deep-dive Reel · Affiliate/ambassador launch", signal: "Success signal: 40K reached, 3%+ engagement sustained" },
                ].map((p) => (
                  <div key={p.phase} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <div className="flex items-baseline gap-2">
                      <span className="grid size-4 shrink-0 place-items-center rounded-full bg-[color:var(--accent)] font-mono text-[0.55rem] font-bold text-white">●</span>
                      <p className="text-xs"><strong className="text-foreground">{p.phase}</strong> <span className="text-muted-foreground">({p.days})</span></p>
                    </div>
                    <p className="mt-1 text-xs"><strong className="text-[color:var(--green)]">Target: {p.target}</strong></p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.items}</p>
                    <p className="mt-1 text-[0.65rem] italic text-[color:var(--accent)]">{p.signal}</p>
                  </div>
                ))}
              </div>

              {/* ── Content Ideas ── */}
              <h4 className="mt-5 text-sm font-bold">Content Ideas</h4>
              <p className="mt-1 text-xs text-muted-foreground">Three high-leverage content pieces calibrated to the biohacking/wellness niche.</p>
              <div className="mt-2 space-y-2">
                {[
                  { n: "1", title: "\"What Your Adaptogens Actually Do\" Carousel", body: "10-slide educational carousel breaking down each product's mechanism. Slide 1: bold claim. Slides 2-8: science, one compound per slide. Slide 9: before/after user data. Slide 10: CTA to shop." },
                  { n: "2", title: "\"I Formulated This for My Mom\" Founder Reel", body: "60-second Reel: the founder's story. Opens with a photo of their mom, cuts to the lab, ends with the finished product on shelf. Emotional, not promotional. Caption: \"Started in a lab. Tested on the person I trust most.\"" },
                  { n: "3", title: "\"You're Taking Lion's Mane Wrong\" Hook Reel", body: "Contrarian hook stops the scroll. First 3 seconds: text overlay with the claim. Body: explains extraction methods, bioavailability, what to look for. Ends with a soft CTA: \"We do it right — dual-extract, third-party tested.\"" },
                ].map((c) => (
                  <div key={c.n} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <p className="text-xs"><strong className="text-[color:var(--accent)]">{c.n}. {c.title}</strong></p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.body}</p>
                  </div>
                ))}
              </div>

              {/* ── Audit Cadence ── */}
              <h4 className="mt-5 text-sm font-bold">Audit Cadence</h4>
              <p className="mt-1 text-xs text-muted-foreground">How often to re-audit based on follower tier and growth velocity.</p>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full border-collapse text-[0.72rem]">
                  <thead>
                    <tr className="border-b-2 border-border text-left text-[0.6rem] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                      <th className="pb-1.5 pr-2">Cadence</th><th className="pb-1.5 pr-2">Purpose</th><th className="pb-1.5 pr-2">Time</th><th className="pb-1.5">What to Check</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border"><td className="py-1.5 pr-2 font-medium">Weekly</td><td className="py-1.5 pr-2 text-xs text-muted-foreground">Pulse check</td><td className="py-1.5 pr-2 font-mono text-xs">10 min</td><td className="py-1.5 text-xs text-muted-foreground">Engagement rate, top post, reply rate</td></tr>
                    <tr className="border-b border-border"><td className="py-1.5 pr-2 font-medium">Monthly</td><td className="py-1.5 pr-2 text-xs text-muted-foreground">Trend read</td><td className="py-1.5 pr-2 font-mono text-xs">30 min</td><td className="py-1.5 text-xs text-muted-foreground">Format mix, growth rate, content gaps</td></tr>
                    <tr><td className="py-1.5 pr-2 font-medium">Quarterly</td><td className="py-1.5 pr-2 text-xs text-muted-foreground">Full audit</td><td className="py-1.5 pr-2 font-mono text-xs">2–3 hrs</td><td className="py-1.5 text-xs text-muted-foreground">Full 15-section competitive intelligence report</td></tr>
                  </tbody>
                </table>
              </div>

              {/* Teaser */}
              <div className="mt-5 rounded-[var(--radius)] border border-[color:var(--accent)]/20 bg-gradient-to-r from-[color:var(--accent-muted)] to-transparent p-4">
                <p className="text-xs font-semibold text-[color:var(--accent)]">🔒 This is a sample of the full 15-section report</p>
                <p className="mt-1 text-xs text-muted-foreground">Every audit is custom-generated for your account — not a template. The report adapts to your follower tier, niche, and competitive landscape.</p>
              </div>
            </div>
            {/* Scroll fade indicator */}
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white via-white/90 to-transparent" />
          </div>
        </section>

        <hr className="mt-14 border-border" />

        {/* ── 5. Pricing ── */}
        <section id="pricing" className="mt-16 scroll-mt-20">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Pricing
          </h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Start with free Pulse audits. Upgrade when the reports earn their keep.
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
                  <span className={`text-2xl font-semibold ${tier.price.startsWith("$") ? "font-mono" : ""}`}>
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

        {/* ── 6. Blueprint Audit ── */}
        <section className="mt-16">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Blueprint Audit
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            For accounts getting started. A complete pre-launch strategy — not a
            report on what exists, but a plan for what comes next.
          </p>
          <div className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-[color:var(--accent)]/20 bg-white shadow-[var(--shadow-md)]">
            {/* 3 columns — Research / Build / Launch */}
            <div className="grid grid-cols-1 divide-y divide-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {[
                {
                  phase: "Research",
                  icon: "🔭",
                  items: [
                    { title: "Niche Analysis", body: "Market size, demographics, content trends" },
                    { title: "Competitive Landscape", body: "Who's winning at 0–10K, whitespace to occupy" },
                    { title: "Brand Architecture", body: "Handles, bio, visual direction, brand voice" },
                  ],
                },
                {
                  phase: "Build",
                  icon: "🏗",
                  items: [
                    { title: "Content Pillars", body: "3–5 pillars with rationale & example hooks" },
                    { title: "First 30 Posts", body: "Calendar with hooks, formats, captions, timing" },
                    { title: "Platform Setup", body: "Profile optimization, highlights, link-in-bio" },
                  ],
                },
                {
                  phase: "Launch",
                  icon: "🚀",
                  items: [
                    { title: "90-Day Playbook", body: "Week-by-week milestones, tactics, checkpoints" },
                    { title: "Growth Benchmarks", body: "Realistic targets — what &ldquo;on track&rdquo; looks like" },
                    { title: "Monetization Path", body: "When & how to introduce revenue for your niche" },
                  ],
                },
              ].map((col) => (
                <div key={col.phase} className="px-5 py-5">
                  <p className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">
                    {col.icon} {col.phase}
                  </p>
                  <div className="mt-3 space-y-3">
                    {col.items.map((item) => (
                      <div key={item.title}>
                        <p className="text-xs font-semibold text-foreground">{item.title}</p>
                        <p className="mt-0.5 text-[0.65rem] text-muted-foreground leading-relaxed">{item.body}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {/* Footer bar */}
            <div className="flex flex-col items-center gap-3 border-t border-border bg-[#fafaf9] px-5 py-4 sm:flex-row sm:justify-between">
              <div className="text-center sm:text-left">
                <span className="font-mono text-xl font-semibold">$79</span>
                <span className="ml-1 text-xs text-muted-foreground">one-time</span>
                <span className="ml-3 text-[0.65rem] text-muted-foreground">Covers up to 2 accounts · Suggested 0–1K followers</span>
              </div>
              <Link href={primaryHref}>
                <Button className="font-semibold">Get the Blueprint</Button>
              </Link>
            </div>
          </div>
        </section>

        {/* ── 7. FAQ ── */}
        <section className="mt-16">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            FAQ
          </h2>
          <div className="mt-6 space-y-3">
            {[
              {
                q: "What exactly do I get?",
                a: "You get a comprehensive 15-section competitive intelligence report — an evidence-based analysis of your social media presence. It includes your current distribution state, primary growth constraints, peer benchmarking against same-tier accounts, an immediate execution plan for the next 7 days, a 90-day trajectory model with measurable checkpoints, and a monetization architecture recommendation. The report is delivered as a self-contained HTML file you can view in any browser, share with your team, or print.",
              },
              {
                q: "How long does an audit take?",
                a: "Most audits are generated in 6–8 minutes. Our system researches your account across multiple data sources, analyzes content patterns, benchmarks against comparable accounts in your tier, and synthesizes everything into a structured report. You'll see the progress live as each phase completes — from data collection through scoring to final assembly.",
              },
              {
                q: "What platforms do you audit?",
                a: "We currently support Instagram, TikTok, and YouTube, with X (Twitter) and LinkedIn coming soon. Each platform audit is calibrated to its specific algorithm dynamics, content formats, and engagement benchmarks — so an Instagram audit and a TikTok audit for the same account may surface different insights.",
              },
              {
                q: "Why should I trust your score?",
                a: "Our scoring framework evaluates accounts across six weighted dimensions — Content Strategy, Growth Momentum, Engagement Depth, Platform Optimization, Brand Cohesion, and Conversion Architecture — using publicly available data and industry-standard benchmarks. Every dimension is broken down in the report so you can see exactly what contributed to the score. We don't use black-box algorithms or vanity metrics. If something in the analysis doesn't match what you know about your account, you can refine any section through follow-up questions.",
              },
              {
                q: "Who is this for?",
                a: "AuditLayerMedia is built for creators, personal brands, media managers, and small-to-mid-size agencies who need deep competitive intelligence without the overhead of a full-time analyst. Our reports work for accounts of any size — the methodology adapts to your current distribution state. For accounts in the 500–2K follower range just getting started, we recommend the Blueprint Audit: a one-time pre-launch assessment that maps your niche, content pillars, and 90-day launch plan before you scale.",
              },
              {
                q: "What happens after I get the report?",
                a: "The report is designed to be immediately actionable. The 'Immediate Execution Plan' section gives you a constrained, high-probability content set for the next 7 days — specific formats, narrative angles, and posting rationale. The 90-day trajectory model gives you monthly checkpoints to track against. You can also ask follow-up questions to refine any section — adjust the competitive set, deepen a specific recommendation, or add context the system couldn't see from public data alone.",
              },
              {
                q: "How is this different from hiring a social media manager?",
                a: "A social media manager executes — they create content, manage communities, and run your day-to-day presence. AuditLayerMedia provides the strategic layer: competitive intelligence, format analysis, growth diagnostics, and monetization architecture. They're complementary. Our report gives you (or your manager) the roadmap. Many of our users bring their audit to their social media manager and use it to align on priorities. If you don't have a manager yet, the report includes a content calendar and content ideas to get you started on your own.",
              },
            ].map((faq) => (
              <details key={faq.q} className="group rounded-[var(--radius)] border border-border bg-card transition-all">
                <summary className="flex cursor-pointer items-center justify-between p-5 text-sm font-semibold select-none [&::-webkit-details-marker]:hidden">
                  {faq.q}
                  <span className="ml-2 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180">▼</span>
                </summary>
                <p className="px-5 pb-5 text-sm leading-relaxed text-muted-foreground">{faq.a}</p>
              </details>
            ))}
          </div>
        </section>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          <p className="font-semibold text-foreground">AuditLayerMedia</p>
          <p className="mt-1 flex items-center gap-1.5 text-[color:var(--accent)]">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5"/></svg>
            @auditlayermedia
          </p>
          <p className="mt-1 max-w-2xl leading-relaxed">
            AuditLayerMedia provides social media competitive intelligence reports based on publicly available data, platform benchmarks, and industry-standard analytics. We are not affiliated with, endorsed by, or partnered with Instagram, TikTok, YouTube, X (Twitter), or any other platform we audit. All trademarks and handles referenced in our reports belong to their respective owners. Our reports are strategic assessments — not financial, legal, or investment advice. Metrics are estimates drawn from indexed public content and third-party data sources; exact platform analytics may differ. Always verify independently before making business decisions.
          </p>
          <p className="mt-3">© {new Date().getFullYear()} AuditLayerMedia. All rights reserved.</p>
        </footer>
      </main>
    </div>
  );
}
