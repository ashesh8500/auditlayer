# Report Design System

Visual conventions, CSS tokens, and HTML component patterns for social media audit reports. These conventions have been refined across multiple client deliveries and produce reports that are readable, scannable, and meeting-ready.

---

## Design Principles

1. **Computer Modern aesthetic** — clean, academic, serious. The report should look like it came from a research institution, not a marketing agency.
2. **Single accent color** — teal (`#0d9488`) for scientific/clinical credibility. No decoration, no gradients, no shadows heavier than `--shadow`.
3. **Inter for body, JetBrains Mono for numbers** — one sans-serif family varied by weight. No serif, no display fonts, no handwriting.
4. **Zero external dependencies** — self-contained HTML, all CSS inline, all data embedded. Reports survive offline, in email attachments, and in print.

---

## Design Tokens

```css
:root {
  /* Colors */
  --bg: #fafaf9;            /* Page background */
  --surface: #ffffff;       /* Card surfaces */
  --text: #1c1917;          /* Primary text */
  --muted: #78716c;         /* Secondary text, labels */
  --line: #e7e5e4;          /* Borders, dividers */
  --accent: #0d9488;        /* Primary accent (teal) */
  --accent-muted: #f0fdfa;  /* Accent background */

  /* Semantic colors */
  --green: #059669;         /* Strengths, positive */
  --amber: #d97706;         /* Warnings, medium severity */
  --red: #dc2626;           /* Weaknesses, negative */
  --blue: #2563eb;          /* Info, callouts */

  /* Semantic backgrounds */
  --green-muted: #ecfdf5;
  --red-muted: #fef2f2;
  --amber-muted: #fffbeb;
  --blue-muted: #eff6ff;

  /* Spacing & shape */
  --radius-sm: 6px;
  --radius: 10px;
  --radius-lg: 16px;

  /* Shadows (subtle — no dramatic shadows) */
  --shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.06), 0 2px 4px rgba(0,0,0,0.04);
  --shadow-lg: 0 12px 32px rgba(0,0,0,0.08), 0 4px 8px rgba(0,0,0,0.04);
}
```

### Typography Scale
```css
body {
  font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  font-size: 16px;    /* base */
  line-height: 1.625;
  -webkit-font-smoothing: antialiased;
}

/* Report header */
.report-header h1   { font-size: 2.1rem; font-weight: 700; letter-spacing: -0.02em; }
.report-header .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; }

/* Section headings */
section h2          { font-size: 1.35rem; font-weight: 700; }
section h3          { font-size: 1.05rem; font-weight: 600; }
section p           { font-size: 0.95rem; }

/* Monospace (numbers, data, code) */
font-family: 'JetBrains Mono', monospace;
font-size: variables between 0.85rem and 1.6rem depending on context
```

---

## Component Library

### Page Shell

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Social Media Audit — @handle</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
  <style>/* all CSS inline */</style>
</head>
<body>
  <div class="container">
    <!-- report content -->
  </div>
</body>
</html>
```

Container: `max-width: 760px`, centered, `padding: 60px 28px 120px`.

### Report Header

```html
<header class="report-header">
  <div class="label">Instagram Account Audit</div>
  <h1>@handle</h1>
  <div class="subtitle">Full name — Credentials · Benchmarked against @comp1 & @comp2</div>
  <div class="meta">
    <span>📅 Month YYYY</span>
    <span>📊 Data: sources</span>
    <span>⏱ Analysis period: N days</span>
  </div>
</header>
```

**Rules:**
- `.label`: all-caps, small, accent colored
- `.subtitle`: includes full name, credentials, and benchmarked accounts
- `.meta`: horizontal flex row of metadata pills
- When adding new benchmarks, always update `.subtitle`

### Metric Grid (Key Metrics At-a-Glance)

```html
<div class="metric-grid">
  <div class="metric-card">
    <div class="value">10.7K</div>
    <div class="label">Followers</div>
  </div>
  <div class="metric-card">
    <div class="value green">1.96%</div>
    <div class="label">Engagement Rate</div>
  </div>
  <div class="metric-card">
    <div class="value amber">178</div>
    <div class="label">Avg Likes/Post</div>
  </div>
  <div class="metric-card">
    <div class="value red">0</div>
    <div class="label">Reels Posted</div>
  </div>
</div>
```

**Rules:**
- 4-column grid (collapses to 2-column on mobile)
- `.value`: JetBrains Mono, large (1.6rem)
- Color classes: `.green` (good), `.amber` (warning), `.red` (problem), no class (neutral)
- `.label`: all-caps, muted, small

### Data Table

```html
<table class="data-table">
  <thead>
    <tr><th>Column</th><th>Column</th><th>Column</th></tr>
  </thead>
  <tbody>
    <tr>
      <td>Row label</td>
      <td class="num">123,456</td>
      <td>Description</td>
    </tr>
    <tr class="highlight">
      <td>Highlighted row</td>
      <td class="num" style="color:var(--green)">+45%</td>
      <td>Key insight</td>
    </tr>
  </tbody>
