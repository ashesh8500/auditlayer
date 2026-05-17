# Audit Methodology — 15-Section Framework

The standard audit pipeline for a brand, company, or creator's social media presence. This framework has been battle-tested across multiple accounts (creators at 10K and 7.4M scale, health-tech companies, wellness brands) and produces reports that are consistently actionable, scorable, and comparable.

---

## Phase 1: Research Sweep

Before writing any analysis, gather data across these sources:

### Data Sources
- Platform-native: follower counts, post counts, bio, highlights, link-in-bio destinations
- Third-party tools: Social Blade, Instastatistics, Viralist, Speakrj, Socialveins, InfluencerFee, Favikon
- Website: product/pricing/mission/business model from the subject's own domain
- Competitor context: search for "[subject] vs [competitor]" comparisons, industry benchmarks
- Community sentiment: Reddit (r/ subject, r/ industry), trustpilot, app store reviews
- Business context: funding rounds, valuations, revenue estimates (Crunchbase, news articles)
- Academic/scientific credibility: Google Scholar, institutional pages, publication records (for expert creators)

### Research Output
A raw data document with:
- Per-platform metrics (followers, posts, engagement rate, content style notes)
- Competitive landscape map (3-5 comparable accounts with metrics)
- Sentiment summary (what audiences say about them when they're not looking)
- Business maturity assessment (revenue stage, team size, funding)

---

## Phase 2: The 15-Section Report

### 1. Executive Summary
- 3 paragraphs: current state, root cause, opportunity
- One callout box with the core insight
- Sets the thesis the rest of the report proves

### 2. Brand Snapshot
- Key facts table: founded, HQ, product, pricing, valuation, revenue, investors, team size
- For creators: niche, content pillars, publishing cadence, revenue model

### 3. Platform-by-Platform Audit
- Per platform: followers, content style description, engagement range, content mix breakdown, verdict
- Verdict format: one sentence identifying the platform's role in the overall strategy
- Include all relevant platforms: Instagram, TikTok, YouTube, X/Twitter, LinkedIn, Facebook, Reddit, Threads, newsletter, podcast

### 4. Strengths (8-10 items)
- What's working, structural advantages, unique assets
- Use `sw-card strength` pattern: numbered cards with label, title, description
- Distinguish between structural strengths (hard to copy) and tactical strengths (good execution)

### 5. Weaknesses (8-10 items)
- What's broken, missing, or underperforming
- Use `sw-card weakness` pattern
- Prioritize weaknesses that directly impact growth or revenue

### 6. Growth Bottlenecks
- Severity-ranked table: bottleneck, impact, fix difficulty, priority
- Use `data-table` with severity indicators (tag classes: `strength`/`weakness`/`neutral`)
- Include a root cause analysis subsection with a gap table (Reality vs. Instagram columns)

### 7. Content Gaps
- Formats/topics entirely absent from the current strategy
- Each gap: what's missing, why it matters, what the first piece should be

### 8. Audience Psychology Patterns
- Primary audience motivation (what drives them to follow/engage)
- Secondary audience segments (adjacent audiences to capture)
- Emotional triggers that work on this audience
- What they share and why

### 9. Viral Opportunities
- 5-8 high-leverage content ideas with specific hooks
- Format suggestion for each
- Expected reach multiplier vs. current baseline

### 10. Monetization Opportunities
- Revenue levers from social presence: sponsorships, product sales, courses, memberships, lead gen
- For companies: conversion funnel assessment, landing page alignment
- Revenue-per-follower benchmarks where available

### 11. Performance Score (out of 100)

Weighted 8-dimension scoring:

| Dimension | Weight | What it measures |
|---|---|---|
| Branding & Messaging | 10% | Visual identity, bio, positioning clarity |
| Audience Alignment | 15% | Content matches audience needs and motivations |
| Content Strategy | 20% | Formats, cadence, pillars, editorial coherence |
| Engagement Quality | 15% | Comment depth, save/share ratios, reply behavior |
| Growth Potential | 15% | Format leverage, collaboration density, platform expansion |
| Platform Optimization | 15% | Platform-native features used, algorithm signals |
| Conversion Strategy | 5% | Link-in-bio, funnel, CTA clarity |
| Competitive Positioning | 5% | Differentiation, moat, category ownership |

Adjust expectations for scale: early-stage accounts (under 5K) score lower on platform breadth but can score high on engagement quality. For personal brands, weight trust/authority higher than platform presence.

### 12. Competitive Context
- Comparison table: subject vs. 2-4 comparables (followers, engagement, content mix, revenue)
- For each comparable: what they do better, what the subject does better
- Distinguish competitors from peers/collaborators — see [Comparison Frameworks](./comparison-frameworks.md)

### 13. High-Impact Recommendations
- 3 tiers ranked by expected growth impact (★★★★★ to ★★☆)
- Tier 1: immediate, high-impact, low-effort
- Tier 2: medium-effort, structural improvements
- Tier 3: strategic, longer-horizon
- Each recommendation: what to do, why it works, how to measure success

### 14. Platform-Specific Improvements
- Per-platform tactical guidance
- Instagram: format mix, Stories strategy, Collab posts, bio optimization
- YouTube: thumbnail strategy, chapter markers, description SEO
- TikTok: hook timing, trend participation, stitch/duet strategy
- LinkedIn: thought leadership cadence, article vs. post mix
- Newsletter: subject line patterns, segment strategy, CTA placement

### 15. 30-Day Optimization Strategy
- Week-by-week tactical plan with specific actions
- Success metrics for each week
- Content calendar template (day × format × pillar × example)
- Quick wins section: 5 things they can do this week

---

## Phase 3: Report Assembly

### Save Convention
```
/home/asheshkaji/projects/analyses/<subject-slug>-social-media-audit.md
```

### Output Formats
- Markdown (`.md`) for draft/iteration
- Self-contained HTML (`.html`) for client delivery — embeds all CSS, zero external dependencies

### HTML Report CSS Classes

These are the canonical CSS patterns for audit reports:

| Class | Purpose |
|---|---|
| `metric-grid` | 4-column grid of key metrics |
| `metric-card` | Individual metric (value + label) |
| `data-table` | Full-width comparison/analysis tables |
| `sw-grid` | 2-column grid for strengths/weaknesses |
| `sw-card` | Individual strength/weakness card (`.strength` or `.weakness` variant) |
| `rec-card` | Numbered recommendation card with accent-colored position marker |
| `callout` | Key insight box (blue left-border, blue-muted background) |
| `tag` | Inline badge (`.strength` green, `.weakness` red, `.neutral` blue) |
| `calendar-grid` | 4-column content calendar layout |
| `timeline-item` | Timeline entry with colored dot (`.t-dot` + color class) |
| `highlight` | Highlighted table row variant |
| `report-header` | Report title block with `.label`, `h1`, `.subtitle`, `.meta` |
| `report-footer` | Bottom metadata strip |

### Design Tokens
```css
--bg: #fafaf9;        /* Page background */
--surface: #ffffff;   /* Cards */
--text: #1c1917;      /* Primary text */
--muted: #78716c;     /* Secondary text */
--line: #e7e5e4;      /* Borders */
--accent: #0d9488;    /* Teal — scientific/clinical */
--green: #059669;     /* Strengths */
--red: #dc2626;       /* Weaknesses */
--amber: #d97706;     /* Warnings */
--blue: #2563eb;      /* Info callouts */
```

### Typography
- Body: Inter, -apple-system, BlinkMacSystemFont, sans-serif
- Numbers: JetBrains Mono, monospace
- Font sizes: headings 2.1rem→1.35rem→1.05rem, body 0.95rem, labels 0.72rem
- No serif fonts, no display fonts, no handwriting — signals academic/professional credibility

### Styling Rules
- **Title format:** "Dr Jane Smith" not "Dr. Jane Smith" — no period after "Dr"
- Reports are client-facing deliverables — use professional, meeting-ready language
- No internet slang, no overly casual framing
- Avoid stock photography and generic clip art for visual branding sections
- For personal-brand accounts by scientists/academics: emphasize real lab imagery, data visualizations, and actual research artifacts

---

## Phase 4: Delivery & Iteration

### Delivery
- When communicating via messaging platforms, always deliver files with native media delivery, never paste local filesystem paths
- Verify the correct target (group vs. DM) before sending

### Post-Delivery Iteration
- Comparison sections follow a standard anatomy — see [Comparison Frameworks](./comparison-frameworks.md)
- When adding comparisons to existing HTML reports, use the report's existing CSS classes — never introduce new styles
- Update the report subtitle to include new benchmark handles
- Git commit after each addition
- Use Python scripts (not chained sed) for bulk find-and-replace operations — avoids double-replacement problems

### Safe Replace Script
Path: `scripts/safe-replace.py` in the social-media-audit skill directory
```python
# Usage: python3 safe-replace.py <file> '<json_replacements>'
# replacements is a JSON list of [old, new] pairs
# Order matters — longer patterns should come first
```

---

## Pitfalls

1. **Comparison framing:** never assume competitive framing. Verify the relationship between subjects before writing comparisons. Competitor analysis and peer/collaborator comparisons have different tones, structures, and conclusions.

2. **Product separation:** when comparing collaborators, do not suggest cross-promotion that ties one party's product to the other party's events or audience without explicit confirmation. Some collaborations have legal constraints prohibiting product mixing.

3. **Scale-adjusted expectations:** for early-stage (pre-seed/seed) companies, adjust score expectations downward. Small audiences and missing platforms are expected, not failures.

4. **Personal brand scoring:** score personal brands on trust and authority more than platform breadth.

5. **File delivery:** local filesystem paths are invisible to messaging platform users. Use native media delivery.

6. **Target routing:** check the session context for the user's origin group/channel before sending messages.

7. **Handle typos proactively:** when bulk find-and-replace is needed, use Python scripts rather than chained sed — avoids "Dr Dr" double-replacement.
