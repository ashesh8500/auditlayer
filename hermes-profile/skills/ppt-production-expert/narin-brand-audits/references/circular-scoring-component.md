# Circular Score Rings Component

Narin's preferred scoring visualization for AuditLayer reports (June 2026). Replaces the horizontal bar score diagram. Uses SVG donut rings — 6 dimension rings in a 3×2 grid plus a larger overall score ring below.

When Narin says "make the scoring circular" or "use circles instead of bars," use this component.

## CSS (inject into report `<style>` block, replacing any horizontal-bar score diagram CSS)

```css
/* Circular Score Rings */
.score-circles {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 32px 28px 24px; margin-bottom: 48px; text-align: center;
}
.score-circles .section-label {
  font-size: 0.68rem; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.1em; color: var(--muted); margin-bottom: 24px; display: block;
}
.circle-grid {
  display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px;
  max-width: 600px; margin: 0 auto 32px;
}
.circle-card { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.circle-card svg { width: 100px; height: 100px; }
.circle-value {
  font-family: 'JetBrains Mono', monospace; font-size: 1.3rem; font-weight: 600;
  color: var(--text); line-height: 1; margin-top: -62px; position: relative; z-index: 2;
}
.circle-label {
  font-size: 0.68rem; font-weight: 600; text-transform: uppercase;
  letter-spacing: 0.06em; color: var(--muted); text-align: center; line-height: 1.3; max-width: 100px;
}
.overall-ring-wrap {
  display: flex; flex-direction: column; align-items: center;
  padding-top: 8px; border-top: 1px solid var(--line);
}
.overall-ring-wrap svg { width: 130px; height: 130px; }
.overall-value {
  font-family: 'JetBrains Mono', monospace; font-size: 2.2rem; font-weight: 700;
  color: var(--text); line-height: 1; margin-top: -82px; position: relative; z-index: 2;
}
.overall-label {
  font-size: 0.75rem; font-weight: 500; color: var(--muted);
  text-transform: uppercase; letter-spacing: 0.1em; margin-top: 2px;
}
@media (max-width: 600px) {
  .circle-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
  .circle-card svg { width: 85px; height: 85px; }
  .circle-value { font-size: 1.1rem; margin-top: -52px; }
}
```

## HTML — Section 1 replacement

```html
<section>
  <h2>1. Overall Score <span>— XX/100</span></h2>
  <p class="s-intro">[One-paragraph diagnosis]</p>

  <div class="score-circles">
    <span class="section-label">Performance Rings</span>
    <div class="circle-grid">
      <div class="circle-card">
        <svg viewBox="0 0 120 120">
          <circle cx="60" cy="60" r="48" fill="none" stroke="#e7e5e4" stroke-width="7"/>
          <circle cx="60" cy="60" r="48" fill="none" stroke="COLOR" stroke-width="7"
            stroke-dasharray="302" stroke-dashoffset="OFFSET" stroke-linecap="round"
            transform="rotate(-90 60 60)"/>
        </svg>
        <div class="circle-value">SCORE</div>
        <div class="circle-label">LABEL</div>
      </div>
      <!-- Repeat 5 more times for 6 dimensions -->
    </div>
    <div class="overall-ring-wrap">
      <svg viewBox="0 0 160 160">
        <circle cx="80" cy="80" r="68" fill="none" stroke="#e7e5e4" stroke-width="10"/>
        <circle cx="80" cy="80" r="68" fill="none" stroke="COLOR" stroke-width="10"
          stroke-dasharray="427" stroke-dashoffset="OFFSET" stroke-linecap="round"
          transform="rotate(-90 80 80)"/>
      </svg>
      <div class="overall-value">XX</div>
      <div class="overall-label">/ 100</div>
    </div>
  </div>

  <div class="callout accent">[Diagnosis callout]</div>
</section>
```

## SVG Ring Math

- **Dimension rings** (r=48): circumference = 2π × 48 = 301.6 → use `stroke-dasharray="302"`
- **Overall ring** (r=68): circumference = 2π × 68 = 427.3 → use `stroke-dasharray="427"`
- **stroke-dashoffset** = circumference × (1 − score/100)

Examples for dimension rings (circumference=302):
| Score | Offset |
|-------|--------|
| 65    | 106    |
| 40    | 181    |
| 35    | 196    |
| 25    | 227    |
| 20    | 242    |
| 15    | 257    |

## Color Thresholds (same as horizontal bars)

- **Green** `#059669`: score ≥ 65 (class: the account is doing this well)
- **Amber** `#d97706`: score 35–64 (needs work)
- **Red** `#dc2626`: score < 35 (critical gap)

## Dimension Labels by Account Type

**Brand accounts:** Brand Identity, Content Cadence, Format Diversity, Community, Growth Velocity, Product-Market Fit

**Founder accounts:** Founder Authority, Personal Brand, Storytelling, Content Cadence, Community Building, Growth Strategy

**Academic accounts:** Scientific Authority, Research Translation, Format Diversity, Community Quality, Growth Velocity, Platform Optimization

## Div Balance Verification

After building the report, verify `<div`/`</div>` count matches:

```python
opens = html.count('<div'); closes = html.count('</div>')
assert opens == closes, f'div mismatch: {opens} opens, {closes} closes'
```

## Canonical Reference

Live example: `/tmp/narin-pages/projects/auditlayer-scorecard.html` — the first report using circular scoring (June 2026).
