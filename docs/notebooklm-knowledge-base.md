# AuditLayerMedia — Company Overview & Knowledge Base

## What We Do

AuditLayerMedia provides deep, structured social media competitive intelligence reports for creators, personal brands, media managers, and small-to-mid-size agencies. Our product is a beautiful, self-contained HTML report that turns social media performance data into actionable strategic direction — not another dashboard, not generic analytics.

The tagline: **Media strategy, behavioral science, and AI for repeatable social growth.**

## The Product

Every report is a comprehensive 15-section competitive intelligence assessment. It answers six core questions:

1. **Baseline Reality** — A precise read of current distribution state: audience scale, engagement efficiency, content composition, and authority signals.
2. **Primary Constraints** — The highest-leverage friction points limiting growth, mapped by severity and implementation cost.
3. **Relative Position** — A structured comparison against three same-tier creators, identifying differentiation, gaps, and outperforming patterns. Every peer is a real, named account.
4. **Immediate Execution Plan** — A constrained, high-probability content set for the next 7 days, defined by format, narrative intent, and performance rationale.
5. **Trajectory Model** — A 90-day projection of growth milestones grounded in observable velocity, not aspiration, with measurable checkpoints.
6. **Monetization Architecture** — The most viable revenue pathway based on audience behavior, trust depth, and conversion surface area.

### The 15-Section Framework (Canonical)

1. **Overall Score** — Circular SVG donut ring diagram across 6 dimensions, color-coded (green ≥65, amber 35-64, red <35), overall score out of 100
2. **Raw Numbers** — 4-card metric grid + full data table benchmarked against same-tier accounts
3. **Top 5 Strengths** — Card format with green left-border, specific and evidence-based
4. **Top 7 Weaknesses** — Card format with red left-border, diagnostic and actionable
5. **Three Immediate Actions** — Executable this week with zero new tools or skills required. First action is always highest-leverage.
6. **Competitive Comparison** — Four-column table (client + 3 real named same-tier peers). Minimum 12 metric rows with red/amber/green color coding. Includes quantified performance gap analysis and specific learnings extracted from each peer.
7. **Three Content Ideas** — Account-specific (never generic), with format description, why-it-fits rationale, and 3 concrete first examples
8. **90-Day Map** — Three phases: Foundation (Days 1-30), Acceleration (31-60), Compound (61-90). Each phase has numeric follower targets, specific actions, and measurable success signals.
9. **Stories & Highlights** — Daily Story protocol table + three highlight covers to build first
10. **Content Schedule** — 7-day calendar grid showing the feed at full tempo
11. **The Four-Hour Window** — Algorithmic window strategy: first 4 hours after posting determines reach. For accounts ≤30K: reply to every Tier 1 comment manually. For accounts >30K: target first 30 comments within 4 hours. No bots, at any size.
12. **Presentable Feed** — Visual branding audit: color palette, thumbnail style, grid rhythm, text-on-images, profile picture
13. **Hashtags** — 3-5 niche hashtags (not 30 generic). Tiered strategy: Niche (10K-100K), Community (100K-500K), Reach (500K+)
14. **Audit Cadence** — Weekly Pulse Check (10 min), Monthly Signal Read (30 min), Quarterly Full Audit (2-3 hrs), Post-Viral Spike Review (45 min)
15. **What Comes Next** — Upgrade CTA, natural close

Every report ends with a **"Powered by AuditLayerMedia" badge** — black rounded square with white ALM text.

## The Methodology

### Scoring Framework (8 Dimensions, Weighted)

- Branding & Messaging: 10%
- Audience Alignment: 15%
- Content Strategy: 20%
- Engagement Quality: 15% — comment depth, save/share ratios, reply authenticity, first-30-minute velocity
- Growth Potential: 15%
- Platform Optimization: 15% — platform-native features, algorithm signals, thumbnail strategy
- Conversion Strategy: 5%
- Competitive Positioning: 5%

### Domain Calibration

AuditLayerMedia is not generic analytics. The methodology is calibrated by domain expertise — specifically in biohacking, health, wellness, and evidence-based content. This means:

