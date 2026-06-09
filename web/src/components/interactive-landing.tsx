"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { 
  ArrowRight, Check, Sparkles, Loader2, Info, 
  Search, ArrowUpRight, BarChart3, 
  ListChecks, TrendingUp, Lightbulb, RefreshCw, Lock
} from "lucide-react";

const InstagramIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

const YoutubeIcon = (props: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={props.className}
  >
    <path d="M22.54 6.42a2.78 2.78 0 0 0-1.95-1.96C18.88 4 12 4 12 4s-6.88 0-8.6.46A2.78 2.78 0 0 0 1.46 6.42a29 29 0 0 0-.46 5.33a29 29 0 0 0 .46 5.33a2.78 2.78 0 0 0 1.94 2C4.72 19.6 11.6 19.6 11.6 19.6s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2a29 29 0 0 0 .46-5.25a29 29 0 0 0-.46-5.33z" />
    <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" fill="currentColor" />
  </svg>
);
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

// Platform colors & labels
const PLATFORM_ICONS: Record<string, any> = {
  instagram: InstagramIcon,
  tiktok: () => (
    <svg className="size-4 shrink-0" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.17-2.89-.6-4.09-1.51l-.09-.08v7.44c.01 4.54-3.56 8.16-8.1 8.16-3.88 0-7.3-2.73-8.1-6.52-.96-4.51 2.3-8.8 6.81-9.76.62-.13 1.25-.2 1.88-.2 1.34-.01 2.68.01 4.02-.03.01.21.01.42.01.62-.02 1.2-.01 2.4-.02 3.6-1.15.11-2.34-.23-3.23-.97-.99-.81-1.49-2.09-1.34-3.34.09-1.28.79-2.45 1.86-3.11.95-.59 2.1-.79 3.2-.62.59.09 1.16.32 1.63.69-.02.16-.03.32-.05.48h.04z" />
    </svg>
  ),
  youtube: YoutubeIcon,
  x: () => <span className="font-bold font-sans text-xs shrink-0">𝕏</span>,
  linkedin: () => <span className="font-bold font-sans text-xs shrink-0">In</span>,
  unknown: Search,
};

const PLATFORMS = ["instagram", "tiktok", "youtube", "x", "linkedin"] as const;

