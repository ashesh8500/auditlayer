# Profile: report-narin-fidelity (worker report generation)

Load ONLY this + core.py/generation.py/master-skeleton.html (scoped, offset reads).
Reference: worker/templates/narin_reference_template.html (332 lines, canonical Hemal format).
Source of section rules: ~/.hermes/skills/software-development/auditlayer-report-editing/SKILL.md

## STANDARD = 15 sections, EXACT headings, in order
1 Executive Summary        → score-diagram (Overall NN/100 + sd-row high/mid/low) + accent callout
2 Key Metrics              → metric-grid 4-card + data-table Metric|Value|Status(dot green/amber/red) + accent callout. Connected IG inserted locally.
3 Strengths                → sw-grid, 6 cards, .sw-card.strength left-border 3px green
4 Weaknesses               → sw-grid, .sw-card.weakness left-border 3px red, critical first
5 Root Cause Analysis      → data-table + warning callout
6 Peer Comparison          → data-table. RULE: peers ALWAYS higher followers, same niche, real handles + callout
7 Content Format Analysis  → format × signal × current × recommended table
8 Engagement Growth Strategy → rec-card numbered circle (left18 top20 30px accent-muted radius6, padding-left60)
9 Content Calendar & Creative Board → 10 idea-card across 4 pillars (Educational 3, Portfolio 2, Community 3, Growth 2) + weekly rhythm calendar-grid (100|80|160|1fr)
10 Quick Wins — This Week  → timeline-item, t-dot accent
11 Success Benchmarks      → 3 grouped tables Metric|Now|30 Days|90 Days|Priority. Priority = colored text: Critical(red 600)/Build habit(amber)/Organic(green). NO dots on targets.
12 Audience Profile        → segment table
13 Road to [Milestone]     → 3-phase timeline-item + summary table + callout (heading uses real milestone)
14 Audit Cadence           → Weekly→Monthly→Quarterly→Post-Viral table + callout
15 Get the Execution Plan  → Standard $30 vs Extended $50 check-table + encouragement + CTA "Upgrade to Extended — $50/month"
Footer: minimal centered [ALM badge] AuditLayerMedia · @auditlayermedia · Follow tips → (border-top).
Top: brand ribbon teal gradient in-flow (shadow-DOM safe) + SVG watermark fallback on body.

PULSE=3 (Score Breakdown, Key Gaps, Three Immediate Moves). EXTENDED/BLUEPRINT keep, align first 15.

## Safety (KEEP — do not remove)
nonfinite float reject (_instagram_metric_block), duplicate-key reject, unsafe HTML via _ReportSectionParser allowlist, html_lib.escape all values, model returns JSON only (no raw HTML), tables ≤12 rows, items ≤5.

## PROMPT_VERSION
Bump 0.9 → 1.0 on this change. Add changelog line. Update _verify_s06.py + test_prompt_version.py expected string.

## Verify
cd worker && uv run pytest tests/test_template_pipeline.py tests/test_prompt_version.py -q
uv run python -m auditlayer_worker demo --handle test --generator mock  → grep -c '<h2>' == 15, no 'OUTPUT TRUNCATED'