- **Engagement rate benchmarks are calibrated per account type** — a PhD researcher's 2% ER means something different from a lifestyle influencer's 2%
- **Format priority is niche-specific** — in biohacking, Podcasts > Reels > Paper breakdowns; in CPG, Reels > Carousels > Static
- **Credential filtering** — evidence-based accounts are scored on citation quality, not just virality
- **Audience segmentation** — each niche has distinct audience segments with different content needs and trust signals
- **Monetization patterns vary by business model** — product-owning creators need different monetization architecture than brand-deal-dependent creators

### Proprietary Frameworks

- **The 90-9-1 Reply Framework** — Tier 1 (1% of comments: questions, challenges, expert additions) = reply personally always. Tier 2 (9%: heart emojis, "so true") = heart + group acknowledgment. Tier 3 (90%: spam, bait) = delete or ignore.
- **The Promise Thumbnail** — Telegraphs value type (data visualization, before/after, provocative question) without sensationalism. Answers four questions in 0.5 seconds: Format, Depth Level, Emotional Register, Who This Is For.
- **Comment Reply Authenticity Scoring** — bot-detection signals (generic phrasing, no specific references, instant replies at all hours, repeated patterns), reply velocity in the first-30-minute window
- **1% Compounding Move** — Every report identifies the single highest-leverage daily action (Atomic Habits framing: 1% better/day = 37× in a year)
- **The "First 30 in 4 Hours" Rule** — For accounts >30K followers, the first 30 comments within 4 hours of posting is the minimum engagement threshold for algorithmic advantage. Every genuine reply multiplies reach.

## The Technology

AuditLayerMedia is built on a three-layer architecture:

