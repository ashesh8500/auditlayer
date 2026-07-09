---
name: social-media-audit
description: Comprehensive social media competitive intelligence audit for a brand/creator. Structured analysis across platform presence, strengths/weaknesses, growth bottlenecks, content gaps, audience psychology, viral opportunities, monetization, scoring, and a 30-day optimization plan. Also includes a deep creator-strategy knowledge base covering growth signals, algorithmic patterns, trust compounding, and audience psychology.
trigger: When the user asks to analyze, audit, or review the social media presence of a brand, company, or creator. Also when they ask creator-strategy questions about growth, engagement, algorithms, audience building, or content patterns. Also when they ask to add a "short audit," "teaser," "Pulse," or agency-facing preview to an existing report. Also when they ask "how can we show this to agencies" or describe needing a lead-gen artifact for media contractors.
---

# Social Media Audit

## When to use
User asks to analyze a brand/creator's social media presence, or asks deep creator-strategy questions about growth mechanics, audience psychology, algorithmic signals, or content patterns.

**When the user says "AuditLayer paid report," "AuditLayer intake," or provides an AuditLayer handle with business constraints (platform, goal, client context): load BOTH this skill AND `narin-brand-audits`.** The 15-section framework, scoring visualization rules, CSS consistency requirements, peer verification protocol, and AuditLayer footer badge spec all live in `narin-brand-audits`. This skill covers research and data gathering; `narin-brand-audits` covers report structure and delivery format. Both are needed for a complete AuditLayer report. For standard AuditLayer 15-section HTML reports, also load `narin-brand-audits/references/auditlayer-standard-report-compliance.md` before delivery — it covers exact heading enforcement, byte-for-byte Hemal CSS rules, data-limited Instagram handling, peer archetype fallback, milestone deferral, and a final validation checklist.

## Delivery format
When communicating via Telegram, always deliver final report files using `send_message` with `MEDIA:/absolute/path/to/file` — never paste local filesystem paths in markdown expecting the user to access them. Local paths (`/home/asheshkaji/projects/analyses/report.md`) are invisible to the Telegram user; MEDIA paths trigger native file delivery.

**Target selection:** Check the session context for the user's origin. If the user is in a Telegram group (e.g., `Source: Telegram (group: typeshit)`), send to that group — `target="telegram:typeshit"` — not the bare platform name `target="telegram"` which routes to the home channel. If unsure which targets are available, call `send_message(action='list')` first to enumerate them.

## Audit framework
For brand/company/creator audits, gather data across these dimensions then compile into a structured report:

### Phase 1: Research
- Extract the subject's website for product/pricing/mission/business model
- Identify all social platforms (Instagram, TikTok, YouTube, X/Twitter, LinkedIn, Facebook, Reddit, Threads, podcast)
- Gather follower counts, post counts, engagement rates per platform. **For Instagram: as of May 2026, Instagram login-gates ALL unauthenticated profile views. The `curl | grep 'og:description'` method is 0% reliable, not 70% — there is no profile HTML to scrape. Use `browser_navigate` to detect the login-wall quickly (4 DOM elements, URL contains `/accounts/login/`). **For content analysis, navigate to individual post URLs instead:** `instagram.com/reel/{id}` and `instagram.com/p/{id}` yield full captions, comments, the "More posts from" carousel (6–12 recent posts with captions), collaboration tags, audio tracks, and timestamps — all accessible behind the login modal via browser snapshot. One post URL gives more audit data than five profile-page attempts. See `references/instagram-data-sourcing.md` for the full protocol. When Instagram blocks all access AND the account has zero web indexation, pivot to the walled-garden audit protocol in `references/walled-garden-audit.md`. For cross-platform identity research when Instagram is accessible: LinkedIn, company websites, Pinterest, third-party analytics (NinjaOutreach, Qoruz). See `references/instagram-data-sourcing.md` for the full strategy. **For X/Twitter data, use the FxTwitter API as primary method:** `curl -sL "https://api.fxtwitter.com/<handle>" -H "User-Agent: Mozilla/5.0"`. This returns structured JSON and works reliably even for dormant accounts where web_extract, Nitter, and the syndication API all fail. See `references/x-twitter-data-sourcing.md` for the full failover chain. **For TikTok data, browser profile snapshots are the primary method** — follower count, video count, hearts, and bio are all visible without login. When the browser snapshot is truncated, fall through to HTML scraping via execute_code: regex-extract `followerCount`, `videoCount`, `heartCount`, `diggCount`, `signature` from the raw page HTML. The TikTok API endpoint (`/api/user/detail/`) often returns empty — do not rely on it. See `references/tiktok-data-sourcing.md` for the full failover chain and field explanations. **For dormant/zero-content accounts (0 tweets, 0 followers, "Test Account" name, default avatar), follow the adaptation protocol in `references/dormant-account-audit.md` — the standard framework expects content to analyze and the report structure, scoring, peer comparison, and recommendations all need adjustment.** **When Instagram returns "Page isn't available" (confirm via `browser_navigate` + `browser_console` with `document.title`), cross-verify on 3+ other platforms immediately.** If FxTwitter also returns 404 and YouTube/GitHub/TikTok all show no presence, pivot to pre-launch assessment — the account was never created. See `references/nonexistent-account-audit.md`. **For auto-generated test/spoof accounts** where the handle contains "test" or "spoof" plus a numeric suffix (e.g., `tier_spoof_test_1779241145`), classify as a test/spoof account — these produce zero data across ALL methods, carry a permanent handle credibility penalty, and score ~4.5/100. See `references/test-spoof-account-pattern.md`. **For login-walled invisible accounts** — Instagram URL resolves (not "page not available"), `browser_navigate` confirms login-wall redirect, handle is brandable and intentional (no numeric suffix, no "test" component), but ALL 14 research methods return zero data — classify as a login-walled invisible account. This is a privacy/configuration issue, not a handle issue. Produce an activation playbook with a Decision Gate and Research Failure Log. Score 4.5/100. See `references/login-walled-invisible-account.md`.
- Search for competitor comparisons and industry context. **For sub-1000-follower accounts on Instagram, same-tier peer discovery requires browser-based handle verification, not search alone — web search indices favor accounts with 1K+ followers. See `references/micro-account-peer-discovery.md` for the 5-pass protocol, stop conditions, the follower-per-post efficiency metric, and **Pass 6: published nano-influencer indexes** (agency blog posts listing real handles with follower counts — The Viral Union, Grynow — often the only source for sub-10K accounts).** **Detect handle collision early — before diving deep into platform research.** Before any platform-specific queries, run 3 rapid checks: (a) web_search for the bare handle with no platform qualifiers — if page 1 has zero social results, you have a collision; (b) try syndication.twimg.com with the handle — empty JSON = X account not findable; (c) Google the handle in quotes. If 90%+ of page 1 results are unrelated to any social media presence, escalate to the invisible-account protocol in `references/handle-collision-discovery.md`. Do NOT spend 10+ search calls chasing an account that is structurally invisible — 3 negative signals is enough.
- **TwStalker as last-resort X discovery:** When X.com direct fetch, Nitter instances, xcancel, syndication.twimg.com, and Social Blade all return nothing, try `https://twstalker.com/<handle>`. TwStalker can surface accounts that are invisible to every other index — including dormant placeholder accounts with zero tweets and zero followers. It returns join date, tweet count, follower count, and following count. This is often the ONLY source that reveals a dormant/unactivated account.
- Check Reddit for community sentiment (complaints, praise, pricing issues)
- Search for funding, valuation, revenue data to contextualize business maturity vs. social maturity

### Phase 2: Report Structure

**For Narin's AuditLayer portfolio reports → use the 15-section framework as default (May 2026).** See `narin-brand-audits` skill and `references/narin-15-section-framework.md` for the canonical product spec. The 15-section framework is the default for every new audit unless Narin explicitly asks for a format variation. Do NOT use the 17-section cross-platform structure for Narin's Instagram-only portfolio audits.

**For all other audits (non-AuditLayer, multi-platform, general social media intelligence):**

