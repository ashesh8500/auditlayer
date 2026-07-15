# Compact Brand Pulse — Design Spec

The compact Brand Pulse is the DEFAULT format for CPG brand audits. It reads in 90 seconds, fits on one mobile scroll, and is designed for lead-gen and DM outreach — not comprehensive analysis.

## When to use

- Lead-gen / DM outreach ("here's your score")
- Portfolio teaser (narinfazlalipour.com projects grid)
- First-contact artifact before a full audit
- User says "shorten that" or "make it a pulse"
- Default for any new CPG brand audit unless user explicitly asks for full/deep

## When NOT to use

- Paid client deliverables (use full 11-section or Hemal format)
- User explicitly asks for comprehensive analysis
- Client has already paid and expects depth

## Section structure (5 sections)

1. **Score Diagram** — 6-dimension horizontal bar chart + overall /100. Color-coded: green ≥65, amber 35-64, red <35. Same CSS as full audit score-diagram component. Dimensions: Brand Story, Product Quality, Visual Identity, Content Cadence, Community, Retail-to-Social Bridge (or category-appropriate equivalents).

2. **What's Working** — 2 `.card.strength` cards (green left-border, `.card-tag` label). Headline + 2-3 sentences max per card. Focus on structural advantages, not flattery.

3. **What's Missing** — 2 `.card.gap` cards (red left-border, `.card-tag` label). Followed by ONE diagnosis `.callout` (teal left-border, `.accent-muted` background). The callout answers "what's the common thread across both gaps?"

4. **Three Moves** — Numbered `.move-card` components with `.move-num` circle (teal accent, JetBrains Mono). Each: headline + 2-3 sentences. Actionable, specific, sequenced. Not "do more Reels" — "film the founder story arc, 4 Reels, one filming session."

5. **Weekly Rhythm** — `.mini-cal` grid (3 columns: Day / Format / Content). 5 days (Mon-Fri). Each: format (Reel/Carousel/Story) + content pillar + example. Ends with ONE target callout: "4.5K → 15K in 90 days. The variable isn't whether the story is compelling — it's whether it gets told on the feed."

## Design rules

- **Container:** `.container` max-width 680px
- **Theme:** Light (`--bg: #fafaf9`), teal accent (`--accent: #0d9488`)
- **Fonts:** Inter (body) + JetBrains Mono (numbers only)
- **NO data tables** except the mini calendar
- **NO multi-paragraph narrative sections** — cards only
- **NO peer comparison** — that's a full audit feature
- **NO 90-day timeline, benchmarks, or recheck cadence**
- **NO "The Product" or "The Story" narrative sections** — the score diagram IS the introduction
- Section headers use emoji icons: 🟢 What's Working, 🔴 What's Missing, ⚡ Three Moves, 📅 Weekly Rhythm

## Design rules — what it shares with full audit

- Same CSS token system (`--bg`, `--surface`, `--text`, `--muted`, `--line`, `--accent`, `--accent-muted`, `--green`, `--amber`, `--red`, and muted variants)
- Same score diagram component
- Same card border-color conventions (green=strength, red=gap)
- Same media query breakpoint at 600px for single-column card grids

## Canonical reference

`/tmp/narin-pages/projects/eatbahamii-pulse.html` — the live deployed version. Use this file's CSS patterns, not the full audit's 11-section CSS.
