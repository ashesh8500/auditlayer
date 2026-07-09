# AuditLayer Standard Report Compliance Notes

Use when generating older canonical/Hemal-style standard AuditLayer 15-section HTML reports for Narin's portfolio or the AuditLayer worker pipeline.

> **Variant note:** If the user asks for the @shaimastrategist/Shaima structure or says "restructure like the one we created for @shaimastrategist," use `references/shaima-style-standard-report.md` instead. Do not enforce this file's bans on `.score-diagram`, `.callout.accent`, `.callout.warning`, Google Fonts, or post-Section-15 footer content for Shaima-style reports. The two formats have different section headings, CSS classes, and structural requirements.

## Strict Section Structure
- The report MUST contain exactly 15 `<h2>` headings matching the user-provided list character-for-character.
- Do NOT rename, rephrase, or merge section headings. "Executive Summary" stays "Executive Summary" (not "Overall Score"). "Footer" stays "Footer" (not "What Comes Next" or "Report Notes"). "Powered by AuditLayerMedia" stays exactly that.
- "Powered by AuditLayerMedia" MUST be the final `<h2>` section (Section 15). No content after it.
- Do NOT place a separate HTML `<footer>` element after Section 15. If footer content is needed, include `.report-footer` inside Section 14 ("Footer").

## Canonical CSS
- Copy the `<style>...</style>` block from `social-media-audit/references/hemal-report-format.html` byte-for-byte. Do NOT modify, minify, or rewrite.
- Do NOT add external assets: no Google Fonts `<link>`, no CDN references, no external images.
- Only use CSS classes that exist in the canonical Hemal CSS. The canonical block (8534 chars as of July 2026) contains these classes: `.container`, `.report-header`, `.label`, `.subtitle`, `.meta`, `.metric-grid`, `.metric-card`, `.value`, `.data-table`, `.num`, `.highlight`, `.tag`, `.sw-grid`, `.sw-card`, `.sw-label`, `.rec-card`, `.calendar-grid`, `.ch`, `.cr`, `.timeline-item`, `.t-dot`, `.t-content`, `.callout`, `.report-footer`, `.powered-by`, `.alm-badge`, `.handle`. Classes like `.score-diagram`, `.upgrade-box`, `.idea-card`, `.callout.accent`, `.callout.warning` do NOT exist in the canonical CSS and must not be used unless the user explicitly authorizes custom CSS.
- Before delivery, compare the report's `<style>` block character-for-character against the canonical block.

## Data-Limited Instagram Audits
- If Instagram OAuth is not connected and public/indexed data returns nothing, mark ALL live metrics as "Unavailable." Do NOT fabricate follower counts, engagement rates, average likes/comments, post counts, or scores.
- Category-level industry benchmarks MAY be included, but MUST be clearly labeled as benchmarks ("UGC Creator Benchmark," "Category Reference"), NOT as measured account performance.
- Diagnostic hypotheses based on creator archetypes (e.g., "confident UGC creators often over-index on portfolio content") MUST be qualified with hedging language: "likely," "common pattern in this archetype," "verify after OAuth." Never state archetype-based diagnostics as observed fact.
- Do NOT assign real same-tier peers when the follower tier is unknown. Use clearly labeled benchmark archetypes ("Archetype A: Category Specialist") only as an interim reference, and state explicitly that verified same-tier peers require OAuth/live follower count.
- Score deferral: do not assign a numeric `/100` score when metrics are unavailable. A qualitative score may be offered with a "Data-Limited" qualifier, but no score should appear in an `<h2>` heading.

## Account Type Calibration
- Detect account type on first research pass: personal brand vs business.
- Personal brands (creator, influencer, founder, professional, public figure): judge on trust, authority, storytelling coherence, proof of competence, audience connection, and buyer psychology.
- Business accounts (brand, company, product, e-commerce): judge on product visibility, conversion architecture, content-to-commerce funnel, brand consistency, and commerce friction.
- Never apply business-account metrics to a personal brand or vice versa. Calibrate peer selection, scoring weights, and all recommendations to the detected type.

## Required AuditLayer Elements
### Six Product Questions (must appear in Root Cause Analysis or equivalent section)
1. Where is this account right now?
2. What is holding it back?
3. Who is it actually for?
4. What should change first?
5. What does success look like?
6. What is the path to the next milestone?

### Milestones
- MUST be computed from verified follower tier. Never hardcode a universal target.
- If follower count is unavailable, include a tier-to-milestone table and defer the exact milestone.

### Following Ratio Rationale (if recommending reduction)
- (a) Algorithmic trust signal: Instagram's low-trust classifier triggers above ~5% following-to-follower ratio for accounts under 50K, capping initial test-audience reach on every post.
- (b) Brand perception: high following counts read as inauthentic to collaborators, brands vetting partnerships, and followers.
- (c) Method: use Instagram's "Least Interacted With" sort in the following list to unfollow down to ~3% of follower count.

### Powered by AuditLayerMedia Badge
- Section 15 MUST include the `.powered-by` div with `.alm-badge` (black #1c1917 background, white "ALM" text), the text "Powered by AuditLayerMedia", and the inline IG camera SVG with `@auditlayermedia` handle.
- The handle with SVG must be INSIDE the `.powered-by` div using `.handle` class.

### Execution Plan Disclaimer
- A disclaimer stating "This is an execution plan — a strategy document built from research and data. You still need a media team..." must appear in Section 14 (Footer).

## Validation Checklist (before delivery)
- [ ] Exactly 15 `<h2>` headings matching required strings exactly
- [ ] Canonical CSS block matches reference byte-for-byte
- [ ] No external assets (no `<link>` tags, no CDN URLs, no external images)
- [ ] No CSS classes beyond the canonical set
- [ ] No fabricated live metrics — all unavailable marked as "Unavailable"
- [ ] Benchmarks and archetype diagnostics clearly labeled as such
- [ ] Six product questions present and answered
- [ ] Milestone deferred or computed from actual tier
- [ ] "Powered by AuditLayerMedia" is the final `<h2>` section
- [ ] "Footer" is Section 14
- [ ] IG camera SVG present in `.powered-by` div
- [ ] `@auditlayermedia` handle present
- [ ] Execution-plan disclaimer present in Footer
- [ ] Data quality limitation flagged prominently
- [ ] Account type (personal brand vs business) stated and calibration confirmed
