# Narin's 15-Section Audit Framework

Specified by Narin Fazlalipour, May 30, 2026. This is the canonical product structure for all AuditLayer reports.

Canonical reference: `/tmp/narin-pages/projects/hemalpatelphd-scorecard.html` (live at narinfazlalipour.com/projects/hemalpatelphd-scorecard.html)

---

## Section Map

### 1. Overall Score
**Default: horizontal bar score diagram** (`.score-diagram` with `.sd-row`/`.sd-track`/`.sd-fill`). 6-8 dimension bars, color-coded thresholds (green ≥65, amber 35-64, red <35), plus overall bar with border-top separator. Overall score /100 in JetBrains Mono at top-right of the section header. Follow immediately by diagnosis callout (teal accent box): one paragraph answering "what does this score mean?"

Opt-in alternative: circular SVG donut rings (see `references/circular-scoring-component.md`). Use ONLY when Narin explicitly asks for circular/ring scoring. She reverted circular on the @auditlayer report (June 2026) and prefers the clean horizontal bar format.

### 2. Raw Numbers
4-card metric grid (followers, engagement rate, avg likes, avg comments) + full data table with 9 rows vs. 10K-tier benchmarks. Each row has a color-coded tag (strength/weakness/neutral). One closing paragraph interpreting the headline number. No analysis beyond the headline — save that for sections 3 and 4.

### 3. Top 5 Strengths
5 `.sw-card.strength` cards in 2-column grid. Each: green left-border, uppercase label ("Strength N"), bold title, 2-3 sentence body. Odd count layout: last card spans full width or use 3+2 split.

### 4. Top 7 Weaknesses
7 `.sw-card.weakness` cards. Same structure as strengths but red left-border. Odd count layout: 4+3 split, last card can span full width.

### 5. Three Immediate Actions
`.timeline-item` components with `.t-dot.accent`. Numbered 1-3. One paragraph each. Must be executable this week with zero new tools/skills. First action is always highest-leverage.

### 6. Competitive Comparison
Full data table: 4 columns (subject + 3 real named peers). Rows: Followers, Niche, Engagement Rate, Primary Format, Reels/week, Carousels/week, Promo ratio, Story engagement, Save content. Include comparison callout. Always use real IG handles.

### 7. Three Content Ideas
`.idea-card` components with teal left-border. Each card: format description, why it fits THIS account specifically, first 3 example topics. Must feel native — not generic content advice.

### 8. 90-Day Map
Three phases as `.timeline-item` components: Foundation (Days 1-30), Acceleration (31-60), Compound (61-90). Each phase: follower target, specific actions, endpoint success signal. Summary table with timeline/new followers/engagement rate/mechanism.

### 9. Stories & Highlights
Daily Story protocol table (Morning/Midday/Evening — Format/Content/Purpose). Three highlight covers to build first (`.sw-card.strength`). Closing callout.

### 10. Content Schedule
7-day `.calendar-grid`: Mon-Sun, Format/Pillar/Example columns. One row per day. Shows what the feed looks like at full tempo.

### 11. The Four-Hour Window
The first 4 hours after posting is the critical algorithmic window — every genuine reply signals thread depth, trains the algorithm to push to non-followers, and multiplies reach. Calibrated by account size: ≤30K reply to every Tier 1 comment personally; >30K target first 30 comments within 4 hours. No bots at any size. Close: "Reply manually. Under 30K: all of them. Over 30K: first 30 in 4 hours."

### 12. Presentable Feed
Intro + "Current State" paragraph + "What to Fix" table (5 rows: Color palette, Thumbnail style, Grid rhythm, Text on images, Profile picture). Close with storefront metaphor callout.

### 13. Hashtags
Rule: 3-5 niche, not 30 generic. Hashtag tiers table (Niche 10K-100K / Community 100K-500K / Reach 500K+). How to find new ones (weekly habit). Where to put them (caption, not first comment).

### 14. Audit Cadence
4-row table: Weekly Pulse Check (10 min), Monthly Signal Read (30 min), Quarterly Full Audit (2-3 hrs), Post-Viral Spike Review (45 min). Columns: Cadence/Purpose/What to Check/Time. Close with callout + next audit date.

### 15. What Comes Next
`.upgrade-box` — teal gradient background, white text, centered. Heading: "This audit is a snapshot. The real work is the follow-through." 2-sentence Pro description. CTA button: "Upgrade to Pro →". Natural close, not pushy.

### Powered By Badge (MANDATORY — after section 15)
Every report must close with: `<div class="powered-by"><span class="alm-badge">ALM</span> Powered by AuditLayerMedia</div>` followed by the IG handle with camera icon. Non-negotiable.

---

## Design System

- Light theme: `--bg: #fafaf9`, `--surface: #ffffff`
- Teal accent: `--accent: #0d9488`, `--accent-muted: #f0fdfa`
- Fonts: Inter (body) + JetBrains Mono (numbers)
- Container: 760px max-width
- Green: `#059669`, Amber: `#d97706`, Red: `#dc2626`
- Blue callouts: `--blue: #2563eb`, `--blue-muted: #eff6ff`

### CSS Components Used
- `.score-diagram` — horizontal bar chart (DEFAULT); `.sd-row`, `.sd-track`, `.sd-fill` (`.high`/`.mid`/`.low`), `.sd-overall`
- `.score-circles` — circular SVG donut rings (opt-in only when Narin asks); `.circle-grid`, `.circle-card`, `.circle-value`, `.circle-label`, `.overall-ring-wrap`, `.overall-value`, `.overall-label`
- `.callout` — blue left-border info box; `.callout.accent` for teal variant
- `.metric-grid` — 4-column stat cards with `.value` and `.label`
- `.data-table` — full-width comparison tables with `.highlight` rows and `.num` cells
- `.sw-grid` — 2-column card grid; `.sw-card.strength` (green border), `.sw-card.weakness` (red border)
- `.idea-card` — content idea cards with teal left-border and `.idea-meta` label
- `.timeline-item` — flex row with `.t-dot` (accent/green/red) and `.t-content`
- `.calendar-grid` — 4-column schedule grid with `.ch` headers and `.cr` rows
- `.upgrade-box` — teal gradient CTA box with `.cta-btn`
- `.report-footer` — muted footer text + AuditLayer badge

---

## Deployment

```bash
cd /tmp/narin-pages
git add projects/<file>.html
git commit -m "message"
git push origin main
# Verify with cache-busting query param:
curl -sL "https://narinfazlalipour.com/projects/<file>.html?v=$(date +%s)" | grep "<expected>"
```

Repo: `narinfazlalipour/narinfazlalipour.github.io` (main branch)
URLs: `narinfazlalipour.com/projects/<filename>.html`

---

## Pitfalls

- **web_extract misses visuals** — score diagrams and styled components render as plain text. Use `curl` via terminal to inspect deployed reports.
- **GitHub Pages caching** — may serve stale version for 5-10s after push. Always verify with cache-busting `?v=$(date +%s)`.
- **Section count must be exactly 15** — Narin specified these 15 sections explicitly. Don't add or remove unless she directs.
- **Content ideas must be account-specific** — generic "post more Reels" advice fails section 7. Each idea needs a format, a why-it-fits-this-account rationale, and 3 concrete first examples.