</table>
```

**Rules:**
- Header: all-caps, 0.72rem, muted
- `.num`: right-aligned, JetBrains Mono, for numeric cells
- `.highlight`: accent-muted background for key rows
- Use inline styles for cell-level color on specific values (e.g., `style="color:var(--green)"`)

### Tag Badges

```html
<span class="tag strength">Positive</span>
<span class="tag weakness">Negative</span>
<span class="tag neutral">Informational</span>
```

Variants:
- `.strength`: green text on green-muted background
- `.weakness`: red text on red-muted background
- `.neutral`: blue text on blue-muted background

### Strength / Weakness Cards

```html
<div class="sw-grid">
  <div class="sw-card strength">
    <div class="sw-label">Strength 1</div>
    <h4>Card Title</h4>
    <p>Card description. Keep to 2-3 sentences.</p>
  </div>
  <div class="sw-card weakness">
    <div class="sw-label">Weakness 1</div>
    <h4>Card Title</h4>
    <p>Card description.</p>
  </div>
</div>
```

**Rules:**
- 2-column grid (collapses to 1-column on mobile)
- `.strength`: green left border
- `.weakness`: red left border
- `.sw-label`: all-caps, tiny (0.68rem), color matches border
- Also usable for "Do This / Avoid This" pairs — use `.strength` for "Do This" and `.weakness` for "Avoid This"

### Recommendation Cards

```html
<div class="rec-card">
  <div class="num">1</div>
  <h4>Recommendation Title</h4>
  <p>Detailed explanation. Can include inline emphasis, lists, and formatting.</p>
</div>
```

**Rules:**
- Left-padded with a numbered accent badge (absolute-positioned)
- Accent-colored background on the number badge
- Use for all numbered recommendations, content format descriptions, and step-by-step guides

### Callout Box

```html
<div class="callout">
  <p>💡 <strong>Core insight:</strong> One-sentence key takeaway that reframes the data.</p>
</div>
```

**Rules:**
- Blue left-border, blue-muted background
- Single paragraph, bold lead-in
- Use for: core insights, key findings, structural observations, synthesis statements
- Never stack more than 2 callouts in a section

### Content Calendar Grid

```html
<div class="calendar-grid">
  <div class="ch">Day</div><div class="ch">Format</div><div class="ch">Pillar</div><div class="ch">Example</div>
  <div class="cr"><strong>Mon</strong></div><div class="cr">Carousel</div><div class="cr">Pillar Name</div><div class="cr">Example content description</div>
  <!-- repeat for each day -->
</div>
```

**Rules:**
- 4-column grid: Day | Format | Content Pillar | Example
- `.ch`: header cells (bold, all-caps, muted)
- `.cr`: row cells
- Use for weekly content calendars and 30-day plans

### Timeline Items

```html
<div class="timeline-item">
  <div class="t-dot accent"></div>
  <div class="t-content">
    <h4>Timeline item title</h4>
    <p>Description text.</p>
  </div>
</div>
```

**Rules:**
- Flex row: colored dot + content
- Dot variants: `.green`, `.red`, `.accent`
- Use for: quick wins lists, week-by-week plans, milestone tracking

---

## Responsive Breakpoints

```css
@media (max-width: 680px) {
  .container           { padding: 32px 16px 80px; }
  .report-header h1    { font-size: 1.6rem; }
  .metric-grid         { grid-template-columns: repeat(2, 1fr); }
  .sw-grid             { grid-template-columns: 1fr; }
  .calendar-grid       { grid-template-columns: 80px 60px 120px 1fr; font-size: 0.78rem; }
}
```

---

## Print Styles

```css
@media print {
  body         { background: white; }
  .container   { max-width: 100%; padding: 20px 0; }
  .sw-card, .rec-card, .metric-card { break-inside: avoid; }
  section      { break-inside: avoid; }
}
```

---

## Writing Style Conventions

1. **"Dr Jane Smith" not "Dr. Jane Smith"** — no period after title abbreviations. This applies to all report text, tables, headings, and comparison content.

2. **Meeting-ready language** — reports are client deliverables. No internet slang, no overly casual framing, no conversational asides. The report is a professional document, not a chat transcript.

3. **Lead with findings** — start each section with the conclusion, then support it. Busy clients read headings and first sentences.

4. **Numbers have context** — never present a metric without a benchmark, a comparison, or a "why this matters" sentence.

5. **Actionable specificity** — recommendations include format, frequency, and a concrete example. "Post more Reels" → "Post 3 Reels/week using the One Thing Explainer format: hook in first 2s, one concept, B-roll, CTA."

6. **Score with humility** — explain the scoring methodology. Acknowledge that scores are directional, not absolute. Cite data sources.

---

## Section Ordering Convention

1. Header
2. Executive Summary
3. Key Metrics (metric grid)
4. Brand Snapshot (table)
5. Platform-by-Platform Audit
6. Strengths (sw-grid)
7. Weaknesses (sw-grid)
8. Root Cause Analysis (table + callout)
9. Engagement Signal Diagnosis (table)
10. Engagement Growth Strategy (rec-cards, calendar-grid)
11. Content Gaps
12. Audience Psychology
13. Viral Opportunities
14. Monetization Opportunities
15. Performance Score
16. Competitive Context (comparison sections — see comparison-frameworks.md)
17. High-Impact Recommendations (tiered rec-cards)
18. Platform-Specific Improvements
19. 30-Day Optimization Strategy (timeline-items, calendar-grid)
20. Quick Wins (timeline-items)
21. Report Footer

Not every section is required for every audit — adjust based on subject type and scope. But the ordering within included sections should follow this convention.