1. **Brand Snapshot** — table of key facts (founded, HQ, product, pricing, valuation, revenue, investors, etc.)
2. **Platform-by-Platform Audit** — per platform: followers, content style, engagement range, verdict
3. **Strengths** (8-10 items) — what's working, structural advantages
4. **Weaknesses** (8-10 items) — what's broken or missing
5. **Root Cause Analysis** — dimension/reality/Instagram/gap table (especially valued by analytical/scientific clients; pairs with weaknesses to answer "why do these gaps exist?")
6. **Peer Comparison** — single table comparing subject to 2–3 similar-tier creators on format strategy, engagement, cadence, promo ratio. See `references/creator-audit-extensions.md` for the lightweight table-only template. For deeper 1:1 competitive comparisons, use the full anatomy in `references/comparison-section-structure.md`.
7. **Growth Bottlenecks** — severity-ranked table
8. **Content Gaps** — formats/topics entirely absent
9. **Audience Psychology Patterns** — primary and secondary audience motivations
10. **Viral Opportunities** — high-leverage content ideas
11. **Engagement Growth Strategy** — format-specific recommendations with example content ideas
12. **Performance Score** — 8-dimension weighted score out of 100
13. **Road to [Next Milestone]** — phased 90-day growth timeline with specific weekly actions, success signals per phase, and a summary metrics table. The milestone must be computed per account based on its current tier (see milestone calculation table in `references/creator-audit-extensions.md`). Never hardcode a number like 20K — a 500-follower account needs Road to 2K, not Road to 20K. See `references/creator-audit-extensions.md` for the full template and calculation rules.
14. **High-Impact Recommendations** — 3 tiers ranked by expected growth impact (★★★★★ to ★★)
15. **Platform-Specific Improvements** — per-platform tactical guidance
16. **Content Ideas** — 10 specific content pieces likely to increase reach
17. **Audit Cadence** — how often to re-audit (monthly, quarterly, event-triggered). See `references/audit-cadence.md` for the template.

Note: Sections 5, 6, 13, and 17 are especially important for creator/personal-brand audits (vs. company/brand audits). For analytical audiences (scientists, researchers, PhDs), keep weaknesses and root cause sections comprehensive — they will ask "why" and the diagnostic depth is what makes the report credible. Never remove weaknesses or root cause analysis from these reports; these sections are what signal rigor to the analytical reader.

### Phase 3: Scoring
Weighted score across 8 dimensions (total 100):
- Branding & messaging: 10%
- Audience alignment: 15%
- Content strategy: 20%
- Engagement quality: 15% — comment depth, save/share ratios, reply authenticity (Tier 1 reply rate, absence of bot-like replies, thread depth, first-30-minute velocity)
- Growth potential: 15%
- Platform optimization: 15% — platform-native features, algorithm signals, **thumbnail strategy** (stop-scroll rate, promise thumbnails vs. sensationalism, face-in-context, content hierarchy test)
- Conversion strategy: 5%
- Competitive positioning: 5%

For advanced audit packages, include explicit sub-scores for thumbnail effectiveness and comment reply authenticity. See `references/comment-engagement-thumbnail-strategy.md` for the detailed scoring rubrics.