1. **Next.js Portal** (Vercel) — Handles client intake, auth (Supabase magic link + Google OAuth), Stripe billing, live audit progress streaming, report viewing (sandboxed iframe), and admin console. Light theme, teal accent (#0d9488), Inter + JetBrains Mono fonts.

2. **Report Generation Worker** (Hetzner VM) — A Python service that claims queued audits, researches accounts across Instagram/TikTok/YouTube/X, runs competitive analysis, and generates the 15-section HTML report. Uses Nous Research's Hermes Agent framework for AI-powered research and synthesis.

3. **Control Plane** (Supabase) — Postgres database with Row-Level Security, private Storage for self-contained HTML reports, Realtime subscriptions for live audit progress, and service-role gating for admin operations.

The worker is template-driven — the report CSS and section structure are loaded dynamically from a canonical reference template at runtime, so format updates don't require code changes.

## Pricing

### Starter — $30/month
- 2 accounts · 5 audits per month
- Full 15-section report
- Same-tier peer benchmarks
- Immersive HTML reader, sharing, and direct HTML download
- Section-scoped refinements

### Pro — $50/month
- 5 accounts · 15 audits per month
- Full 20-section report
- Priority generation queue
- Deeper competitive context
- Branding & account growth insights
- Founder review on request

### Enterprise — Custom
- Unlimited audits
- Volume + multi-creator support
- Custom benchmarks & cadence
- Dedicated founder support
- White-glove onboarding

### Blueprint Audit — $79 one-time
- Covers up to 2 accounts
- Full 15-section pre-launch assessment
- Niche positioning & handle evaluation
- Competitive landscape mapping
- 90-day launch playbook with weekly milestones
- Content pillar architecture & first 10 content ideas
- Platform-by-platform setup guide

**First audit is free. No credit card required.**

## Target Audience

AuditLayerMedia works for accounts of any size — the methodology adapts to current distribution state. It's built for:

- **Creators** (1K-500K+ followers) who need competitive intelligence without a full-time analyst
- **Personal brands** building audience from scratch who want strategic direction
- **Media managers** managing multiple client accounts
- **Small-to-mid-size agencies** pitching social strategy to clients
- **Accounts in the 500-2K range** — we recommend the Blueprint Audit as a pre-launch assessment

## The Team

**Narin Fazlalipour** — Co-founder, domain expert. Background in biohacking, med-tech, wellness, and content strategy. Narin's knowledge of biohacking benchmarks, audience psychology, and content formats is the product differentiator. She built the 15-section framework, the scoring methodology, and the proprietary frameworks.

**Ashesh Kaji** — Co-founder, tech/infra. Master's at NYU in ML/AI, reinforcement learning, and optimization. Built the full stack: Next.js portal, Python worker deployment on Hetzner, Supabase architecture, Hermes Agent integration, and the template-driven report pipeline.

## Competitive Differentiation

AuditLayerMedia is not:
- A social media management platform (we don't schedule posts)
- A generic analytics dashboard (we don't show charts you have to interpret yourself)
- An AI content generator (we don't write captions for you)
- A bot or automation tool (we actively recommend against bots for all account sizes)

AuditLayerMedia is:
- **Strategic intelligence**, not data — we tell you what the numbers mean and what to do about them
- **Domain-calibrated** — generic analytics miss niche-specific patterns; our methodology knows biohacking content strategy is different from lifestyle content strategy
- **Evidence-based** — every recommendation is anchored to specific metrics, not vibes
- **Peer-comparative** — every report benchmarks against real, named same-tier accounts so clients know exactly where they stand
- **Founder-operable** — built by two people who can see every client's state, audit progress, and billing from a single admin console

## Design Philosophy

1. **Reports are the product.** Every decision serves report quality.
2. **Domain calibration over generic analytics.** The technology isn't the differentiator. Narin's knowledge is.
3. **Three screens max.** Handle input → goal selection → beautiful report.
4. **Static over dynamic.** Reports are self-contained HTML files that survive offline, in email, in print.
5. **No signup wall.** First audit is free. Paywall after that. The report sells itself.
6. **Founder-operable.** No raw SQL required to understand the business.
7. **Light theme, teal accent.** Scientific/clinical credibility. Inter for body, JetBrains Mono for numbers.
8. **Powered by AuditLayerMedia.** Every report carries the brand.

## FAQ

**What platforms do you audit?**
Instagram, TikTok, and YouTube. X (Twitter) and LinkedIn coming soon.

**How long does an audit take?**
Most audits generate in 6-8 minutes. Clients see live progress as each phase completes.

**Why should I trust your score?**
Six weighted dimensions calibrated to the account's niche and tier. Every dimension is broken down in the report — no black-box algorithms. Clients can refine any section through follow-up questions.

**What happens after I get the report?**
Reports are immediately actionable. The Immediate Execution Plan gives a constrained content set for the next 7 days. The 90-Day Map gives monthly checkpoints. Follow-up refinements available.

**How is this different from hiring a social media manager?**
A social media manager executes — they create content, manage communities, run day-to-day presence. AuditLayerMedia provides the strategic layer: competitive intelligence, format analysis, growth diagnostics, and monetization architecture. They're complementary. Our report gives you (or your manager) the roadmap.

**Does AuditLayerMedia work for small accounts?**
Yes — the methodology adapts to any account size. For accounts in the 500-2K follower range just getting started, we recommend the Blueprint Audit: a one-time pre-launch assessment that maps niche, content pillars, and a 90-day launch plan.

## Key Facts for Quick Reference

- **Founded:** 2026
- **Product:** Social media competitive intelligence reports (self-contained HTML)
- **Format:** 15-section structured audit (scored out of 100)
- **Platforms:** Instagram, TikTok, YouTube (X + LinkedIn in development)
- **Pricing:** Free first audit → $30/mo Starter → $50/mo Pro → Custom Enterprise → $79 one-time Blueprint
- **Tech stack:** Next.js (Vercel) + Python Hermes worker (Hetzner) + Supabase
- **Brand colors:** Teal (#0d9488) · Warm stone (#fafaf9) · Near-black (#1c1917)
- **Logo:** Black rounded square with white ALM initials
- **Tagline:** "Media strategy, behavioral science, and AI for repeatable social growth."
- **URL:** auditlayermedia.com
