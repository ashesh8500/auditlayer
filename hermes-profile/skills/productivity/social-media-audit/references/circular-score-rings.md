# Circular Score Rings (SVG Donut Charts)

When Narin asks for "circular scoring" instead of horizontal bars, use SVG donut rings. The circular format is visually distinctive and reads as more premium than bars.

## When to use
- User explicitly asks for "circular" or "ring" scoring
- The audit is for an account that needs to feel more visual/polished
- The horizontal bar format has been used recently in nearby reports — variety matters

## CSS

```css
.score-circles {
  background: var(--surface); border: 1px solid var(--line);
  border-radius: 12px; padding: 32px 28px 24px; margin-bottom: 48px; text-align: center;
}
.circle-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; max-width: 600px; margin: 0 auto 32px; }
.circle-card { display: flex; flex-direction: column; align-items: center; gap: 4px; }
.circle-card svg { width: 100px; height: 100px; }
.circle-value { font-family: 'JetBrains Mono', monospace; font-size: 1.3rem; font-weight: 600; margin-top: -62px; position: relative; z-index: 2; }
.circle-label { font-size: 0.68rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); text-align: center; max-width: 100px; }
.overall-ring-wrap { display: flex; flex-direction: column; align-items: center; padding-top: 8px; border-top: 1px solid var(--line); }
.overall-ring-wrap svg { width: 130px; height: 130px; }
.overall-value { font-family: 'JetBrains Mono', monospace; font-size: 2.2rem; font-weight: 700; margin-top: -82px; position: relative; z-index: 2; }
.overall-label { font-size: 0.75rem; font-weight: 500; color: var(--muted); text-transform: uppercase; letter-spacing: 0.1em; }
@media (max-width: 600px) {
  .circle-grid { grid-template-columns: repeat(2, 1fr); gap: 14px; }
}
```

## SVG ring formula

Each ring is two `<circle>` elements on the same SVG viewBox — a background ring (stroke="#e7e5e4") and a foreground ring with `stroke-dasharray` + `stroke-dashoffset`.

**Circumference = 2 × π × radius:**
- 6-dimension rings: r=48, circumference ≈ 302
- Overall ring: r=68, circumference ≈ 427

**stroke-dashoffset = circumference × (1 − score/100)**

Color the foreground ring by score threshold:
- green (#059669): 65-100
- amber (#d97706): 35-64
- red (#dc2626): 0-34

```html
<svg viewBox="0 0 120 120">
  <circle cx="60" cy="60" r="48" fill="none" stroke="#e7e5e4" stroke-width="7"/>
  <circle cx="60" cy="60" r="48" fill="none" stroke="#059669" stroke-width="7"
          stroke-dasharray="302" stroke-dashoffset="106" stroke-linecap="round"
          transform="rotate(-90 60 60)"/>
</svg>
```

## Layout

6 dimension rings in a 3×2 grid → separator line → 1 larger overall ring below. The overall ring uses amber at 33/100 — honest scoring that matches the prose.

## Pitfalls

- **Wrong circumference**: Double-check the math — 2πr. If the ring overfills or underfills, the circumference is wrong.
- **Missing rotate(-90)**: Without this transform, the ring starts at 3 o'clock instead of 12 o'clock. Always include `transform="rotate(-90 cx cy)"`.
- **Value positioning**: Use negative margin-top on the value div to overlay it on the SVG ring. The exact value depends on ring size — adjust visually.