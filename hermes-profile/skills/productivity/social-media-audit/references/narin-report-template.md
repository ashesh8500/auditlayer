# Narin Report Template — Reference

Canonical source: `worker/templates/narin_reference_template.html` (56,663 bytes)
Derived from: Hemal Patel social media audit (Narin-built, May 2026)
Last synced: May 24, 2026

## Template-Driven Architecture

The worker loads CSS and section structure dynamically from this template at runtime.
**To update:** replace `worker/templates/narin_reference_template.html` and rebuild Docker.
The worker's `_load_template_css()` and `_load_template_sections()` extract the style block
and h2 headings automatically — no prompt editing needed.

## Design Tokens (exact, from template)

```css
:root {
  --bg: #0d1117;      --surface: #161b22;   --surface2: #1c2129;
  --border: #30363d;  --text: #e6edf3;       --text2: #8b949e;
  --accent: #58a6ff;  --red: #f85149;        --green: #3fb950;
  --amber: #d29922;   --purple: #a371f7;
}
body { font-family: system-ui, -apple-system, sans-serif; max-width: 960px; }
```

## CSS Class System (as used in template)

| Class | Purpose |
|-------|---------|
| `table` | All data tables (no `.data-table` class needed — base table styled) |
| `th` | Header cells: uppercase, letter-spaced, surface2 background |
| `.verdict` + `.verdict-ok` (amber) / `.verdict-weak` (red) / `.verdict-strong` (green) / `.verdict-good` (blue) | Platform performance badges |
| `.metric-card`, `.metric-grid` | Stat cards in responsive auto-fit grid |
| `.sw-card`, `.sw-grid` | Strengths/weaknesses cards (2-col grid) |
| `.sw-card.strengths` / `.sw-card.weaknesses` | Green/red h3 coloring |
| `.rec-card` + `.tier.t1/.t2/.t3` | Recommendation cards with tier labels |
| `.score-bar`, `.score-fill`, `.score-label` | Performance score visualization |
| `.callout` | Highlighted info boxes (blue-tinted) |
| `.data-notice` | Data-quality warnings (red left-border) |
| `.stars` | Amber star ratings |
| `.footer-note` | Methodology attribution footer |
| `.timeline-item`, `.t-dot`, `.t-content` | Timeline/roadmap entries |

## Section Structure (16-17 h2 sections)

Sections extracted dynamically from template `<h2>` tags. Canonical list:

1. Executive Summary
2. Brand Snapshot (attribute/detail table)
3. Platform-by-Platform Audit (multi-platform table with verdicts)
4. Strengths (10-item ol)
5. Weaknesses (10-item ol)
6. Root Cause Analysis
7. Peer Comparison
8. Growth Bottlenecks (severity-ranked table)
9. Content Gaps
10. Audience Psychology Patterns
11. Viral Opportunities
12. Engagement Growth Strategy
13. Performance Score (weighted 8-dimension)
14. Road to [Milestone] — 90-Day Growth Timeline
15. High-Impact Recommendations (3 tiers)
16. Content Ideas — 10 Pieces
17. How Often Should You Re-Audit?

## Key Conventions

- Tables over paragraphs when data is multi-dimensional
- Verdict badges over plain text assessments
- Numbers over vague claims
- Honest scores — weak accounts get weak scores
- Peers must be real discoverable accounts
- Content structure matching > pixel-perfect aesthetic matching (user preference)
- Narin owns the template — worker tracks her changes automatically