### Phase 4: Save & Deliver
- **Every report MUST include a "Powered by AuditLayerMedia" badge at the bottom**, after the footer but before the closing `</div>` / `</body>`. Use the `.powered-by` CSS class with the `.alm-badge` for the black ALM logo, and include the Instagram handle with an inline IG camera SVG: `<div class="powered-by"><span class="alm-badge">ALM</span> Powered by AuditLayerMedia<p class="handle"><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="5"/><circle cx="17.5" cy="6.5" r="1.5"/></svg> @auditlayermedia</p></div>`. This is non-negotiable — missing it on any report is a first-class error.
- **ALM brand assets (standalone logo, font, mark specs):** see `references/alm-brand-assets.md`. The preferred mark is the "ALM" acronym set in the Humane typeface (Rajesh Rajput). When generating a logo or brand mark, use PIL/Pillow with the actual font file — never AI image generation. Font is at `assets/HUMANE Typeface.zip` in the auditlayer repo. Teal `#0d9488` on off-white `#fafaf9`, 1024×1024 px.
- Save reports to `/home/asheshkaji/projects/analyses/<subject>-social-media-audit.html` (use `.md` only when the user's chat platform renders markdown natively, e.g. Telegram).

**Post-audit contract workflow:** When a client wants to move from audit → proposal → contract, use `templates/social-media-contract-template.md`. It covers the full 17-section structure: scope, brand voice, content mix, deliverables, tools, pricing (tiered + setup + travel), legal (non-exclusivity, raw footage, kill fee, governing law), and a closer that positions you as a storytelling strategist — not a social media manager. The template encodes lessons from 8+ rounds of client iteration.

**When executed as an automated worker (AuditLayer pipeline):** The worker expects the complete HTML report INLINE in the final response inside ```html ... ``` markers. Do NOT use file-writing tools — the worker pipeline has no tool access to the host filesystem. Return the HTML directly in your response. The worker saves it as `{audit_id}.html` and persists results to Redis for API lookups. When running interactively (user chat), file-system save is preferred as documented above.

See `## Skill-Driven Worker Architecture` above for how the worker loads CSS and section structure dynamically from this skill.

## Alternate Structural Formats — Portfolio Variety (SUPERSEDED May 2026)

**All alternate format variants below are superseded by Narin's 15-section framework.** See `narin-brand-audits` → `references/narin-15-section-framework.md` for the canonical product spec. The 15-section framework is the default for every new AuditLayer report. The old formats (Competitive Battlefield, Founder Story Arc, Research Translation Scorecard, Brand Pulse) are retained for historical reference only — do NOT use them for new reports unless Narin explicitly asks for a specific format variation.

**Four proven alternate frameworks:**

### 1. Competitive Battlefield (for brand/company accounts)
Lead with competitive positioning, not executive summary. Frame everything as a fight for category leadership.

Section flow:
1. The Battlefield (competitive landscape + what's at stake)
2. The Arsenal (strengths reframed as competitive weapons)
3. The Blind Spots (weaknesses reframed as vulnerabilities competitors exploit)
4. The Opponent's Moves (peer comparison as competitor analysis)
5. Battlefield Map (algorithm signals + format-by-format positioning)
6. The Campaign (growth strategy as 5-move offensive)
7. Victory Conditions (benchmarks)
8. 90-Day Campaign (Mobilize → Advance → Dominate)
9. Battlefield Reassessment Cadence

Tone: tactical, competitive, urgent. Section labels use military/competitive language. Best for: brands fighting in crowded categories, accounts where product credibility is high but content operations are weak.

### 2. Founder Story Arc (for personal-brand/CEO accounts)
Lead with personal narrative, not executive summary. Frame everything as a storytelling intervention.

Section flow:
1. The Chapter Being Written (situation as narrative hook)
2. Who He Is (strengths as character backstory — the "material")
3. The Gap — Between the Man and the Feed (root cause as narrative tension)
4. What His Peers Are Publishing (peer comparison as genre context)
5. The Stories Not Yet Told (weaknesses as untold chapters)
6. The Storytelling Engine (growth strategy as narrative modes)
7. This Week — Start Telling the Story (quick wins)
8. The Next Chapters (90-day timeline: Prologue → Rising Action → Climax)
9. Chapter Milestones (benchmarks)
10. When to Re-Read the Story (audit cadence)

Tone: editorial, intimate, story-driven. Section labels use narrative language. Best for: founders, CEOs, personal brands with rich backstories that aren't reflected in their feed.

### 3. Research Translation Scorecard — SUPERSEDED

**The old 14-section Research Translation Scorecard format has been superseded by Narin's 15-section framework (May 2026).** See `narin-brand-audits` → `references/narin-15-section-framework.md` for the canonical product spec. The new framework is the default for all AuditLayer reports. The old format (Investigator → Moat → Account Profile → What Translates Well → Translation Gap → Publication Portfolio → Peer Review → Audience → Engagement Assay → Protocol Optimization → Immediate Actions → Clinical Trial Milestones → Scorecard Milestones → Re-Assessment Cadence) is retained for historical reference only.

Tone: analytical, evidence-based, clinical. Section labels use research/lab language (assay, protocol, translation, peer review). Best for: academics, PhDs, researchers, scientists who have deep publication records but underperforming social media presence. The framing should make them feel understood — "your research is elite, the feed just isn't keeping pace."

### 4. Brand Pulse Report (for CPG/food/consumer brand accounts)

Lead with the product and founding story, not executive summary. Frame everything as closing the gap between shelf presence and social presence.

**TWO VARIANTS — choose based on context:**

#### 4a. Compact Brand Pulse (DEFAULT — use this unless user asks for full)

Use this for lead-gen, DM outreach, portfolio teasers, and initial contact. Reads in 90 seconds. Mobile-scrollable.

Section flow:
1. **Score Diagram** — 6-dimension score bars + overall score /100 (same CSS as full audit)
2. **What's Working** — 2 strength cards (green left-border, `.card.strength`)
3. **What's Missing** — 2 gap cards (red left-border, `.card.gap`)
4. **Three Moves** — numbered `.move-card` components with circle numbers
5. **Weekly Rhythm** — mini content calendar (`.mini-cal` grid: Day / Format / Content)

NO peer comparison table. NO 90-day timeline. NO benchmarks. NO recheck cadence. NO "The Product" or "The Story" narrative sections. The score diagram IS the introduction.

**Design rules:**
- Max 680px container width
- Same light theme, teal accent, Inter + JetBrains Mono as standard Hemal format
- Callout `.callout` with teal left-border for the diagnosis
- No data tables except the mini calendar
- No multi-paragraph narrative — every card is headline + 2-3 sentences max

Tone: punchy, diagnostic, urgent. "Here's the score. Here's what's working. Here's what's broken. Here are 3 things to do about it. Done."

#### 4b. Full Brand Pulse (use only when user explicitly asks for depth)

The expanded 11-section version for full audits or clients who want comprehensive analysis.

Section flow:
1. The Product — What's in the [Product]
2. The Story — The Best Ingredient They're Not Posting
3. The Shelf vs. The Feed — Where the Brand Lives (metrics + gap analysis table)
4. What's Working — Brand Assets on the Feed (4+ strength cards)
5. What's Missing — Content White Space (6+ gap cards)
6. The Competitive Shelf — Peer Comparison (full table)
7. Growth Levers — What Moves the Needle (5-move strategy with 7-day calendar)
8. This Week — Five Actions
9. 90-Day Growth Timeline
10. Brand Pulse Benchmarks
11. Brand Pulse Recheck Cadence

Tone: consumer-aware, shelf-to-screen. Key framing for both variants: the core tension is "retail brand that happens to have an Instagram" vs. "story brand that happens to sell at retail." Costco/Amazon/retail presence is leveraged as content. Founders are foregrounded. Cultural IP is treated as a competitive moat. UGC pipelines and retail-to-social bridges are the primary growth levers. Best for: CPG brands, food/snack companies, DTC consumer products with physical retail distribution whose Instagram lags behind their shelf credibility.

**Compact format design spec:** See `references/brand-pulse-compact-format.md` for the full CSS rules, section structure, and canonical reference file.

**Canonical reference:** `/tmp/narin-pages/projects/eatbahamii-pulse.html` — the live deployed compact pulse for @eatbahamii. Use this file's CSS patterns for any new compact pulse, not the full audit's 11-section CSS.

**Key principle:** The alternate format keeps the same analytical depth and research quality as the Hemal original. Only the structural framing changes. A reader should feel "this is clearly the same analyst, but she adapted her approach to the subject." Related accounts (e.g., brand + its CEO + its scientific advisor) should read as complementary across formats — each frame highlights a different dimension of the same ecosystem.

**Portfolio cleanup:** When alternate-format audits replace the original Hemal-format versions of the same accounts, remove the originals from the portfolio and rename the alternate-format cards from "Alternate Format — [Framework]" to just "[Framework]" as the primary entry. The grid should show one entry per account, using the most distinctive format for each.

**File naming:** Append a structural suffix: `-battlefield.html`, `-story.html`, `-scorecard.html`.

## Narin Report Format — Two Distinct Visual Templates

**CRITICAL: There are TWO different visual formats. Use the right one for the context.**

### 1. Hemal Format (Light Theme) — for Narin's Portfolio

Use this when Narin asks to add an Instagram audit to narinfazlalipour.com/projects/. See `references/hemal-report-format.html` for the full CSS specification and section structure.

**Key identifiers:**
- **LIGHT theme** — `--bg: #fafaf9`, white surface cards
- **Teal accent** — `--accent: #0d9488`
- **Inter + JetBrains Mono only** — NO Cormorant Garamond
- `.container` at 760px, no dark background
- Components: `.metric-grid` (4-col), `.sw-card` with left border (green/red), `.rec-card` with numbered circle, `.calendar-grid`, `.timeline-item`, `.callout` (blue)
- **Instagram-only** — no cross-platform sections, no score bars, no tier badges
- Section structure: Executive Summary → Key Metrics → Strengths → Weaknesses → Root Cause → Content Format Analysis → Engagement Growth Strategy → Quick Wins → Success Benchmarks → Audience Profile → Road to [Milestone] → Audit Cadence

**Canonical reference:** `~/projects/narin/hemalpatelphd-instagram-audit.html`

**Recommended component:** Every audit report should include a **score diagram** at the top (after header, before first section). Two formats are available:

- **Horizontal bars** (default): 5-6 dimensions as horizontal bars, color-coded (green ≥65, amber 35-64, red <35), with an overall score out of 100. See `references/score-diagram-component.md`.
- **Circular rings** (when user asks for "circular"): SVG donut rings in a 3×2 grid with an overall ring below. More visual, reads as premium. See `references/circular-score-rings.md` for the full implementation (CSS, SVG formulas, value positioning).

Choose horizontal bars by default; use circular only when explicitly requested.

### 2. AuditLayer Worker Pipeline — Light Theme (same as Hemal format)

The automated worker sends a thin system prompt telling Hermes to load this skill. All CSS, section structure, and formatting rules are read from this skill at generation time — NOT baked into Python code. Every report shares the exact CSS and 15-section structure from `references/hemal-report-format.html`. Skill updates auto-propagate to every future report with zero worker restarts. There is no separate dark theme for the worker.

## Skill-Driven Worker Architecture (June 2026)

The AuditLayer worker sends a thin system prompt telling Hermes to load this skill. All CSS, section structure, and formatting rules live in this skill — NOT baked into the worker's Python code. Skill updates auto-propagate to every future report with ZERO worker restarts.

**How it works:**
1. Worker's system prompt: "You are AuditLayer's report worker. Load the social-media-audit skill and follow it exactly."
2. Hermes loads this skill → gets CSS from `references/hemal-report-format.html`, 15-section structure, and formatting rules below
3. `build_worker_prompt()` injects the section reference (read from this skill) into the user prompt
4. The `worker/templates/narin_reference_template.html` file is a **reference artifact** — CSS changes should be applied to `references/hemal-report-format.html` in this skill instead

**Worker formatting rules (loaded by Hermes from this skill):**

The worker prompt specifies the report type (pulse/standard/extended/blueprint) and the exact section list. Generate the report matching that type — do not default to the 15-section standard format if the prompt says otherwise.

- Use EXACTLY the CSS from `references/hemal-report-format.html` — do not modify, minify, or rewrite
- Include the Google Fonts <link> for Inter + JetBrains Mono
- Score diagram uses HORIZONTAL BARS (sd-row/sd-track/sd-fill), NOT circular rings
- Overall score /100 in JetBrains Mono at top-right of section 1 header
- Color thresholds: green (#059669) >=65, amber (#d97706) 35-64, red (#dc2626) <35
- Every report ends with the AuditLayer footer badge (black #1c1917 background + auditlayermedia.com), followed by an execution-plan disclaimer in a subtle bordered box: "This is an execution plan — a strategy document built from research and data. You still need a media team to create content, film videos, write captions, and implement the plan. AuditLayerMedia delivers the playbook. Your team runs it."
- Reports are self-contained HTML with NO external assets (no CDN images, no API calls)
- Light theme: #fafaf9 background, #ffffff surface cards, teal accent (#0d9488)
- Container max-width: 760px, centered
- NEVER use circular SVG scoring rings — Narin explicitly prefers horizontal bars
- Peer comparison MUST use real, verifiable Instagram handles — never fabricate
- Section count and names are specified in the user prompt (variable by report type: pulse=3, standard=15, extended=20, blueprint=15). Use the EXACT section headings from the prompt's numbered section list — do not rename, reword, or merge sections. "Executive Summary" must say "Executive Summary", not "Overall Score". "Footer" must say "Footer", not "What Comes Next". The last section must be "Powered by AuditLayerMedia" as its own `<h2>` section — not merged into footer, not omitted.
- **Prompt heading override beats legacy framework names:** If the prompt supplies a numbered list of `<h2>` headings, those headings are the contract even when `narin-brand-audits` or older references name similar sections differently (e.g. "Overall Score," "Raw Numbers," "What Comes Next"). For standard AuditLayer reports using the worker/product prompt, use the prompt's 15 headings verbatim: Executive Summary, Key Metrics, Strengths, Weaknesses, Root Cause Analysis, Peer Comparison, Content Format Analysis, Engagement Growth Strategy, Quick Wins — This Week, Success Benchmarks, Audience Profile, Road to [Milestone], Audit Cadence, Footer, Powered by AuditLayerMedia. Do not silently translate them back into the older Narin portfolio labels.
- DETECT account type on first research pass: personal brand vs business. Personal brands (creator, influencer, founder, professional, public figure) are judged on trust, authority, storytelling coherence, and audience connection. Business accounts (brand, company, product, e-commerce) are judged on product visibility, conversion architecture, content-to-commerce funnel, and brand consistency. Calibrate all recommendations, scoring weights, and peer selection to the account type — never apply business metrics to a personal account or vice versa.

**When updating report formatting:**
- Edit this skill (SKILL.md or `references/hemal-report-format.html`) — NOT worker Python code
- Changes take effect on the NEXT job — no worker restart required
- Verify: `cd worker && uv run python -m auditlayer_worker demo --handle iamsrk --generator mock`

**Testing:**
```bash
# Mock demo (no live tokens):
cd ~/projects/auditlayer/worker && uv run python -m auditlayer_worker demo --handle iamsrk --generator mock

# Worker tests (19 tests, 0 live tokens):
cd ~/projects/auditlayer/worker && uv run pytest tests/ -x -q
```

## Content Performance Analysis
When the user shares screenshots from Instagram Insights (Professional Dashboard → Content), extract and analyze top-performing content. See `references/content-performance-analysis.md` for the full workflow: extraction via vision_analyze, ranked table construction, pattern identification, performance tiering, and revenue-implication callout.

## 60/20/20 Creative Content Strategy
When the user asks for original content ideas (not repurposed from existing footage, papers, or stage content), use the framework in `references/60-20-20-content-strategy.md`. Covers 16 creative concept templates across reach-building, product education, and community — plus a weekly calendar.

## A/B Testing Playbook
When the user asks about A/B testing hooks, thumbnails, captions, or content variables on social media, load `references/ab-testing-playbook.md`. Covers the one-variable rule, what to test per element, platform-specific how-to, tracking sheet template, and testing cadence.

## Section Structure Reference
For comparison sections in HTML reports, see `references/comparison-section-structure.md` — standard anatomy, framing decisions per comparison type, and pitfalls.

## Creator Strategy Knowledge Base
For deep creator-strategy questions, consult `references/creator-strategy-principles.md` — 15 answered questions covering:
- Top 1% vs. average creators
- Long-term growth predictors
- Psychological engagement triggers
- Content retention structures
- Plateau causes
- Algorithmic signals
- Audience emotional attachment
- Authority-building mistakes
- Sustainable production systems
- Audience vs. business builders
- Binge-consumption patterns
- Disproportionate growth leverage
- Predictive metrics beyond vanity
- Category leadership positioning
- Trust compounding mechanics

## Educational Content & Day One Principles
For educational assets aimed at beginners or clients who need foundational creator strategy (not a full audit), load `references/education-day-one-principles.md` — 10 industry-agnostic principles top 1% creators apply from day one, framed through the Atomic Habits 1% compounding lens. Useful for advanced audit packages, educational sections of the product, or when Narin asks to produce educational creator-strategy content.

## Thumbnail & Comment Engagement Strategy
For deep tactical guidance on thumbnail strategy and comment engagement (advanced audit packages), load `references/comment-engagement-thumbnail-strategy.md` — thumbnail as stop-scroll mechanism (promise thumbnails vs. sensationalism, content hierarchy test, face-in-context), and comment reply authenticity (90-9-1 framework, bot-detection signals, defender training, first-30-minute velocity). These are Narin's proprietary frameworks — domain expertise that differentiates AuditLayer from generic analytics.

## Niche-Specific Calibration
For domain-specific calibration in biohacking, health, and wellness, load `references/niche-calibration-biohacking.md` — content format priority (Podcasts > Reels > Paper breakdowns), biohacking audience segments with content needs and trust signals, credential filter for evidence-based accounts, engagement rate calibration per account type, and monetization patterns for product-owning creators.

For Indian creative/performer niches (choreographers, dancers, models on Instagram), load `references/niche-calibration-indian-creatives.md` — extreme barbell distribution (accounts cluster above 100K or below 15K), verified peer handles, following-ratio patterns endemic to Mumbai networking culture, and ecosystem-based peer discovery strategies.

For manifestation, mindset coaching, and neuroscience/nervous-system-regulation niches (personal-brand coaches targeting ambitious women entrepreneurs), load `references/niche-calibration-manifestation-coaching.md` — former-healthcare-professional pipeline, barbell follower distribution, content format priority (Carousels > Reels), podcast-as-authority-engine pattern, co-founder dynamics, and peer discovery strategies for this structurally sparse middle tier.

## Content Ecosystem & Storytelling Frameworks
When building social media management proposals, content strategies, or contracts — or when translating a founder's personal brand energy into a company account — load `references/content-ecosystem-storytelling.md`. Covers the storytelling lens (hero → villain → transformation), content ecosystem model (CEO 60% / team 25% / customers 15%), founder brand translation pattern, B2B SaaS content mix ratios, weekly cadence, and the social media management contract section structure.

## Refreshing an Existing Audit (In-Place Update)

When the user asks to re-run or refresh an audit where the core structure is still valid and only numbers need updating:

1. **Gather fresh data first.** Use parallel subagents for web research. For Instagram metrics, the `curl | grep 'og:description'` method is dead (May 2026) — Instagram login-gates all profiles. Use browser_navigate to check if the profile is accessible. For accessible cross-platform accounts, use FxTwitter for X data, and browser tools for TikTok/YouTube. For Instagram-primary accounts with no web indexation, use the walled-garden protocol in `references/walled-garden-audit.md` — update the report with fresh industry benchmarks rather than scraping live metrics.
2. **Use `patch()` for targeted number swaps** rather than regenerating the entire HTML. Identify all stale occurrences with `search_files(pattern=…)` and `execute_code` for bulk patching.
3. **Recalibrate all derivative numbers** — Road to [Milestone] phase targets, peer comparison table cells, prose mentions — not just the headline metric. Use `execute_code` to batch the patches.
4. **Verify the live deployment** with `curl -sL <live-url> | grep -c <key-number>` before declaring done — GitHub Pages can lag behind the raw repo.
5. **Commit and push after each logical unit** of changes, not after every single patch.

## AuditLayer Pulse — Agency Teaser Artifact

When Narin asks to add a "short audit," "teaser," "Pulse," or agency-facing preview to an existing report, append a 4-section Pulse artifact below the report footer (after a dashed divider). The Pulse repackages existing report data — no new research needed. See `references/audit-pulse-teaser.md` for the full design spec: when to use, psychology, 4-section structure (Scorecard, One Thing You Didn't Know, Growth Lever, Horizon), design rules, generation workflow, and pitfalls.

## AuditLayer IG Content Strategy

When asked about @auditlayer's Instagram content, bio, posting rhythm, ecosystem building, or micro-influencer outreach, load `references/auditlayer-ig-content-strategy.md`. Covers: 5 content types with weekly cadence, IG bio options, accounts to study, ecosystem-building framework (brands / peer collaborators / brand storytellers), Instagram-native methods for finding 5K-20K micro-influencers, and the DM outreach playbook. The outreach list lives at `~/projects/auditlayer/outreach-list.md` — 30 small CPG brands (5K-20K), 18 with confirmed founder IGs, markdown table with Status column for tracking pipeline.

## Pulse Audit Landing Page

When asked about the Pulse Audit section on the auditlayermedia.com landing page — where it sits in the section order, its copy ("All you need is an email · 2 free runs · No credit card"), the upsell logic ("⚡ Upgrade for the full report"), or the compact 5-section Brand Pulse format it previews — load `references/pulse-audit-landing-page.md`.

## IG DM Outreach Playbook

When Narin asks you to write personalized DM outreach for AuditLayerMedia prospects from her personal IG account, load `references/ig-dm-outreach-playbook.md`. Covers: voice & format (4 sentences max, personal account, 🤍 signature), DM structure (personal opener → what ALM does → why them → free pulse CTA), research per handle, and batch delivery format.

## AuditLayer 15-Section Report — Common Failure Modes (July 2026)

### CSS Extraction and Validation
- The canonical CSS lives at `references/hemal-report-format.html`. That file contains HTML comment prose mentioning `<style>` and `</style>` as literal text. Naïve regex can start inside the comment, producing a fake ~143-char block instead of the real 8,534-char CSS.
- **Fix:** anchor to a `<style>` tag at line-start: `re.search(r'^<style>.*?</style>', text, re.S | re.M)`.
- "Do not modify CSS" also means **zero inline `style=""` attributes** in the body HTML. Use only canonical Hemal classes (`<p class="subtitle">`, `.callout`, `.meta`). A single `style="font-size:0.85rem"` on anything is a spec violation. Strip all `style="..."` attributes before delivery.

### Following-Count Cleanup Safety
- Always include the full three-part rationale when recommending following reduction.
- **Do not recommend mass-unfollowing "in one session."** Instagram enforces action limits around 200 unfollows/day. Safe wording: unfollow in daily batches of 25–50 over 3–5 days, monitoring for action limits, targeting below ~5% ratio and ideally near ~3%.

### Peer Comparison When Live Discovery Is Down
- If web_search and Instagram API are both unavailable, do NOT invent or imply verified peer handles.
- Use same-tier **benchmark archetypes** ("Archetype A: Beauty UGC Specialist") explicitly labeled "NOT verified live Instagram handles — replace with verified data at next audit."
- Never use "Peer A — Category Name" as a placeholder — even archetypes need descriptive niche-grounded names.

### Arithmetic and Stale-Phrase Garbage Collection
- Before delivery, recheck: posting cadence (derived from chronologically sorted actual dates, not a formula), date range, average engagement (with and without outlier), viral multiplier, and number of tagged brands.
- Avoid false precision: prefer "~daily," "multiple tagged brands" over exact counts the source data doesn't directly support.
- Search the final HTML for stale remnants: `style=`, `one session`, `150 accounts`, `150 this week`, `~7-8`, `49x`, `13+`, and any live-metric number that should read "Unavailable."

### Validation Script
Run `scripts/validate-auditlayer-standard-report.py` (in the `narin-brand-audits` skill) against any generated standard report HTML before delivery. Checks headings, canonical CSS byte-match, inline styles, `<link>` tags, ALM badge, execution-plan disclaimer, six questions, and risky phrase remnants.

## Pitfalls
- **Tone calibration — casual creative direction vs. formal audit:** When Narin asks for quick brand/design direction (colours, fonts, thumbnail ideas — NOT a formal audit deliverable), drop the structured consultant voice. Keep it punchy, casual, conversational. Do not lead with "Current state → Analysis → Recommendations" as bulleted sections. Do not use report-style formatting. Match her energy: short sentences, minimal structure, no framework labels. She will tell you if you're too tense ("babe why are you so tense?"). The content depth should be the same — the packaging should not feel like a meeting deliverable. This applies to all creative direction asks, not just for Hemal.
- **Instagram data sourcing — PRIMARY METHOD (June 2026): Use the `i.instagram.com/api/v1/users/web_profile_info/` endpoint with `User-Agent: Instagram 219.0.0.12.117 Android` header.** One curl call returns structured JSON with: exact follower/following/post counts, bio, account type, verification status, and 8–12 recent posts with like counts, comment counts, full captions, content types, and timestamps. Enough data to calculate engagement rate, posting cadence, and content format mix — no authentication required. See `references/instagram-data-sourcing.md` for the full field reference and comparison table. **When this endpoint works (it does for most public accounts), skip ALL other Instagram research methods — browser_navigate, individual post URLs, third-party viewers, Social Blade — they are slower and return less data.** **Rate-limiting reality (June 2026):** The API returns `"Please wait a few minutes before you try again"` after as few as 1–2 calls in a session. When rate-limited, the browser_console og:description method is the consistent fallback: `browser_navigate` to any Instagram profile URL, then `browser_console` with `document.querySelector('meta[property="og:description"]')?.content`. This returns follower/following/post counts reliably — even behind the login wall — and works for every public account tested. It does NOT return per-post engagement data, but it gives the core metrics needed to score an account. **Content fallback when API is 429:** after `browser_navigate` to the profile, close the sign-up/login modal if present and call `browser_get_images()`. Instagram often exposes highlight thumbnails plus recent grid images with full `alt` captions, including visible content themes, collaboration tags, comment-to-DM prompts, and recent post copy. Use those image alt captions for Content Format Analysis, Strengths/Weaknesses, and Growth Strategy while still labeling engagement metrics unavailable without OAuth. This is especially useful for Hemal-format standard reports where a content audit is required but exact post engagement is unavailable.
- **Walled-garden audit — Instagram-primary, zero web indexation:** When 12+ research methods return zero data AND the handle doesn't match test/spoof/collision/nonexistent patterns, the account is structurally inaccessible. Stop cycling through alternative sources. Pivot to best-effort audit using industry benchmarks, strategic frameworks, and competitive pattern analysis. The research failure IS the finding — document the full attempt log prominently. Score conservatively (15-25/100 baseline). See `references/walled-garden-audit.md` for the complete protocol.
- **Login-walled invisible account — Instagram exists, handle is brandable, zero public data:** When Instagram's URL resolves (not "page not available") and `browser_navigate` confirms a login-wall redirect, but the handle is meaningful/brandable (NOT an auto-generated test pattern with numeric suffix), classify as a login-walled invisible account. This is distinct from walled-garden (handle is intentional, not a collision with a technical term) and from test/spoof (no numeric suffix). The account is invisible because it's private, zero-content, or both — not because the handle is anti-brand. **Pivot:** the audit IS an activation playbook. Include a Research Failure Log documenting every method attempted. Add a Decision Gate ("Activate or Rebrand?"). Score 4.5/100 honestly. The 1% Compounding Move is always "set to public and post within 24 hours." See `references/login-walled-invisible-account.md` for the full protocol, detection signature, differentiation table, research log template, and scoring calibration.
- **Search tool failures — diagnostic path before pivoting:** When web_search or x_search fail, the error is not always obvious from the agent's perspective (exposed as opaque JSON errors). Use this diagnostic sequence to identify the root cause before deciding on fallback strategy: (1) `hermes config check` — lists which API keys are set and which search backends are active; (2) inspect `~/.hermes/.env` — check if the active key is present and valid; (3) `journalctl --user -u hermes-gateway --no-pager | grep -i 'search\|error\|402\|403'` — reveals the actual HTTP status and error message. Common failure modes: **Exa credit exhaustion** (402: "You have exceeded your credits limit") — affects both web_search and web_extract, requires topping up at dashboard.exa.ai; **xAI x_search 403** (403: "The caller does not have permission") — distinct from credit exhaustion, indicates the xAI team/account lacks the X Search feature permission; **missing API key** — web_search returns empty silently or with a generic error, config check shows `(not set)` for all backends. See `references/hermes-search-diagnostics.md` for the full diagnostic protocol. When search is broken due to credit/permission issues (not missing keys), note it in the Research Verification Log and move on — use browser-based search (Bing, Brave, DDG) as fallbacks. When browser search also blocks (captcha, bot-detection, JS challenges), that IS diagnostic evidence — the account has zero search footprint. Do NOT retry Exa calls hoping credits replenish mid-session; they don't.
- **Instagram post URLs serve wrong content behind login wall (June 2026):** When navigating to individual post URLs (`instagram.com/p/{id}` or `instagram.com/reel/{id}`) behind the login modal, Instagram sometimes routes to completely unrelated accounts' content. Example: `instagram.com/p/DUml4Vyjfuf/` (indexed as a shaimastrategist post) served @thelucasokeefe's content. `instagram.com/reel/DZvX1UwxYuM/` served @wave_media_'s content. The post IDs in web search snippets cannot be trusted to resolve to the subject's posts — Instagram's routing appears to serve popular or random content when the actual post is inaccessible. **Mitigation:** use web search snippets for content theme analysis (captions, topics, like counts are visible in search results even when the post URL redirects); rely on the og:description meta tag for follower/post counts; do not spend multiple browser navigations chasing post URLs that redirect — one redirect is enough to know the content is not accessible behind the login wall.

- **Third-party Instagram viewer blockade is universal (May 2026):** Picuki, Dumpor, Imginn, Greatfon, Instasave, Bibliogram — ALL return Cloudflare challenges or empty responses. Do not try more than 3; after 3 Cloudflare blocks, the entire class of tool is dead for this session. Move to cross-platform research or pivot to best-effort audit.
- **TikTok "Suggested accounts" instead of videos = zero public content:** When a TikTok profile page shows a "Suggested accounts" section and celebrity follow suggestions instead of a video grid, the account has zero public videos or all content is private. The browser console check `document.querySelectorAll('[data-e2e="user-post-item"]').length` returns 0. This is a critical diagnostic: the account exists but has never posted publicly. The follower count may still be non-zero (followers acquired elsewhere or via a now-deleted viral video). See `references/tiktok-data-sourcing.md` for the full field reference.
- **Twitter syndication API false-negative:** `cdn.syndication.twimg.com/widgets/followbutton/info.json` returns empty `{}` for dormant, protected, or very small accounts. This does NOT mean the account doesn't exist. Always fall through to the FxTwitter API (`https://api.fxtwitter.com/<handle>`) before concluding an account is absent. See `references/x-twitter-data-sourcing.md` for the full failover chain.
- **Dormant/zero-content account audit:** When the account has 0 tweets, 0 followers, "Test Account" name, and default avatar, the standard audit framework needs adaptation — the report structure, scoring, peer comparison, and recommendations all shift. See `references/dormant-account-audit.md` for the full adaptation protocol.
- **Pre-launch account taxonomy:** When the account exists but has zero content, classify the archetype before choosing the report framing. Three distinct patterns: (a) Clean Pre-Launch — never posted, 0 posts/0 followers; (b) Test-and-Delete — posted, then purged (detectable via Google index showing deleted post URLs); (c) Login-Walled Invisible — private or zero-content, all methods return nothing. Each archetype has different scoring calibration, peer strategy, and report tone. See `references/pre-launch-account-patterns.md` for the full taxonomy, scoring baselines, peer-selection rules for 0-follower accounts, and milestone calculation.
- **Non-existent account — pre-launch assessment:** When Instagram returns "Page isn't available" in the browser title AND FxTwitter returns `{"code":404,"message":"User not found"}` AND 3+ other platforms also show no presence, the account was never created or was permanently deleted. This is neither dormant nor a collision — it's a clean-slate pre-launch scenario. Pivot the entire audit to a pre-launch assessment: evaluate the handle as a brand asset, analyze positioning options, and produce a launch playbook instead of an optimization report. Score honestly (4/100 baseline). The 1% Compounding Move is always "create the account today and post within 24 hours." See `references/nonexistent-account-audit.md` for the full protocol including detection signals, cross-platform verification, positioning analysis, and report structure adaptations.
- **Stale Social Blade data / Instagram scraping degraded:** The curl meta-tag technique (`grep 'og:description'`) now fails for ~70% of accounts — Instagram serves JS-rendered pages with empty meta tags. Try it as a first attempt, but when it returns nothing, use cross-platform identity research: LinkedIn profiles, company websites, Pinterest, third-party analytics (NinjaOutreach, Qoruz, Viralist). See `references/instagram-data-sourcing.md` for the full fallback strategy. Always add a "Data Notice" callout to the report when metrics are estimated.
- **Total research blockade on test/spoof accounts:** When every research method returns nothing — Instagram meta tags empty, Social Blade Cloudflare-blocked, search engines blocked (API credits, captcha, botnet detection), third-party viewers blocked, cross-platform presence zero — STOP after documenting the failure log. The research failure IS the finding. Produce a verification table logging every attempted method and its result. Do NOT keep cycling through alternative sources hoping one will work; 8+ negative methods is conclusive. See `references/test-spoof-account-pattern.md`.
- **Test-branded active accounts — the throwaway-identity trap:** When the handle or display name contains "test" (e.g., @TestUser, "test User") but the account is actually active — FxTwitter returns 200 with real follower/tweet counts, TwStalker shows genuine human content in an identifiable niche (crypto, finance, etc.), and there are no bot/automation hallmarks — this is NOT a test/spoof account and NOT dormant. It's a real account operating under throwaway branding. **The "test" display name is the single biggest growth barrier** — it destroys credibility on every profile visit, regardless of content quality. Detection signature: FxTwitter returns code 200 with followers > 0 AND tweets > 0 AND content has identifiable human niche patterns. Differentiated from test/spoof (which have zero data and numeric suffixes) and dormant (which have zero tweets/followers). This archetype scores 14–25/100 — higher than test/spoof because real content and activity exist, but the brand layer actively repels followers. Frame the audit as a rebranding intervention, not an activation playbook. Keep all standard report sections — there's real content to analyze. Peer comparison should use real same-tier accounts in the identified niche. The 1% Compounding Move is always "change the display name from 'test User' to a real identity and write a bio today."
- **Handle collision with mega-accounts:** When the subject's handle shares a name with a much larger account (e.g., @narin_ahmad vs @narins_beauty at 16M+), every search query for the subject's name will return the mega-account. Check for this early in research — search the bare name (without underscores) to see what dominates. This is a structural discoverability barrier and should be documented in Weaknesses and Competitive Positioning. Consider recommending a handle differentiation strategy (add location suffix like "tr" or industry keyword).
- **Handle collision with ubiquitous technical terms — the invisible-account scenario:** When the subject's handle is an exact string match for a widely-used technical term, software concept, or industry acronym (e.g., @noauth = "no authentication"), every search result across every platform will be technical content — not the social account. The account becomes literally invisible. **Detection signal:** web_search returns zero social-media results for the handle; syndication.twimg.com returns empty JSON; Social Blade returns no record; Nitter instances return 503/403; direct X.com fetch returns the login wall or a generic page with no profile data; all results are docs, repos, security articles. When this pattern emerges after 3+ different research approaches, STOP diving deeper — you are not missing a technique, the account is structurally undiscoverable. **Pivot the audit:** make the handle collision itself the primary finding. Frame every section around "here is why nobody can find you." Produce the report as a strategic intervention — the audit IS the signal that the handle must change. See `references/handle-collision-discovery.md` for the full escalation sequence and pivot template.
- **Suspended account — archaeological audit pattern:** When the account previously existed but is now suspended or reclaimed by the platform, this is neither a collision nor a dormant placeholder — it is a platform-level terminal event. Detection: syndication.twimg.com returns empty `[]`, direct x.com fetch returns login wall, Social Blade has no record, but historical data IS recoverable through handle registries, early-adopter datasets, and blog archives. **Pivot the audit:** the Executive Summary must open with the suspension status — it IS the finding. Frame every section around "here is what happened and what can be learned." The peer comparison shifts from format/strategy to survival patterns (who kept their handle, who didn't, and why). The 90-day roadmap adds a "Pre-Phase 0: Resolve Suspension" step. Score honestly — a suspended account scores 10–20/100, with Growth Potential as the standout dimension. See `references/suspended-account-audit.md` for the full adaptation protocol including single-letter handle specifics and handle variant validation.
- When delivering files on Telegram, local filesystem paths in markdown don't work. Use `send_message` action=send with `MEDIA:/absolute/path` to deliver files directly.
- **YouTube consent wall bypass:** When navigating to a YouTube channel page triggers the "Before you continue to YouTube" consent screen, `browser_click` on the "Accept all" button may fail silently (the page stays on consent). Use `browser_console` to execute a JavaScript click instead: `(function(){var btns=document.querySelectorAll('button');for(var i=0;i<btns.length;i++){if((btns[i].innerText||'').toLowerCase().includes('accept')){btns[i].click();return 'clicked'}}return 'not found'})()`. Then call `browser_snapshot()` — the channel page should now render. This is the reliable bypass when standard click interactions don't advance past consent dialogs.
- **Chromium PDF rendering — snap sandbox path trap:** On systems where chromium is a snap, it CANNOT access `/tmp` — both the HTML input and PDF output paths must be under `/home/<user>/`. The diagnostic signature is unmistakable: a ~16KB PDF file means the snap sandbox blocked the file access and produced a blank/error page. A real PDF is 150KB+. The fix: (1) write HTML to `$HOME/something.html`, (2) pass `file:///home/<user>/something.html` as the URL (not a bare filesystem path), (3) output PDF to `$HOME/something.pdf`. The snap DBus errors in stderr are harmless noise — ignore them. See `references/pdf-generation.md` for the full diagnostic + verification workflow.
- **Dormant/placeholder accounts**: When the account exists but has 0 tweets, 0 followers, follows 0 or 1 accounts, and has never posted, this is a dormant placeholder, not an underperforming account. Detection: FxTwitter API returns `code: 200` with zero metrics (primary method); TwStalker is the reliable fallback when FxTwitter also returns nothing. X's own JS frontend may show "This account doesn't exist" — this is a false negative; trust FxTwitter/TwStalker over the X frontend. Do NOT frame as optimization — pivot to activation roadmap. Score honestly (0-2/100) as baseline. See `references/handle-collision-discovery.md` for the dormant pivot template.
- **Multi-handle brand — dormant domain-matched placeholder:** When the audited Instagram handle exactly matches the brand's domain (e.g., @eatfishwife ↔ eatfishwife.com), is dormant (≤50 followers, ≤5 posts, no bio), BUT the brand operates a successful active IG under a different handle AND has cross-platform presence matching the dormant handle's name (e.g., TikTok @eatfishwife), this is a distinct archetype. Detection: three-way check — (a) handle matches domain, (b) handle is dormant on IG, (c) brand has active IG elsewhere + cross-platform presence under this name. Do NOT score 0–2/100 like a random dormant placeholder — the domain-matched handle has brand-protection value. Score 8–15/100. Frame as an activation playbook, not a brand autopsy. The audit must present three handle-strategy options (redirect, replicate, differentiate) and recommend one. Peer comparison will almost always use verified off-tier peers because same-tier brands don't exist in public indices for mature CPG categories. Cross-promotion from the active handle is the 1% Compounding Move. See `references/multi-handle-dormant-placeholder.md` for the full protocol.
- **Wrong target:** `target="telegram"` sends to the home channel (Ash's DM). If the user is in a group like `typeshit`, use `target="telegram:typeshit"` — check the session context's `Source` field or call `send_message(action='list')` to discover available targets.
- Don't assume the user can access files on the local VM filesystem when they're on a messaging platform.
- For early-stage companies (pre-seed/seed), adjust score expectations downward — small audiences and missing platforms are expected, not failures.
- For personal brands (vs. companies), score on different criteria — trust and authority matter more than platform presence breadth.
- **Comparison framing:** When the user asks you to compare two accounts, especially in a client-facing report, **verify the relationship between the subjects first.** Do not assume competitive framing. Ask the user or search for evidence of collaboration, partnership, or shared projects. A competitor analysis vs. a peer/collaborator comparison have completely different tones, structures, and conclusions. Writing a competitive takedown about someone's collaborator is a serious error. Default to neutral/peer framing until the relationship is confirmed.
- When adding comparisons to an existing HTML report for a client (e.g., @hemalpatelphd), follow the report's existing CSS classes and section structure. Use the same `metric-grid`, `data-table`, `sw-grid`, `sw-card`, `rec-card`, `callout` patterns already in the file. Update the report subtitle in the header to list all benchmarks. Git commit and push after each addition. See `references/comparison-section-structure.md` for the standard section anatomy.
- **Product separation in collaboration comparisons:** When comparing two accounts that are collaborators (not competitors), do NOT suggest cross-promotion tactics that tie one party's specific product to the other party's events, audience, or brand without explicit confirmation. Some collaborations have legal or business constraints that prohibit product mixing. Stick to educational/practice-based collaboration ideas (joint Reels about mechanisms, co-hosted Lives, tagged carousels) rather than product-integration ideas (pre/post testing at retreats, product data shared across accounts). When in doubt, ask the user before drafting product-linked collaboration suggestions.
- **Monetization estimates for product-owning creators:** Do NOT estimate sponsored-post revenue ($X–$Y per post) for creators who sell their own product (courses, test kits, consulting, supplements). Their account is a product discovery engine, not a brand-deal vehicle. Estimating the wrong monetization model undermines the report's credibility. Instead, frame the account as a discovery channel for their own product and estimate the reach uplift from improved engagement. If the user explicitly asks for sponsored-post estimates, provide them but caveat that it is not the creator's actual business model.
- **Following-to-follower ratio as algorithmic trust signal — MANDATORY diagnostic for all audits:** When recommending that a user lower their following count, you MUST always explain why — never suggest it without the full rationale. For accounts under 50K followers, a following count above ~5% of follower count triggers Instagram's low-trust classifier — it restricts initial test-audience size on every post, capping reach before the four-hour window even opens. A ratio of ~11% (e.g., 2,564 following at 23K followers) is a first-order growth blocker, not cosmetic. Always flag the ratio explicitly in Weaknesses when it exceeds 5% and include all three rationales: (a) algorithmic trust signal — the low-trust classifier caps initial reach on every single post; (b) brand perception — high following counts read as inauthentic to potential collaborators, brands vetting for partnerships, and followers checking the profile; (c) method — use Instagram's "Least Interacted With" sort in the following list to unfollow down to the healthy ceiling (~3% of follower count). Make reducing it the #1 or #2 immediate action.
- **Barbell-distributed niches — peer discovery in creative/performer categories:** In dancer, choreographer, musician, and performer niches on Instagram, follower counts tend to cluster at the extremes — accounts either go viral and land above 100K, or stay at the emerging tier (<15K). The 15K–35K middle is structurally sparse. When same-tier peers can't be found after 6+ search attempts, the ecosystem method (mine the subject's credits, collaborators, and workshop rosters for handles) is the most productive approach — but even those accounts may sit at different tiers. Three acceptable fallback strategies, in order: (a) use an adjacent-niche peer at the same tier (e.g., a wedding choreographer for a commercial choreographer audit — different niche, same platform dynamics); (b) use a verified but off-tier peer from the same niche and state the follower count honestly; (c) rename section 6 to "Competitive Landscape" and include two verified peers plus a structural analysis of why the middle tier is sparse in this category. The barbell pattern itself is a finding — document it in the peer comparison callout. Never fabricate handles. Never use "Peer A" placeholders.
- **Named peers over archetypes — MANDATORY (client-facing reports):** NEVER use generic placeholder labels like "Peer A — Health-Tech Founder" or "Peer B — Wellness Brand CEO" in peer comparison tables. These are rejected on sight. Every peer must be a real, verifiable Instagram account with an actual handle. Verify handles via `browser_navigate` + `browser_console` expression `document.querySelector('meta[property=\"og:description\"]')?.content` to extract live follower counts before publishing. Name the account handle and the person's credentials (e.g., "@ayuswellnessuk — Zib, PhD Candidate, MSc Molecular Medicine"). Add a "Niche" row to contextualize why these are peers. When exact same-tier accounts can't be found after real effort, use verified-but-off-tier accounts with the follower count stated — that's still better than "Peer A." Mark metrics as approximate (~) when exact data is unavailable. **For sub-1000-follower accounts, peer discovery requires a different strategy — see `references/micro-account-peer-discovery.md` for the 5-pass discovery protocol, follower-per-post efficiency metric, and stop conditions. For professional niches with hierarchy structures (choreographers under lead choreographers, associates under partners, assistants under directors), mine the subject's ecosystem for same-tier peers rather than relying on search alone — see `references/ecosystem-peer-discovery.md` for the full technique.** For creator audits, the lightweight table-only peer comparison (see `references/creator-audit-extensions.md`) is preferred over the full multi-subsection competitive comparison from `references/comparison-section-structure.md`.
- **Same-tier comparison rationale:** Always include a brief explanation of why comparing to same-tier accounts (10K–50K) is more useful than benchmarking against 1M+ accounts like @hubermanlab. Large accounts have teams, years of algorithmic compounding, and resources that don't apply to a solo/small-team creator. The callout should say: "These peers operate with constraints similar to [client]'s: solo or small-team, PhD-anchored, building audience from scratch."
- **Deployment awareness — verify the live file path:** Before editing a report, verify which file is the live/deployed version. Check git remotes, webserver config, and symlinks. For narin project reports, the live file is in `~/projects/narin/` (deployed to `asheshkaji.com/narin/`). Editing a copy in a different directory won't reach the live site. After editing, push to the correct repo.
- **Wrong report format for Narin's portfolio — use Hemal light theme, not dark theme:** When Narin asks for an Instagram audit to be added to narinfazlalipour.com/projects/ (or says "run it exactly like hemal's"), use the **light-theme Hemal format** from `references/hemal-report-format.html`. Do NOT use the dark-theme multi-platform format from the AuditLayer worker. Key differences: light background (`--bg: #fafaf9`), teal accent (`--accent: #0d9488`), Inter + JetBrains Mono only (no Cormorant Garamond), Instagram-only sections (no cross-platform tables), no score bars, no tier badges. The canonical reference file is `~/projects/narin/hemalpatelphd-instagram-audit.html`. Building the wrong format (dark theme, multi-platform, different sections) and then needing to be corrected is a waste of the user's time and tokens. Always default to Hemal format for Narin's portfolio audits unless she explicitly asks for a different format.
- **Peer Comparison is MANDATORY — never skip it:** Every brand and creator audit MUST include a Peer Comparison section comparing the subject to 3 same-tier accounts. The user explicitly trained this requirement ("remember I also taught you to compare the accounts to three others that are in the same field"). Use real named accounts with verified handles when available (e.g., @siphoxhealth). When exact same-tier accounts can't be found, use archetype descriptions but still provide the full comparison table with estimated follower ranges marked (~). Always include the "Why same-tier comparison matters" callout. Skipping this section and being corrected by the user is a first-class failure. The comparison table should appear between Root Cause Analysis and Content Format Analysis — same position as in the canonical Hemal report.
- **Narin's portfolio uses a separate GitHub Pages repo:** When asked to add an audit report to narinfazlalipour.com (her personal portfolio), do NOT edit files in `~/projects/narin/personal/` or push to `ashesh8500/narin.git`. The live site is deployed from `narinfazlalipour/narinfazlalipour.github.io` (main branch). Clone it via `gh repo clone narinfazlalipour/narinfazlalipour.github.io` (gh CLI must be logged in as narinfazlalipour), add the report to `projects/`, and update the Projects tab panel in index.html. The source files in `~/projects/narin/personal/` are an OLDER scroll-based design that has completely diverged from the live tab-based SPA. See `personal-website-dev` skill for the full architecture.
- **Non-AuditLayer personal documents do NOT go in the auditlayer-app directory.** When Narin asks for a personal document (rec letters, AMCAS materials, personal plans), use `~/Documents/narin/` — never `~/projects/auditlayer-app/docs/`. AuditLayer docs are for product artifacts only. Personal/career materials belong under `~/Documents/narin/` or the appropriate skill's template directory.
- **When Narin says she's tired or overwhelmed ("I'm literally so tired"), stop iterating and ship.** Do not ask for more details, refinements, or decisions. Take what you have, fill gaps with your best judgment, and deliver a complete artifact. The user would rather correct a finished draft than answer questions while exhausted. This applies to all artifacts — Pulse sections, rec letters, reports, templates.
- **Verify follower counts before publishing — ask the user or check live.** Never trust a follower count from a prior session, a prior audit, or web search results. Instagram account sizes change. Publishing an audit with stale follower counts (e.g., 4,000 when the account is at 6,631) undermines report credibility and forces a correction pass. Before publishing any audit, either (a) ask the user for the current count if they're the client, or (b) use `browser_navigate` + `browser_console` with `document.querySelector('meta[property="og:description"]')?.content` to extract the live count from the Instagram profile page meta tag. This meta-tag technique is the one Instagram method that still works reliably (May 2026) — the profile page loads the og:description with follower/post/following counts even behind the login wall. When the follower count changes, recalibrate ALL derivative numbers: benchmark tier, roadmap targets, phase targets, peer comparison positioning, and all prose mentions. Use `execute_code` to batch the replacements across every file that references the stale number.

## Style & Formatting
- **Title format:** Use "Dr. Jane Smith" with a period after "Dr". This applies throughout report text, tables, section headings, and comparison content.
- **Meeting-ready reports:** Reports in the narin project (`/home/asheshkaji/projects/narin/`) are often used in client meetings and presentations. Keep language crisp and professional. Avoid informal shorthand, internet slang, or overly casual framing. The report is a deliverable, not a conversation transcript.
- **Table-first, prose-light:** When adding comparison sections, growth roadmaps, or audit cadence — default to tables. The user prefers clean data tables over long narrative paragraphs for these sections. Limit introductory prose to 1-2 sentences before any table. Let the table carry the argument. Reserve longer prose for sections that genuinely need it: Executive Summary, Strategy rationale, Root Cause callouts. If the user says "just keep the tables, I don't want more than that yet," follow that directive.
- **Handle typos proactively:** When bulk find-and-replace operations are needed (e.g., changing "Joe" → "Dr Joe" throughout a file), use Python scripts via the terminal rather than chained `sed` commands — Python is more reliable with edge cases like HTML entities and avoids the "Dr Dr" double-replacement problem.
- **Narin's strategy insights are AuditLayer IP:** When Narin shares creator-strategy insights, thumbnail tactics, comment engagement frameworks, or product ideas in conversation, save them proactively to the AuditLayer docs (`~/projects/auditlayer/docs/`) as markdown files. Do NOT wait to be asked. These conversations produce domain expertise that differentiates AuditLayer from generic analytics tools — every one should be a durable asset.
- **Routing product decisions to Ashesh for Narin:** When Narin says "run this by Ash," prefer the shared `typeshit` Telegram group over DM. Only use DM when Narin explicitly asks for it. The group keeps both co-founders aligned and visible.
- **1% Compounding Move framing in audits:** When presenting recommendations, frame the single most critical one as a "1% Compounding Move" — a small daily action that compounds hardest (Atomic Habits: 1% better/day = 37x in a year). This makes audits psychologically executable and is an AuditLayer product differentiator. Place it as a dedicated callout box at the top of the recommendations section, before the 3-tier ranking.
- **Never use transactional framing in proposals/contracts:** Do NOT use language like "I did the audit before asking for money" or "I found this before you paid me." It reads as charity, not competence. Frame the audit-first approach as expertise: "I know the account cold. I audited @handle before I wrote a single word of this proposal — every gap in here, I found myself." Confidence lands. Transaction lands desperate.
- **Verify client/partner names before publishing:** When building client-facing materials that include a person's name (e.g., Neema/Nima in the AtllasAI contract), verify the spelling against their actual Instagram handle, bio, or website. Misspelling a client's name in a proposal or contract is a credibility killer. The user will catch it, and it signals carelessness. When in doubt, ask or double-check against the handle.