function normalizeHandle(handle: string): string {
  let cleaned = handle.trim().toLowerCase();
  cleaned = cleaned.replace(/^https:\/\//, "").replace(/^http:\/\//, "");
  cleaned = cleaned.replace(/^www\./, "");
  cleaned = cleaned.replace(/^(instagram\.com|tiktok\.com|youtube\.com|x\.com|twitter\.com|linkedin\.com)\//, "");
  cleaned = cleaned.replace(/^@/, "");
  cleaned = cleaned.replace(/[^a-z0-9_.-]/g, "");
  return cleaned;
}

function detectPlatform(handleOrUrl: string): string {
  const val = handleOrUrl.toLowerCase();
  if (val.includes("tiktok")) return "tiktok";
  if (val.includes("youtube") || val.includes("youtu.be")) return "youtube";
  if (val.includes("x.com") || val.includes("twitter")) return "x";
  if (val.includes("linkedin")) return "linkedin";
  return "instagram"; // Default bare handle to Instagram
}

// Goals matched to domain
const GOALS = [
  { value: "growth", label: "Grow Audience", desc: "Reels adoption, format mix & algorithmic reach" },
  { value: "monetization", label: "Monetize Bio", desc: "CPG funnels, newsletters & product conversion" },
  { value: "rebrand", label: "Sharpen Message", desc: "Scientific niche calibration & brand storytelling" },
];

export function InteractivePulseWidget() {
  const [handle, setHandle] = useState("");
  const [platform, setPlatform] = useState<string>("instagram");
  const [goal, setGoal] = useState<string>("growth");
  const [step, setStep] = useState<"input" | "goal" | "scanning" | "report">("input");
  const [scanStep, setScanStep] = useState(0);
  const [pulseScore, setPulseScore] = useState(48);

  const normalized = normalizeHandle(handle);

  // Auto detect platform on input change
  useEffect(() => {
    if (handle) {
      setPlatform(detectPlatform(handle));
    }
  }, [handle]);

  // Handle simulation
  useEffect(() => {
    if (step !== "scanning") return;
    setScanStep(0);
    const intervals = [
      setTimeout(() => setScanStep(1), 1200),
      setTimeout(() => setScanStep(2), 2400),
      setTimeout(() => setScanStep(3), 3600),
      setTimeout(() => {
        // Calculate a score based on handle length & selected goal just for fun variety
        const base = 35 + (normalized.length % 15);
        const modifier = goal === "growth" ? 8 : goal === "monetization" ? 3 : 11;
        setPulseScore(Math.min(94, base + modifier));
        setStep("report");
      }, 4800),
    ];
    return () => intervals.forEach(clearTimeout);
  }, [step, goal, normalized]);

  const handleStartScan = (e: React.FormEvent) => {
    e.preventDefault();
    if (normalized.length >= 2) {
      setStep("goal");
    }
  };

  const IconComponent = PLATFORM_ICONS[platform] || Search;

  return (
    <div className="relative mx-auto mt-8 w-full max-w-md overflow-hidden rounded-2xl border border-border bg-card p-6 shadow-md transition-all duration-300">
      {step === "input" && (
        <form onSubmit={handleStartScan} className="space-y-4 text-left">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Run a Free Instant Brand Pulse</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Start with a handle. See raw strengths and gaps instantly.</p>
          </div>

          <div className="space-y-2">
            <div className="relative">
              <span className="absolute inset-y-0 left-3 flex items-center text-muted-foreground">
                <IconComponent className="size-4 shrink-0 transition-all text-[color:var(--accent)]" />
              </span>
              <Input
                value={handle}
                onChange={(e) => setHandle(e.target.value)}
                placeholder="Enter Instagram or TikTok handle (e.g. @glowstate)"
                className="pl-9 pr-24 font-mono text-sm h-11"
                autoFocus
              />
              <div className="absolute inset-y-0 right-2 flex items-center gap-1">
                {normalized.length >= 2 && (
                  <Badge tone="accent" className="text-[10px] font-semibold py-0.5 border-[color:var(--accent)] bg-[color:var(--accent-muted)] text-[color:var(--accent)]">
                    {platform.toUpperCase()}
                  </Badge>
                )}
              </div>
            </div>
          </div>

          <Button 
            type="submit" 
            disabled={normalized.length < 2} 
            className="w-full h-10 font-semibold"
          >
            Analyze Handle
            <ArrowRight className="size-4" />
          </Button>

          <p className="text-[10px] text-muted-foreground text-center">
            2 free runs per session · No login required to scan
          </p>
        </form>
      )}

      {step === "goal" && (
        <div className="space-y-4 text-left animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div>
            <h3 className="text-base font-semibold tracking-tight">Select your calibration goal</h3>
            <p className="text-xs text-muted-foreground mt-0.5">What are you optimizing @{normalized} for?</p>
          </div>

          <div className="space-y-2">
            {GOALS.map((g) => (
              <button
                key={g.value}
                onClick={() => setGoal(g.value)}
                className={`w-full flex flex-col p-3 rounded-lg border text-left transition-all ${
                  goal === g.value
                    ? "border-[color:var(--accent)] bg-[color:var(--accent-muted)]"
                    : "border-border bg-card hover:bg-neutral-50"
                }`}
              >
                <span className="text-xs font-semibold">{g.label}</span>
                <span className="text-[10px] text-muted-foreground mt-0.5">{g.desc}</span>
              </button>
            ))}
          </div>

          <div className="flex gap-2 pt-2">
            <Button 
              variant="outline" 
              onClick={() => setStep("input")} 
              className="flex-1 h-10 font-semibold"
            >
              Back
            </Button>
            <Button 
              onClick={() => setStep("scanning")} 
              className="flex-1 h-10 font-semibold"
            >
              Scan Profile
              <Sparkles className="size-4" />
            </Button>
          </div>
        </div>
      )}

      {step === "scanning" && (
        <div className="py-8 text-center space-y-6">
          <div className="relative size-16 mx-auto flex items-center justify-center">
            <div className="absolute inset-0 rounded-full border-2 border-[color:var(--accent)]/20 animate-ping" />
            <Loader2 className="size-8 text-[color:var(--accent)] animate-spin" />
          </div>

          <div className="space-y-2">
            <h4 className="text-sm font-semibold">Analyzing @{normalized}...</h4>
            <div className="flex flex-col items-center gap-1.5 font-mono text-[11px] text-muted-foreground">
              <span className={scanStep >= 0 ? "text-[color:var(--accent)] font-semibold transition-all" : ""}>
                {scanStep >= 0 ? "✓ Connecting platform data API" : "Connecting platform data API..."}
              </span>
              <span className={scanStep >= 1 ? "text-[color:var(--accent)] font-semibold transition-all" : ""}>
                {scanStep >= 1 ? "✓ Extracting recent feed metrics" : scanStep === 0 ? "→ Crawling public indexed feed data..." : "Crawling public indexed feed data"}
              </span>
              <span className={scanStep >= 2 ? "text-[color:var(--accent)] font-semibold transition-all" : ""}>
                {scanStep >= 2 ? "✓ Running strategic niche calibration" : scanStep === 1 ? "→ Running strategic niche calibration..." : "Running strategic niche calibration"}
              </span>
              <span className={scanStep >= 3 ? "text-foreground font-semibold" : ""}>
                {scanStep === 2 ? "→ Compiling visual report cards..." : ""}
              </span>
            </div>
          </div>
        </div>
      )}

      {step === "report" && (
        <div className="space-y-5 text-left animate-in zoom-in-95 duration-300">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <span className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                Pulse Score · @{normalized}
              </span>
              <h4 className="text-sm font-bold capitalize mt-0.5">{platform} Audit</h4>
            </div>
            <div className="text-right">
              <span className="font-mono text-2xl font-bold text-[color:var(--accent)]">{pulseScore}</span>
              <span className="text-[10px] text-muted-foreground">/100</span>
            </div>
          </div>

          {/* Quick Stats Grid */}
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-border p-2 bg-neutral-50/50">
              <p className="font-mono text-xs font-semibold">{goal === "growth" ? "1.45%" : goal === "monetization" ? "0.38%" : "Low"}</p>
              <p className="text-[9px] text-muted-foreground uppercase mt-0.5">
                {goal === "growth" ? "Engagement Rate" : goal === "monetization" ? "Conversion Surface" : "Story Clout"}
              </p>
            </div>
            <div className="rounded-lg border border-border p-2 bg-neutral-50/50">
              <p className="font-mono text-xs font-semibold text-[color:var(--red)]">-{goal === "growth" ? "42%" : "60%"}</p>
              <p className="text-[9px] text-muted-foreground uppercase mt-0.5">Format Gaps</p>
            </div>
          </div>

          {/* Score Bars */}
          <div className="space-y-2">
            {[
              { label: "Content Structure", pct: Math.round(pulseScore * 0.9), color: "bg-[color:var(--green)]" },
              { label: "Niche Authority", pct: Math.round(pulseScore * 0.7), color: "bg-[color:var(--amber)]" },
              { label: "Audience Magnetism", pct: Math.round(pulseScore * 0.5), color: "bg-[color:var(--red)]" },
            ].map((dim) => (
              <div key={dim.label} className="flex items-center gap-2 text-[11px]">
                <span className="w-24 flex-shrink-0 text-muted-foreground">{dim.label}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-neutral-100">
                  <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                </div>
                <span className="w-6 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}%</span>
              </div>
            ))}
          </div>

          {/* Gaps / Strengths Summary */}
          <div className="rounded-lg border border-border bg-neutral-50 p-3 text-[11px] space-y-1.5 leading-relaxed text-muted-foreground">
            <p>🟢 <strong className="text-foreground">Brand Moat:</strong> Visual aesthetics and grid curation are locked in to a premium standard.</p>
            <p>🔴 <strong className="text-foreground">Critical Gap:</strong> {goal === "growth" 
              ? "Reels represent under 25% of content. Massive reach is left on table." 
              : goal === "monetization" 
              ? "Link-in-bio is passive. Bio contains no lead magnets or direct conversion funnels." 
              : "Founder story is completely invisible. No video anchor to build long-term trust."}
            </p>
          </div>

          {/* Sunk-cost Conversion CTA */}
          <div className="space-y-3 pt-2">
            <Link href={`/login?handle=${normalized}&goal=${goal}&platform=${platform}`}>
              <Button className="w-full font-semibold relative overflow-hidden group">
                <span className="relative z-10 flex items-center justify-center gap-1.5">
                  Save & Get Detailed 15-Section Report
                  <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                </span>
                <div className="absolute inset-0 bg-gradient-to-r from-[color:var(--accent)] to-[#0f766e] opacity-0 group-hover:opacity-100 transition-opacity" />
              </Button>
            </Link>
            <button 
              onClick={() => setStep("input")} 
              className="w-full text-center text-[10px] text-muted-foreground underline hover:text-foreground"
            >
              Analyze another handle
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Interactive Mock Report component
// ─────────────────────────────────────────────────────────────────────────────

type TabType = "metrics" | "priorities" | "growth" | "ideas";

export function InteractiveReportViewer() {
  const [activeTab, setActiveTab] = useState<TabType>("metrics");

  return (
    <div className="relative mt-6 overflow-hidden rounded-2xl border border-border bg-white shadow-md transition-all duration-300">
      {/* Report Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-border bg-[#f5f5f4] px-5 py-3 gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
            Instagram Audit · @glowstate
          </span>
          <span className="rounded-full bg-[color:var(--green-muted)] px-2 py-0.5 font-mono text-[9px] font-bold uppercase text-[color:var(--green)]">
            Verified
          </span>
        </div>
        
        {/* Navigation Tabs */}
        <div className="flex flex-wrap gap-1">
          {[
            { id: "metrics", label: "📊 Scores", icon: BarChart3 },
            { id: "priorities", label: "🎯 Gaps", icon: ListChecks },
            { id: "ideas", label: "💡 Ideas", icon: Lightbulb },
            { id: "growth", label: "📈 Plan", icon: TrendingUp },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-semibold transition-all ${
                  activeTab === tab.id
                    ? "bg-white text-foreground shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-white/50"
                }`}
              >
                <Icon className="size-3 shrink-0" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Report Scrollable Body */}
      <div className="max-h-[500px] overflow-y-auto px-5 py-6 sm:px-8 sm:py-8 text-left relative">
        
        {activeTab === "metrics" && (
          <div className="space-y-6 animate-in fade-in duration-200">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[color:var(--accent)]">
                Instagram Account Audit
              </p>
              <h3 className="mt-0.5 text-xl font-bold tracking-[-0.02em]">
                @glowstate
              </h3>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                Premium adaptogenic supplements — functional mushrooms, nootropics, and plant-based wellness.
              </p>
            </div>

            {/* Score bars block */}
            <div className="rounded-xl border border-border bg-[#fcfcfb] p-4 sm:p-5">
              <div className="mb-4 flex items-baseline justify-between border-b border-border pb-3">
                <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">Audit Score Breakdown</span>
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
                <div key={dim.label} className="mb-2.5 flex items-center gap-3 text-xs last:mb-0">
                  <span className="w-24 flex-shrink-0 text-right text-[11px] font-medium text-muted-foreground sm:w-36">{dim.label}</span>
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#f0efed]">
                    <div className={`h-full rounded-full ${dim.color}`} style={{ width: `${dim.pct}%` }} />
                  </div>
                  <span className="w-6 flex-shrink-0 text-right font-mono font-semibold">{dim.pct}</span>
                </div>
              ))}
            </div>

            {/* Raw Metrics Summary */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Key Channel Metrics</h4>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { value: "24.8K", label: "Followers", status: "Baseline" },
                  { value: "1.42%", label: "Engagement", status: "Below Avg", tone: "text-[color:var(--red)]" },
                  { value: "312", label: "Avg Likes", status: "Stable" },
                  { value: "+0.3%", label: "30-Day Growth", status: "Lagging", tone: "text-[color:var(--amber)]" },
                ].map((m) => (
                  <div key={m.label} className="rounded-lg border border-border p-3 text-center bg-[#fcfcfb]">
                    <div className={`font-mono text-base font-semibold leading-none ${m.tone || ""}`}>{m.value}</div>
                    <div className="mt-1 text-[9px] font-medium uppercase tracking-[0.05em] text-muted-foreground">{m.label}</div>
                    <div className="text-[8px] text-muted-foreground mt-0.5">{m.status}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {activeTab === "priorities" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h4 className="text-sm font-bold">Top Content & Strategy Gaps</h4>
              <p className="text-xs text-muted-foreground mt-0.5">High priority roadblocks diagnosed from public channel velocity.</p>
            </div>

            <div className="space-y-3">
              {[
                { 
                  n: "1", 
                  title: "Reel Under-Adoption", 
                  type: "Format Gaps",
                  body: "Only 22% of posts are Reels. Instagram's algorithm weights native video 3–5x over static images. This alone explains roughly half the reach gap." 
                },
                { 
                  n: "2", 
                  title: "Silent Community", 
                  type: "Engagement",
                  body: "Average reply latency of 18 hours. Comments that go unanswered in the first 60 minutes signal low engagement depth to the algorithm, capping viral potential." 
                },
                { 
                  n: "3", 
                  title: "No Highlight Architecture", 
                  type: "Conversion",
                  body: "The profile lacks structured story highlights (no Founder story, no Testimonials). New visitors have no logical conversion pathway after viewing the bio." 
                },
              ].map((w) => (
                <div key={w.n} className="rounded-xl border-l-3 border-[color:var(--red)] bg-[color:var(--red-muted)]/40 p-4 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-[9px] font-bold text-[color:var(--red)] uppercase tracking-wider">{w.type}</span>
                    <span className="text-[10px] font-mono font-bold text-muted-foreground">CRITICAL #{w.n}</span>
                  </div>
                  <h5 className="text-xs font-bold text-foreground mt-0.5">{w.title}</h5>
                  <p className="text-[11px] text-muted-foreground leading-relaxed mt-1">{w.body}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "ideas" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h4 className="text-sm font-bold">Calibrated Content Templates</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Three high-leverage content pieces calibrated to the biohacking/wellness niche.</p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { 
                  n: "1", 
                  title: "\"What Your Adaptogens Actually Do\"", 
                  tag: "Educational Carousel",
                  body: "10-slide carousel breaking down product mechanisms. Bold contrarian claim on slide 1, third-party lab studies on slide 2-7, clear biohacking routine call-to-action on slide 10." 
                },
                { 
                  n: "2", 
                  title: "\"I Formulated This for My Family\"", 
                  tag: "Founder Reel",
                  body: "60-second raw behind-the-scenes video. Opens with a clinical problem, cuts to raw lab footage, and details the founder's pure family motive. Emotional, high-trust, low-promotion." 
                },
                { 
                  n: "3", 
                  title: "\"You're Taking Lion's Mane Wrong\"", 
                  tag: "Hook-Driven Video",
                  body: "A high-retention video confronting standard supplementation fallacies. Opens with a visual hook within 3 seconds, explains extraction heat differences, and presents @glowstate as solution." 
                },
              ].map((c) => (
                <div key={c.n} className="rounded-xl border border-border bg-[#fcfcfb] p-4 flex flex-col justify-between space-y-3">
                  <div className="space-y-1">
                    <span className="rounded-full bg-[color:var(--accent-muted)] text-[9px] font-bold text-[color:var(--accent)] px-2 py-0.5 border border-[color:var(--accent)]/10">
                      {c.tag}
                    </span>
                    <h5 className="text-xs font-bold leading-snug pt-1">{c.title}</h5>
                    <p className="text-[10.5px] text-muted-foreground leading-relaxed pt-0.5">{c.body}</p>
                  </div>
                  <div className="text-[9px] font-mono text-muted-foreground pt-2 border-t border-border/60">
                    IDEO-ID: #0{c.n}-GLOW
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === "growth" && (
          <div className="space-y-5 animate-in fade-in duration-200">
            <div>
              <h4 className="text-sm font-bold">90-Day Structural Milestones</h4>
              <p className="text-xs text-muted-foreground mt-0.5">Execution blueprint Grounded in actual platform growth variables.</p>
            </div>

            <div className="relative border-l border-border pl-4 ml-2 space-y-6 pt-1">
              {[
                { 
                  phase: "Phase 1 — Foundation", 
                  days: "Days 1–30", 
                  target: "24.8K → 29K", 
                  items: "Shift mix to 60% Reels · Set up story highlight paths · Restructure caption hook timing · Limit comment latency to under 2 hours",
                  signal: "Success Metric: 3+ Reels exceed 10K organic views" 
                },
                { 
                  phase: "Phase 2 — Acceleration", 
                  days: "Days 31–60", 
                  target: "29K → 34K", 
                  items: "Co-collaborate with peer biohackers · Run a weekly AMA on story highlights · Launch educational carousels with direct bio links",
                  signal: "Success Metric: Engagement rate crosses 2.5%" 
                },
                { 
                  phase: "Phase 3 — Compounding Scale", 
                  days: "Days 61–90", 
                  target: "34K → 40K", 
                  items: "Automate dm triggers via comments · Launch user-generated video programs · Launch affiliate/care programs with core clinicians",
                  signal: "Success Metric: 40K followers with 3%+ consistent engagement" 
                },
              ].map((p, i) => (
                <div key={p.phase} className="relative space-y-1">
                  <div className="absolute -left-[21px] top-1 grid size-3.5 place-items-center rounded-full bg-white border border-[color:var(--accent)]">
                    <div className="size-1.5 rounded-full bg-[color:var(--accent)]" />
                  </div>
                  <div className="flex items-baseline justify-between">
                    <h5 className="text-xs font-bold text-foreground">{p.phase}</h5>
                    <span className="text-[9px] font-mono text-muted-foreground">{p.days}</span>
                  </div>
                  <p className="text-[10px] font-mono text-[color:var(--green)] font-semibold">{p.target}</p>
                  <p className="text-[10.5px] text-muted-foreground leading-relaxed mt-0.5">{p.items}</p>
                  <p className="text-[9.5px] font-mono text-[color:var(--accent)] italic pt-0.5">{p.signal}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Bottom Fade Sheet */}
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-12 bg-gradient-to-t from-white via-white/80 to-transparent" />
      </div>

      {/* Lock Gated Teaser Banner */}
      <div className="flex flex-col sm:flex-row items-center justify-between border-t border-border bg-gradient-to-r from-[color:var(--accent-muted)] to-white p-4 sm:px-6 gap-3 text-left">
        <div className="space-y-0.5">
          <p className="text-xs font-bold text-[color:var(--accent)] flex items-center gap-1">
            <Lock className="size-3 shrink-0" />
            This is 1 of 15 fully custom report sections.
          </p>
          <p className="text-[10px] text-muted-foreground">
            Complete reports include competitors audits, exact content strategy prompt blocks, and monetization roadmaps.
          </p>
        </div>
        <Link href="/login" className="shrink-0 w-full sm:w-auto">
          <Button size="sm" className="w-full font-semibold">
            Run Custom Audit
            <ArrowUpRight className="size-3.5 shrink-0" />
          </Button>
        </Link>
      </div>
    </div>
  );
}
