# Hemal Scorecard — Refined Section Structure (May 2026)

This is the post-refinement 14-section structure applied to `hemalpatelphd-scorecard.html`. Use as the template for future Research Translation Scorecard reports. One slot remains for a 15th section (candidate: Monetization Map).

## Sections (in order)

**— Diagnosis block** — Teal callout right after score diagram. One paragraph: "what does 34/100 mean?" Template:
```html
<div class="callout" style="background: var(--accent-muted); border-left: 3px solid var(--accent); margin-bottom: 48px;">
  <p style="font-size: 1.05rem; color: #0f766e; margin: 0; font-weight: 600;">
    🔍 <strong>Diagnosis:</strong> [one-sentence takeaway with key stats]
  </p>
</div>
```

1. **1. The Investigator** — Credentials, publications, career arc. Core question callout at bottom.

2. **2. The Moat** — 5-row table: NASA Twins Study, Research→Product Loop, 20-Year NIH/VA Funding, Joe Dispenza Collabs, 186 Publications. Columns: Asset / What It Is / Why It's a Moat / On the Feed? (tag: No / Partially / Near zero). Closes with moat callout: "20-year head start, feed is acting like day one."

3. **3. Account Profile — By the Numbers** — 4-card metric grid + benchmarked data table. Zero analysis — data only.

4. **4. What Translates Well** — 4 strength cards in `sw-grid` (`.strength` left-border, green).

5. **5. The Translation Gap — 6 Ways the Signal Drops** — 6 weakness cards in `sw-grid` (`.weakness` left-border, red). Analysis lives here.

6. **6. Publication Portfolio vs. Content Feed** — Comparison table: lab output vs. feed output.

7. **7. Peer Review** — 3 comparable PhD creators. Full table: followers, niche, engagement rate, formats, cadence, promo ratio, stories, save content, collabs.

8. **8. The Audience** — Three subsections, each with `data-table`:
   - *Current Audience Composition* (5 segments, ~share, what they engage with, retention risk)
   - *The Audience Problem in Two Numbers* (engagement math + following ratio)
   - *Who Should Be Following But Isn't* (4 prospective segments with current penetration)
   Closes with callout: growth ceiling isn't 20K — it's 50K+.

9. **9. The Engagement Assay** — 4 weighted signals table with current readings vs. peer averages.

10. **10. Protocol Optimization** — Target metric + 5 numbered `rec-card` recommendations. Weekly lab schedule `.calendar-grid`.

11. **11. Immediate Actions** — 5 timeline items (`.t-dot accent`), each concrete, each under an hour.

12. **12. Clinical Trial Milestones — 90-Day Protocol** — Three phases (Baseline 1-30, Escalation 31-60, Compound 61-90) with targets, actions, endpoints. Summary table.

13. **13. Scorecard Milestones** — 6-row metrics table: current → 30-day → 90-day.

14. **14. Re-Assessment Cadence** — Monthly / quarterly / event-triggered. Next reassessment date.

**— AuditLayer Footer Badge** — Teal badge + URL + date. See SKILL.md for HTML template.

## Moat Section HTML Pattern

```html
<table class="data-table">
  <thead>
    <tr><th>Asset</th><th>What It Is</th><th>Why It's a Moat</th><th>On the Feed?</th></tr>
  </thead>
  <tbody>
    <tr>
      <td><strong>[Asset Name]</strong></td>
      <td>[Description with <em>publication</em> detail if applicable]</td>
      <td>[Why competitors can't replicate this]</td>
      <td><span class="tag weakness">No</span> [or neutral/strength]</td>
    </tr>
    <!-- 4 more rows -->
  </tbody>
</table>
<div class="callout">
  <p>🏰 <strong>The moat in one sentence:</strong> [single-line diagnosis]</p>
</div>
```

5 assets minimum. The "On the Feed?" column uses `.tag` classes (weakness=red, neutral=amber/blue, strength=green). Every asset should have a reason it's structural (can't be built by a competitor in <5 years).

## Audience Section HTML Pattern

Three subsections, each with a `data-table`:

```html
<h3>Current Audience Composition (Estimated)</h3>
<table class="data-table">
  <thead><tr><th>Segment</th><th>~Share</th><th>What They Engage With</th><th>Retention Risk</th></tr></thead>
  <tbody>
    <!-- 5 rows, .tag for risk level -->
  </tbody>
</table>

<h3>The Audience Problem in Two Numbers</h3>
<p><strong>[Metric 1].</strong> [Math + implication paragraph]</p>
<p><strong>[Metric 2].</strong> [Math + implication paragraph]</p>

<h3>Who <em>Should</em> Be Following (But Isn't)</h3>
<table class="data-table">
  <thead><tr><th>Prospective Segment</th><th>Why They'd Follow</th><th>Content That Reaches Them</th><th>Current Penetration</th></tr></thead>
  <tbody>
    <!-- 4 rows, .tag weakness on current penetration -->
  </tbody>
</table>
<div class="callout">
  <p>👥 <strong>The audience diagnosis:</strong> [single-line takeaway + ceiling estimate]</p>
</div>
```

## What changed from the original

| Before (v1) | After (v2) |
|---|---|
| Diagnosis buried at bottom of section 5 | Diagnosis at top, right after score diagram |
| Section 2: "The Translation Gap — Bench → Feed" | Section 3: "Account Profile — By the Numbers" |
| Section 4: "What Doesn't Translate — Where the Signal Drops" | Section 5: "The Translation Gap — 6 Ways the Signal Drops" |
| No Moat section | Section 2: "The Moat" — 5 structural advantages |
| No Audience section | Section 8: "The Audience" — who's following, who should be |
| No AuditLayer branding in footer | AuditLayer badge + URL |
| 12 sections | 14 sections (one slot to 15)
