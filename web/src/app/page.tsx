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
                className="rounded-[var(--radius)] border border-border bg-card p-5 shadow-[var(--shadow-sm)]"
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

        {/* ── 3. Pulse Audit — compact visual preview ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Free Pulse Audit
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            All you need is an email · 2 free runs · No credit card
          </p>

          <div className="relative mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white shadow-[var(--shadow-md)]">
            {/* Header bar */}
            <div className="flex items-center justify-between border-b border-border bg-[#f5f5f4] px-5 py-2.5">
              <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Brand Pulse · @glowstate
              </span>
              <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-[color:var(--green)]">
                Sample
              </span>
            </div>

            <div className="px-4 py-4 sm:px-6 sm:py-5">

              {/* ── Score Bars ── */}
              <div className="flex items-baseline justify-between border-b border-border pb-3">
                <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Score Breakdown</span>
                <span className="font-mono text-lg font-semibold">48<span className="text-xs font-normal text-muted-foreground">/100</span></span>
              </div>
              {[
                { label: "Content Strategy", pct: 32, color: "bg-[color:var(--red)]" },
                { label: "Growth Momentum", pct: 18, color: "bg-[color:var(--red)]" },
                { label: "Engagement Depth", pct: 55, color: "bg-[color:var(--amber)]" },
                { label: "Platform Optimization", pct: 40, color: "bg-[color:var(--amber)]" },
                { label: "Brand Cohesion", pct: 68, color: "bg-[color:var(--green)]" },
                { label: "Conversion Architecture", pct: 22, color: "bg-[color:var(--red)]" },
              ].map((dim) => (
                <div key={dim.label} className="mt-2 flex items-center gap-1.5 sm:gap-2 text-[0.62rem] sm:text-[0.68rem]">
                  <span className="w-20 flex-shrink-0 text-right font-medium text-muted-foreground sm:w-32">{dim.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                    <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                  </div>
                  <span className="w-5 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}</span>
                </div>
              ))}
              <p className="mt-2 text-[0.58rem] italic text-muted-foreground">What this proves: Diagnosis — where you stand</p>

              {/* ── Working / Missing ── */}
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
                <div>
                  <h5 className="text-[0.7rem] font-bold text-[color:var(--green)]">🟢 Working</h5>
                  <ul className="mt-1.5 space-y-1.5">
                    <li className="text-[0.68rem] text-muted-foreground leading-snug">Product differentiation — dual-extract, lab-tested formulations</li>
                    <li className="text-[0.68rem] text-muted-foreground leading-snug">Visual identity — consistent forest green + amber palette</li>
                  </ul>
                </div>
                <div>
                  <h5 className="text-[0.7rem] font-bold text-[color:var(--red)]">🔴 Missing</h5>
                  <ul className="mt-1.5 space-y-1.5">
                    <li className="text-[0.68rem] text-muted-foreground leading-snug">Only 22% of posts are Reels — Instagram weights video 3–5× higher</li>
                    <li className="text-[0.68rem] text-muted-foreground leading-snug">18-hour reply latency — silent community signals low priority to the algorithm</li>
                  </ul>
                </div>
              </div>
              <p className="mt-1 text-[0.58rem] italic text-muted-foreground">What this proves: What&rsquo;s good, what&rsquo;s broken</p>

              {/* ── Three Moves ── */}
              <div className="mt-5 border-t border-border pt-4">
                <h5 className="text-[0.7rem] font-bold">⚡ Three Moves</h5>
                <div className="mt-2 space-y-2">
                  {[
                    "Shift to 60% Reels — prioritise native video to unlock 3–5× reach",
                    "Reply to every comment within 4 hours — restart the engagement signal",
                    "Build story highlight architecture — give new visitors a guided path",
                  ].map((move, i) => (
                    <div key={i} className="flex items-start gap-2.5 rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-2.5">
                      <span className="mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-[0.55rem] font-bold text-white">{i + 1}</span>
                      <span className="text-[0.68rem] text-muted-foreground leading-snug">{move}</span>
                    </div>
                  ))}
                </div>
                <p className="mt-1 text-[0.58rem] italic text-muted-foreground">What this proves: Concrete prescription — 3 numbered actions</p>
              </div>

              {/* ── CTA ── */}
              <div className="mt-5 border-t border-border pt-5 text-center">
                <Link href={primaryHref}>
                  <Button size="lg" className="font-semibold">
                    Run a Free Pulse Audit
                  </Button>
                </Link>
                <p className="mt-2 text-[0.65rem] text-muted-foreground">Get a score, strengths, gaps, and three moves — all from just a handle and email.</p>
              </div>
            </div>
          </div>
        </section>

        <hr className="mt-14 border-border" />

        {/* ── 4. Full Mock Report — the evidence ── */}
        <section className="mt-14">
          <h2 className="text-sm font-semibold uppercase tracking-[0.08em] text-muted-foreground">
            Full 15-Section Report At a Glance
          </h2>

          <div className="relative mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-white shadow-[var(--shadow-md)]">
            <div className="flex items-center justify-between border-b border-border bg-[#f5f5f4] px-5 py-2.5">
              <span className="font-mono text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                Instagram Audit · Sample Report
              </span>
              <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[0.6rem] font-semibold uppercase text-[color:var(--green)]">
                Sample
              </span>
            </div>
            <div className="max-h-[520px] overflow-y-auto px-4 py-4 sm:px-8 sm:py-8">
              <p className="text-[0.62rem] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                Instagram Account Audit
              </p>
              <h3 className="mt-0.5 text-xl font-bold tracking-[-0.02em]">
                @glowstate
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Premium adaptogenic supplements — functional mushrooms, nootropics, and plant-based wellness.
              </p>

              <div className="mt-5 rounded-[var(--radius)] bg-[#fcfcfb] p-4 sm:p-5">
                <div className="mb-3 flex items-baseline justify-between border-b border-border pb-3">
                  <span className="text-[0.62rem] font-bold uppercase tracking-[0.1em] text-muted-foreground">Score Breakdown</span>
                  <span className="font-mono text-xl font-semibold">48<span className="text-xs font-normal text-muted-foreground">/100</span></span>
                </div>
                {[
                  { label: "Content Strategy", pct: 32, color: "bg-gradient-to-r from-[color:var(--red)] to-[color:var(--red)]/70" },
                  { label: "Growth Momentum", pct: 18, color: "bg-gradient-to-r from-[color:var(--red)] to-[color:var(--red)]/70" },
                  { label: "Engagement Depth", pct: 55, color: "bg-gradient-to-r from-[color:var(--amber)] to-[color:var(--amber)]/70" },
                  { label: "Platform Optimization", pct: 40, color: "bg-gradient-to-r from-[color:var(--amber)] to-[color:var(--amber)]/70" },
                  { label: "Brand Cohesion", pct: 68, color: "bg-gradient-to-r from-[color:var(--green)] to-[color:var(--green)]/70" },
                  { label: "Conversion Architecture", pct: 22, color: "bg-gradient-to-r from-[color:var(--red)] to-[color:var(--red)]/70" },
                ].map((dim) => (
                  <div key={dim.label} className="mb-2 flex items-center gap-3 text-xs last:mb-0">
                    <span className="w-24 flex-shrink-0 text-right text-[0.6rem] font-medium text-muted-foreground sm:w-36 sm:text-xs">{dim.label}</span>
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                      <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                    </div>
                    <span className="w-6 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}</span>
                  </div>
                ))}

                <div className="mt-5">
                  <h4 className="text-sm font-bold">Key Metrics</h4>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {[
                      { value: "24.8K", label: "Followers" },
                      { value: "1.42%", label: "Engagement", tone: "text-[color:var(--red)]" },
                      { value: "312", label: "Avg Likes" },
                      { value: "+0.3%", label: "30-Day Growth", tone: "text-[color:var(--amber)]" },
                    ].map((m) => (
                      <div key={m.label} className="rounded-[var(--radius-sm)] border border-border p-3 text-center">
                        <div className={`font-mono text-lg font-semibold leading-none ${m.tone || ""}`}>{m.value}</div>
                        <div className="mt-1 text-[0.58rem] font-medium uppercase tracking-[0.05em] text-muted-foreground">{m.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-5 border-b border-border" />

              <h4 className="mt-5 text-sm font-bold">Executive Summary</h4>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                @glowstate operates in one of Instagram&rsquo;s fastest-growing niches — functional wellness. The brand holds <strong className="text-foreground">24.8K followers</strong> with a clean visual identity, but engagement sits at <strong className="text-foreground">1.42%</strong> — half the 3.5% benchmark. Reels account for only 22% of output despite being the highest-reach format. The root cause is <strong className="text-foreground">format strategy and community activation</strong>: the account treats Instagram as a catalog rather than a publication. Shifting to 60% Reels, reducing reply latency, and building story highlight architecture can realistically reach 40K followers within 90 days.
              </p>

              <div className="mt-5 border-b border-border" />

              <div className="mt-5 rounded-[var(--radius)] bg-[#fcfcfb] p-4 sm:p-5">

              <h4 className="mt-5 text-sm font-bold">Top Strengths</h4>
              <div className="mt-2 space-y-2">
                {[
                  { title: "Product Differentiation", body: "Dual-extract formulations and third-party lab testing are rare structural moats in the adaptogen space." },
                  { title: "Visual Identity", body: "Forest green + amber palette is consistent and intentional, building trust at a glance." },
                  { title: "Posting Consistency", body: "4–5 posts per week maintained over 8+ months. The habit infrastructure is already in place." },
                ].map((s) => (
                  <div key={s.title} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <p className="text-xs"><strong className="text-foreground">{s.title}.</strong> <span className="text-muted-foreground">{s.body}</span></p>
                  </div>
                ))}
              </div>

              <h4 className="mt-5 text-sm font-bold">Top Gaps</h4>
              <div className="mt-2 space-y-2">
                {[
                  { title: "Reel Under-Adoption", body: "Only 22% of posts are Reels. Instagram weights native video 3–5× over static images." },
                  { title: "Silent Community", body: "18-hour average reply latency signals low engagement depth to the algorithm." },
                  { title: "No Highlight Architecture", body: "Missing story highlights leave new visitors without a guided conversion path." },
                ].map((w) => (
                  <div key={w.title} className="rounded-[var(--radius-sm)] border-l-2 border-[color:var(--red)]/30 bg-[color:var(--red-muted)]/30 p-3">
                    <p className="text-xs"><strong className="text-foreground">{w.title}.</strong> <span className="text-muted-foreground">{w.body}</span></p>
                  </div>
                ))}
              </div>
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 5. Root Cause Analysis */}
              <h4 className="mt-5 text-sm font-bold">Root Cause Analysis</h4>
              <p className="mt-1 text-xs text-muted-foreground">Why these gaps exist — not just what they are.</p>
              <div className="mt-2 space-y-2">
                {[
                  { cause: "No dedicated creator", effect: "Without a content owner, the feed defaults to product photography — Instagram's lowest-reach format." },
                  { cause: "UGC pipeline unmanaged", effect: "User-generated content drifts in without curation, diluting the brand voice and visual identity." },
                  { cause: "Algorithm unfamiliarity", effect: "Instagram's current algorithm weights native video 3–5× above static images, but only 22% of posts are Reels." },
                ].map((r) => (
                  <div key={r.cause} className="rounded-[var(--radius-sm)] border border-[color:var(--amber)]/30 bg-[color:var(--amber-muted)]/20 p-3">
                    <p className="text-xs"><strong className="text-foreground">{r.cause}</strong></p>
                    <p className="mt-0.5 text-[0.68rem] text-muted-foreground">{r.effect}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 6. Peer Comparison */}
              <h4 className="mt-5 text-sm font-bold">Peer Comparison</h4>
              <div className="mt-2 overflow-x-auto">
                <table className="w-full text-[0.68rem]">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="pb-2 pr-2 font-medium">Account</th>
                      <th className="pb-2 pr-2 font-medium">Followers</th>
                      <th className="pb-2 pr-2 font-medium">Engagement</th>
                      <th className="pb-2 font-medium">Format Mix</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border">
                      <td className="py-1.5 pr-2 font-semibold text-foreground">@glowstate</td>
                      <td className="py-1.5 pr-2">24.8K</td>
                      <td className="py-1.5 pr-2 text-[color:var(--red)]">1.42%</td>
                      <td className="py-1.5">22% Reels</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-1.5 pr-2">@mudwtr</td>
                      <td className="py-1.5 pr-2">18.2K</td>
                      <td className="py-1.5 pr-2 text-[color:var(--green)]">3.8%</td>
                      <td className="py-1.5">65% Reels</td>
                    </tr>
                    <tr className="border-b border-border">
                      <td className="py-1.5 pr-2">@ryzesuperfoods</td>
                      <td className="py-1.5 pr-2">31.5K</td>
                      <td className="py-1.5 pr-2 text-[color:var(--amber)]">2.9%</td>
                      <td className="py-1.5">50% Reels</td>
                    </tr>
                    <tr>
                      <td className="py-1.5 pr-2">@curehydration</td>
                      <td className="py-1.5 pr-2">22.1K</td>
                      <td className="py-1.5 pr-2 text-[color:var(--green)]">4.1%</td>
                      <td className="py-1.5">70% Reels</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 7. Content Format Analysis */}
              <h4 className="mt-5 text-sm font-bold">Content Format Analysis</h4>
              <div className="mt-2 space-y-1.5">
                {[
                  { format: "Static images", pct: 58, assessment: "Overweight — lowest reach format", tone: "text-[color:var(--red)]" },
                  { format: "Reels", pct: 22, assessment: "Underweight — highest reach potential", tone: "text-[color:var(--red)]" },
                  { format: "Carousels", pct: 15, assessment: "Underused — strong save-rate driver", tone: "text-[color:var(--amber)]" },
                  { format: "Stories", pct: 5, assessment: "Missing — no highlight architecture", tone: "text-[color:var(--red)]" },
                ].map((f) => (
                  <div key={f.format} className="flex items-center rounded-[var(--radius-sm)] bg-[#fcfcfb] px-3 py-2">
                    <span className="w-16 flex-shrink-0 text-[0.62rem] font-medium sm:w-24 sm:text-xs">{f.format}</span>
                    <span className="w-7 flex-shrink-0 text-right font-mono text-[0.6rem] font-semibold sm:w-8 sm:text-xs">{f.pct}%</span>
                    <span className={`ml-1.5 text-[0.58rem] sm:ml-3 sm:text-[0.65rem] ${f.tone}`}>{f.assessment}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 8. Engagement Growth Strategy */}
              <h4 className="mt-5 text-sm font-bold">Engagement Growth Strategy</h4>
              <div className="mt-2 space-y-2">
                {[
                  { lever: "Format rebalance", action: "Shift from 22% to 60% Reels over 30 days. Post 1 Reel daily, 2 static images weekly, 1 carousel weekly." },
                  { lever: "Reply velocity", action: "Close the 18-hour reply gap. Target: every comment acknowledged within 4 hours. This alone signals 'active community' to the algorithm." },
                  { lever: "Story architecture", action: "Build 5 story highlights: Product Science, Reviews, Founder, Behind the Scenes, FAQ. Update weekly." },
                ].map((s) => (
                  <div key={s.lever} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <p className="text-xs"><strong className="text-foreground">{s.lever}:</strong> <span className="text-muted-foreground">{s.action}</span></p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 9. Quick Wins — This Week */}
              <h4 className="mt-5 text-sm font-bold">Quick Wins — This Week</h4>
              <div className="mt-2 space-y-1.5">
                {[
                  "Post one Reel today — product demo or founder speaking directly to camera.",
                  "Reply to every pending comment and DM from the last 7 days.",
                  "Create the first story highlight: Product Science.",
                  "Draft a carousel breaking down one ingredient's mechanism of action.",
                  "Pin your best-performing Reel to the top of your grid.",
                ].map((win, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    <span className="mt-0.5 flex size-4 flex-shrink-0 items-center justify-center rounded-full bg-[color:var(--accent)] text-[0.55rem] font-bold text-white">{i + 1}</span>
                    <span className="text-muted-foreground">{win}</span>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 10. Success Benchmarks */}
              <h4 className="mt-5 text-sm font-bold">Success Benchmarks</h4>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {[
                  { label: "Engagement Rate", target: "3.5%+", timeframe: "90 days" },
                  { label: "Reels / Week", target: "5+", timeframe: "30 days" },
                  { label: "Reply Time", target: "<4 hrs", timeframe: "Immediate" },
                  { label: "Follower Growth", target: "+15%", timeframe: "90 days" },
                  { label: "Reach / Post", target: "5K+", timeframe: "60 days" },
                  { label: "Save Rate", target: "8%+", timeframe: "60 days" },
                ].map((b) => (
                  <div key={b.label} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3 text-center">
                    <div className="font-mono text-lg font-semibold text-[color:var(--accent)]">{b.target}</div>
                    <div className="mt-0.5 text-[0.58rem] font-medium uppercase tracking-[0.04em] text-muted-foreground">{b.label}</div>
                    <div className="mt-0.5 text-[0.55rem] text-muted-foreground">{b.timeframe}</div>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 11. Audience Profile */}
              <h4 className="mt-5 text-sm font-bold">Audience Profile</h4>
              <div className="mt-2 grid grid-cols-2 gap-3">
                <div className="rounded-[var(--radius-sm)] bg-[#fcfcfb] p-3">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">Primary Audience</p>
                  <p className="mt-1 text-xs text-muted-foreground">Health-conscious millennials (28–40) seeking functional alternatives to caffeine and pharmaceuticals. Biohacking-curious, already spending on supplements.</p>
                </div>
                <div className="rounded-[var(--radius-sm)] bg-[#fcfcfb] p-3">
                  <p className="text-[0.62rem] font-bold uppercase tracking-[0.08em] text-muted-foreground">What They Want</p>
                  <p className="mt-1 text-xs text-muted-foreground">Evidence-backed product education, not lifestyle content. Ingredient mechanisms, third-party testing, and dosing rationale outperform aspirational imagery.</p>
                </div>
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 12. Road to 40K (90-Day Growth Map) */}
              <h4 className="mt-5 text-sm font-bold">Road to 40K — 90-Day Growth Map</h4>
              <div className="mt-3 space-y-3">
                {[
                  { phase: "Phase 1 — Foundation", days: "Days 1–30", target: "24.8K → 29K", detail: "Shift to 60% Reels, build highlight architecture, reply to every comment." },
                  { phase: "Phase 2 — Acceleration", days: "Days 31–60", target: "29K → 34K", detail: "Collaborate with 2 wellness creators, launch weekly AMAs, A/B test hook styles." },
                  { phase: "Phase 3 — Compound", days: "Days 61–90", target: "34K → 40K", detail: "Cross-platform pipeline, UGC program, affiliate launch. Sustain 3%+ engagement." },
                ].map((p) => (
                  <div key={p.phase} className="rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-3">
                    <p className="text-xs"><strong className="text-foreground">{p.phase}</strong> <span className="text-muted-foreground">({p.days})</span></p>
                    <p className="mt-1 text-xs"><strong className="text-[color:var(--green)]">Target: {p.target}</strong></p>
                    <p className="mt-1 text-xs text-muted-foreground">{p.detail}</p>
                  </div>
                ))}
              </div>

              <div className="mt-5 border-b border-border" />

              {/* 13. Audit Cadence */}
              <h4 className="mt-5 text-sm font-bold">Audit Cadence</h4>
              <div className="mt-2 space-y-2">
                {[
                  { label: "Weekly", desc: "10-min pulse: check engagement on last 7 posts, follower delta, reply rate.", time: "10 min" },
                  { label: "Monthly", desc: "Lightweight audit: engagement trend, top/bottom 3 posts, save rate, format mix.", time: "30 min" },
                  { label: "Quarterly", desc: "Full re-audit with updated peer benchmarks and progress against roadmap.", time: "2–3 hrs" },
                  { label: "After a Good Post", desc: "When a post hits 2× your average — audit immediately. Replicate within 48 hours.", time: "20 min" },
                ].map((c) => (
                  <div key={c.label} className="flex items-start justify-between rounded-[var(--radius-sm)] border border-border bg-[#fcfcfb] p-2.5">
                    <div>
                      <span className="text-xs font-semibold text-foreground">{c.label}</span>
                      <p className="mt-0.5 text-[0.65rem] text-muted-foreground">{c.desc}</p>
                    </div>
                    <span className="ml-2 flex-shrink-0 font-mono text-[0.6rem] font-semibold text-muted-foreground">{c.time}</span>
                  </div>
                ))}
              </div>

              {/* 14. Footer + 15. Powered by AuditLayerMedia */}
              <div className="mt-5 border-t border-border pt-4 text-center">
                <div className="inline-flex items-center gap-1.5 rounded-md bg-[#1c1917] px-3 py-1">
                  <span className="text-[0.6rem] font-bold uppercase tracking-[0.1em] text-white">ALM</span>
                </div>
                <p className="mt-1.5 text-[0.6rem] text-muted-foreground">auditlayermedia.com</p>
              </div>

              {/* Disclaimer */}
              <div className="mt-5 rounded-[var(--radius)] border border-[color:var(--accent)]/20 bg-gradient-to-r from-[color:var(--accent-muted)] to-transparent p-4">
                <p className="text-xs font-semibold text-[color:var(--accent)]">This is an execution plan</p>
                <p className="mt-1 text-xs text-muted-foreground">Every AuditLayerMedia report is a strategy document — a roadmap built from research and data. You still need a media team to create the content, film the videos, write the captions, and implement the plan. We give you the playbook. Your team runs it.</p>
              </div>
            </div>
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
                className={`flex flex-col rounded-[calc(var(--radius)+2px)] border p-5 transition-all duration-200 hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 ${
                  tier.highlighted
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)] shadow-[var(--shadow-md)] hover:border-[color:var(--accent)]/70"
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
        <section className="mt-10">
          <div className="mx-auto max-w-xl rounded-[calc(var(--radius)+2px)] border border-[color:var(--accent)]/30 bg-gradient-to-br from-[color:var(--accent-muted)]/60 to-transparent p-6 sm:p-8">
            <div className="flex items-center justify-center gap-2">
              <h3 className="text-base font-semibold">Blueprint Audit</h3>
              <span className="rounded-full bg-[color:var(--accent)]/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[color:var(--accent)]">One-time</span>
            </div>
            <p className="mt-1 text-center text-xs text-muted-foreground">Set up to two accounts with a complete pre-launch strategy</p>
            <p className="mt-0.5 text-center text-[0.65rem] font-medium text-[color:var(--accent)]">Suggested for accounts 0–1K followers</p>

            {/* 3-column phase layout */}
            <div className="mt-5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                { icon: "🔭", phase: "Research", items: ["Niche analysis", "Handle evaluation", "Competitive map"] },
                { icon: "🏗", phase: "Build", items: ["Content pillars", "First 10 content ideas", "Platform setup"] },
                { icon: "🚀", phase: "Launch", items: ["90-day playbook", "Weekly milestones", "Format strategy"] },
              ].map((col) => (
                <div key={col.phase} className="rounded-[var(--radius-sm)] bg-white/50 p-3 text-center">
                  <span className="text-lg">{col.icon}</span>
                  <p className="mt-1 text-[0.65rem] font-bold uppercase tracking-[0.06em] text-muted-foreground">{col.phase}</p>
                  <ul className="mt-1.5 space-y-0.5">
                    {col.items.map((item) => (
                      <li key={item} className="text-[0.6rem] text-muted-foreground">{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-baseline justify-center gap-1">
              <span className="font-mono text-2xl font-semibold">$79</span>
              <span className="text-xs text-muted-foreground">one-time</span>
            </div>
            <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left">
              {[
                "Full 15-section pre-launch assessment",
                "90-day launch playbook with weekly milestones",
                "Platform-by-platform setup guide",
              ].map((f) => (
                <li key={f} className="flex items-start gap-2 text-[0.7rem] text-muted-foreground">
                  <Check className="mt-0.5 size-3 shrink-0 text-[color:var(--green)]" />
                  {f}
                </li>
              ))}
            </ul>
            <div className="mt-4 text-center">
              <Link href={primaryHref}>
                <Button variant="outline" className="font-medium">
                  Get the Blueprint
                </Button>
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
