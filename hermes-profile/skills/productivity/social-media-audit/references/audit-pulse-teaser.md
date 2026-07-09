# AuditLayer Pulse — Agency Teaser Artifact

## What it is

A 4-section lead-gen artifact appended to the bottom of a full audit report. Designed for Narin to hand to agencies and media contractors in meetings — it turns "that's interesting" into "can you do this for my clients?"

**Not a trimmed-down version of the full report.** It's a different artifact — a provocation, not an answer. The goal is creating the curiosity gap: "what else am I missing about my own account?"

## When to use

When Narin asks to:
- Add a "short audit" or "teaser" section below an existing report
- Create a "quick audit" for agency pitches
- Append a "Pulse" to a full report
- Show what AuditLayer could surface in ~90 seconds from a single handle

## Psychology

Agencies spend all day optimizing *other people's* accounts. They almost never look at their own. The Pulse is a mirror — it makes them go "wait, what else don't I know about my own account?" That gap leads to "can you do this for my clients too?"

## 4-Section Structure

### Section 1: The Scorecard
Big composite score (0-100) with 3 sub-bar breakdowns. People react viscerally to scores — agencies especially, since they benchmark everything. Use data already in the report (do NOT re-research). Repackage the existing Performance Score into the Pulse's 3-dimension format: pick the 3 dimensions from the report that tell the clearest story.

Format:
```
Pulse Score: 40/100

Content Quality     ████████░░  72  ← above creator avg
Consistency/Cadence ██░░░░░░░░  19  ← critical gap
Platform Footprint  █░░░░░░░░░  12  ← needs attention
```

Always include a 1-sentence "What this means" interpretation below the bars.

### Section 2: One Thing You Didn't Know
One specific, counterintuitive data point. The goal is surprise, not completeness. Pull from the report's Strengths/Weaknesses, Peer Comparison, or Root Cause sections. Frame it as a gap they didn't see.

Strong patterns (pick one):
- Authority-to-audience ratio gap (credentials vs. follower count vs. peers)
- Content format mismatch (most posts are format X, but format Y drives the engagement)
- Promotional ratio suppressing reach (60%+ promo → algorithm throttling)
- Silent audience segment they don't speak to (demographic engaging 2x average but never targeted)

Include a "Surprise insight" callout box with a concrete, fixable finding.

### Section 3: The Growth Lever
One concrete, actionable recommendation with quantified projections. This proves AuditLayer doesn't just describe — it *prescribes*. Pull from the report's High-Impact Recommendations or Engagement Growth Strategy sections.

Format: 3 metric cards (Reach Lift, Follower Growth, Revenue Impact) with projected numbers. Always include a "Why this lever" explanation grounding the numbers in the report's data.

### Section 4: The Horizon
Subtle CTA that expands the frame from "my account" to "all my clients' accounts." List what the full 15-section report covers (competitor benchmarking, audience psychology, viral playbook, 30-day strategy, monetization mapping). End with the agency use case: "Agencies typically run it on their own account first, then roll it into client retainers."

## Design Rules

- Append below a dashed divider (`border-top: 2px dashed`) after the report footer
- Match the report's existing CSS variables and design tokens (don't introduce new colors)
- Visually distinct — the Pulse should feel like a "bonus section," not part of the main report
- Purple-badge header: "AuditLayer Pulse Preview"
- Subtitle: "The 90-second snapshot you hand to an agency."
- Section headers use the report's accent/green colors (accent for insight, green for growth lever)
- Include a small "AuditLayer Pulse · Generated in ~90 seconds · AuditLayer" footer
- Single page, scroll-friendly. Should work as screen share AND PDF export.

## Generation Workflow

1. Read the full report to extract data points (no new research needed)
2. Identify the strongest "surprise" from the report's data
3. Pick the single highest-leverage recommendation with quantifiable projections
4. Write the 4 sections using `patch()` to append before `</body>`
5. Verify rendering with `browser_navigate` + scroll to bottom

## Working Example

See `~/projects/auditlayer-app/audits/hemal-pulse-preview.html` for a complete Pulse appended to a real 15-section audit report. The Pulse sits after a dashed divider, below the report's "Audit prepared by" footer. Use this file as a visual reference when building new Pulses.

## Horizon Closing Line

The strongest closing line tested: *"The sell isn't the report — it's the 90-second teaser that makes them ask 'what else am I missing?'"* This reframes the entire artifact from a free sample to a strategic wedge. End every Horizon section with this line or a close variant.

## Pitfalls

- **No new research.** The Pulse repackages existing report data. Don't run new platform queries.
- **Don't make up numbers.** All projections must be defensible from the report's data. "3-5x reach" must be grounded in the report's peer benchmarks or platform norms documented elsewhere.
- **Don't over-explain.** The Pulse is a teaser, not a treatise. Each section should fit in a single card with minimal prose.
- **The Horizon is not a sales pitch.** No pricing, no features list, no "sign up now." Just: "here's what the full report covers" + the agency use case. The content does the selling.
- **Match the report's theme.** If the report is dark (GitHub-style), the Pulse inherits those CSS variables. Don't introduce a light theme.
- **Telegram file delivery shows raw HTML source, not rendered pages.** When Narin asks to "see" the Pulse appended to a report, sending the HTML file via MEDIA won't render it — she'll see raw markup. Instead: (a) open the file with `browser_navigate`, scroll to the Pulse section with `browser_console`, then take a screenshot; (b) crop the screenshot to fit Telegram's photo dimension limits (max ~2560px in either dimension, 1200×2000 is safe). Use `convert -crop` (ImageMagick) to slice tall pages and `-quality 85` JPEG for small file size.
