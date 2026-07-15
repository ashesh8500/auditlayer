# Score Diagram Component

A compact performance score visualization placed at the top of every audit report, right after the header. Shows 5-6 dimensions as horizontal bars with a total score.

## CSS (inject before `</style>`)

```css
/* Score Diagram */
.score-diagram {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 12px;
  padding: 24px 28px 20px;
  margin-bottom: 48px;
}
.score-diagram .sd-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-bottom: 18px;
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.score-diagram .sd-header .sd-label {
  font-size: 0.68rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.1em;
  color: var(--muted);
}
.score-diagram .sd-header .sd-overall {
  font-family: 'JetBrains Mono', monospace;
  font-size: 1.8rem; font-weight: 600;
  color: var(--text); line-height: 1;
}
.score-diagram .sd-header .sd-overall span {
  font-size: 0.85rem; color: var(--muted); font-weight: 400;
}
.sd-row {
  display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
}
.sd-row .sd-name {
  width: 160px; font-size: 0.8rem; font-weight: 500;
  color: var(--text); text-align: right; flex-shrink: 0;
}
.sd-row .sd-track {
  flex: 1; height: 8px; background: #f0efed;
  border-radius: 4px; overflow: hidden;
}
.sd-row .sd-fill { height: 100%; border-radius: 4px; }
.sd-row .sd-fill.high { background: var(--green); }
.sd-row .sd-fill.mid  { background: var(--amber); }
.sd-row .sd-fill.low  { background: var(--red); }
.sd-row .sd-num {
  width: 28px; font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem; font-weight: 500;
  color: var(--muted); text-align: right; flex-shrink: 0;
}
@media (max-width: 680px) {
  .score-diagram { padding: 18px 16px 16px; }
  .sd-row .sd-name { width: 110px; font-size: 0.72rem; }
}
```

## HTML placement

Insert after `</header>`, before the first `<section>`:

```html
<!-- SCORE DIAGRAM -->
<div class="score-diagram">
  <div class="sd-header">
    <span class="sd-label">Performance Score</span>
    <span class="sd-overall">45<span>&hairsp;/ 100</span></span>
  </div>
  <div class="sd-row">
    <span class="sd-name">Dimension Name</span>
    <div class="sd-track"><div class="sd-fill high" style="width:75%"></div></div>
    <span class="sd-num">75</span>
  </div>
  <!-- repeat for 5-6 dimensions -->
</div>
```

## Scoring thresholds for bar colors

- `high` (green, `var(--green)`): 65-100
- `mid` (amber, `var(--amber)`): 35-64
- `low` (red, `var(--red)`): 0-34

## Dimension naming by account type

**Brand accounts:** Brand Identity, Content Cadence, Format Diversity, Community, Growth Velocity, Product-Market Fit

**Founder accounts:** Founder Authority, Personal Brand, Storytelling, Content Cadence, Community Building, Growth Strategy

**Academic accounts:** Scientific Authority, Research Translation, Format Diversity, Community Quality, Growth Velocity, Platform Optimization

## Overall score

The total score should be unweighted average of dimensions (rounded to whole number). For accounts with strong credentials but weak execution (common pattern), scores typically fall in 34-45 range. Be honest — the diagram makes the same point as the prose: elite substance, weak systems.
