# Shaima-Style AuditLayer Standard Report Variant

Use when Narin asks for a report "like @shaimastrategist," "Shaima format," or to restructure a portal/generated report into the newer Shaima-style 15-section format.

## Required section headings

Exactly 15 `<h2>` sections:

1. Executive Summary
2. Key Metrics
3. Strengths
4. Weaknesses
5. Root Cause Analysis
6. Peer Comparison
7. Content Format Analysis
8. Engagement Growth Strategy
9. Content Calendar & Creative Board
10. Quick Wins — This Week
11. Success Benchmarks
12. Audience Profile
13. Road to [computed milestone]
14. Audit Cadence
15. Get the Execution Plan

## Required layout

- Use `div.report-header`, not `<header>`.
- Place `.data-notice` before Section 1.
- Section 1 includes `.score-diagram > .overall-score` followed by `.sd-row` dimensions (`.sd-label`, `.sd-track`, `.sd-fill.green|.amber|.red`, `.sd-value`).
- Color thresholds: green >=65, amber 35-64, red <35.
- Section 9 includes:
  - `Creative Board` with 4 idea/rec-card entries by default (adjust if the user specifies otherwise).
  - `Weekly Rhythm` using `.calendar-grid` (Day / Format / Pillar / Example columns).
- Section 10 uses `.timeline-item` with `.t-dot.accent` or `.t-dot.green` boxes.
- Section 15 includes Standard ($30) vs Extended ($50) CTA comparison table, the email `hello@auditlayermedia.com`, and a CTA button reading "Get Your Report → auditlayermedia.com".
- Footer/report details, disclaimer, and `.powered-by` badge appear after Section 15.

## CSS/classes

This variant uses Shaima-style CSS classes: `.score-diagram`, `.overall-score`, `.sd-row`, `.sd-label`, `.sd-track`, `.sd-fill`, `.sd-value`, `.callout.accent`, `.callout.warning`, `.data-notice`, `.calendar-grid`, `.powered-by`, `.disclaimer`, `.report-footer`, `.cta-section`, `.cta-button`, `.cta-sub`.

CSS tokens: `--bg: #fafaf8`, `--surface: #ffffff`, `--text: #171513`, `--text-body: #3d3835`, `--muted: #8b8680`, `--line: #eae8e4`, `--accent: #0d9488`, `--accent-hover: #0f766e`, `--accent-muted: #f0fdf9`, `--green: #059669`, `--amber: #d97706`, `--red: #dc2626`.

Tables use `border-collapse: separate; border-spacing: 0;`. Tags are pill-shaped (`border-radius: 12px`). Timeline dots use `box-shadow: 0 0 0 3px var(--green-muted)` etc.

Container max-width: 720px. Google Fonts: Inter + JetBrains Mono via `<link>`.

## What differs from older Hemal/canonical compliance

| Element | Older Hemal compliance | Shaima variant |
|---|---|---|
| `<h2>` sections | 14 Footer + 15 Powered by ALM | 14 Audit Cadence + 15 Get the Execution Plan |
| Scoring visualization | Horizontal bars only | `.score-diagram` with `.overall-score` |
| Section 9 | N/A | Content Calendar & Creative Board |
| Footer placement | Inside Section 14 | After Section 15, inline |
| Powered-by badge | Inside Section 15 h2 | After Section 15, `.powered-by` div |
| `.callout.accent`/`.warning` | Banned | Allowed |
| `.score-diagram`/`.sd-*` | Banned | Required |

Do not apply the older Hemal/canonical compliance restrictions to Shaima-style reports.

## ALM ribbon

Every Shaima-style report includes a teal gradient ribbon at the top of `<body>` (before `.container`):

```html
<div style="width:100%;background:linear-gradient(135deg,#0d9488 0%,#0f766e 100%);padding:10px 0;text-align:center;border-bottom:1px solid rgba(255,255,255,0.12);">
  <div style="max-width:720px;margin:0 auto;padding:0 32px;display:flex;align-items:center;justify-content:center;gap:10px;">
    <span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:700;letter-spacing:0.16em;color:#ffffff;text-transform:uppercase;">AuditLayerMedia</span>
    <span style="display:inline-block;width:5px;height:5px;background:rgba(255,255,255,0.45);border-radius:50%;margin:0 4px;"></span>
    <span style="font-family:'Inter',sans-serif;font-size:12px;font-weight:400;color:rgba(255,255,255,0.82);letter-spacing:0.03em;">@handle · Instagram Audit · Month Day, 2026</span>
  </div>
</div>
```

## UGC creator & personal brand scoring dimensions

When the account is a personal brand UGC creator (not a product business), score across these dimensions:

- Trust & Proof of Work
- Content Quality
- Brand-Readiness
- Platform Optimization
- Audience Connection
- Discovery Architecture
- Content Strategy

Do not apply business-account metrics (product visibility, conversion architecture, etc.).

## Validation pitfalls

- Do not check the ALM ribbon by searching only the first 5,000 chars of the file — long CSS blocks may push body content well past that cutoff. Search the full HTML, or limit the search to content after the opening `<body>` tag.
- If the user says a report is "off," run structural QA against THIS variant spec, not against the older Hemal compliance file.
- Before delivery, verify: exact 15 `<h2>` headings, Creative Board + calendar-grid in Section 9, CTA in Section 15 matches requested text, no stale `$30/mo` or `$50/mo` pricing, no broken sentence fragments from partial patches, no cross-contamination from other accounts/audits.
- Run a final QA script that counts sections, checks for forbidden elements (`<header>`, `table-wrap`), verifies required components (score diagram, data notice, footer, powered-by, ribbon), and counts DOI links if literature tables are involved.

## Canonical references

- `/tmp/shaima_report.html` — the original Shaima report defining this format
- `/tmp/hemal_shaima_format.html` — a restructured Hemal report in Shaima format (reference for adaptation patterns)
