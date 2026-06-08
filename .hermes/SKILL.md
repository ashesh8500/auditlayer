---
name: auditlayer
description: Product specs, design systems, and implementation patterns for the AuditLayer social media audit platform. Use when building portal features, designing reports, making product decisions, or understanding the biohacking niche strategy. Load docs/ files for specific domains — product-spec.md for UX/pricing/architecture, audit-methodology.md for the 15-section framework, report-design-system.md for CSS/components, and comparison-frameworks.md for competitive/peer/blueprint comparison structures.
category: auditlayer
triggers:
  - Building or modifying the AuditLayer portal
  - Designing audit reports or report templates
  - Making product decisions for AuditLayer
  - Understanding the biohacking niche strategy
  - Adding comparison sections to audit reports
  - Setting up deployment for the AuditLayer service
  - Working in the auditlayer repository
---

# AuditLayer — Product & Domain Knowledge

## Architecture (v2 — current)

```
Browser → Next.js portal (web/, Vercel)
    → Supabase (Auth, Postgres, Storage, Realtime)
    → Python worker (worker/, long-running) → Hermes Gateway :8642/v1
    → social-media-audit skill → HTML + PDF in Storage
```

Legacy v1 WSGI portal archived in `legacy/`. **Start here for agents:** `docs/agent-handoff.md`.

## Core Documents

- `docs/agent-handoff.md` — Live URLs, quick commands (`make check-v2`, `make worker-run`), file map, open work
- `docs/architecture-contract.md` — Authoritative schema, enums, RLS
- `docs/deployment.md` — Vercel + Supabase + worker env vars
- `docs/product-spec.md` — Product vision, user flow (3-question wizard), pricing ($30/$50/Enterprise), 4-phase roadmap, 9 key product decisions
- `docs/audit-methodology.md` — 15-section framework, research sweep, weighted scoring (8 dimensions), HTML report CSS classes, delivery conventions
- `docs/creator-strategy.md` — 15-question knowledge base: growth signals, algorithmic patterns, audience psychology, trust compounding
- `docs/comparison-frameworks.md` — Competitive/peer/blueprint comparison types, standard section anatomy, tag language per type
- `docs/report-design-system.md` — Design tokens (light theme, teal accent), component library (metric-grid, data-table, sw-card, rec-card, callout, calendar-grid), typography, responsive breakpoints
- `docs/implementation-patterns.md` — GitHub Pages sub-root deployment, git conventions, file delivery patterns, cache invalidation
- `docs/media-manager-wishlist.md` — Narin's feature requests: must-have (one-click audit, peer auto-suggest, beautiful HTML), should-have (comparison view, batch export), nice-to-have (mescreen audit, client portal, DM script generator)

## Key Strategic Decisions (per Narin, May 15 2026)

1. **Three questions, not five** — Handle + Goal + Optional context. Less friction.
2. **Peer auto-suggest, never free-choice** — Users can't pick comparables. System auto-selects 3 same-tier peers. Prevents aspirational-comparison demoralization.
3. **Intake scope** — Broad media/marketing creators (credential gate removed in v2). `needs_review` only when platform is unknown.
4. **Six audit outputs** — Where you're at, What's holding you back, Who's doing it better, What to post next week, When you hit the milestone, The money move.
5. **Milestone computation per tier** — 300→2K, 2K→10K, 10K→20K, 50K→100K, 100K→250K. Never hardcoded.
6. **Content format priority** — Podcasts > Reels > Bite-size paper breakdowns (biohacking space specific).
7. **Competitor moat** — Domain calibration, not technology. Generic tools treat science and fashion accounts the same.

## Design Conventions

- **Light theme** — client-facing, not developer-facing. `--bg: #fafaf9`, teal accent (`#0d9488`)
- **Inter for body, JetBrains Mono for numbers** — no serif, no display fonts
- **Self-contained HTML reports** — all CSS inline, zero external dependencies
- **"Dr Jane Smith" not "Dr. Jane Smith"** — no period after title abbreviations
- **Meeting-ready language** — reports are client deliverables, not chat transcripts

## Report Generation

When generating an audit, load the `social-media-audit` skill (global skill at `~/.hermes/skills/productivity/social-media-audit/`). That skill handles the actual generation pipeline. This skill provides the product context — what the output should look like and what decisions drive the generation.

Save reports: `~/projects/analyses/<subject-slug>-social-media-audit.md`
Deliver via: native media delivery on messaging platforms (never paste local paths)

## Pitfalls

- Never assume competitive framing between accounts — verify relationships first
- Don't suggest product cross-promotion in collaboration comparisons without explicit confirmation
- Always use the report's existing CSS classes when editing — no new styles
- Update `.subtitle` when adding benchmark accounts
- Use Python scripts (not chained sed) for bulk find-and-replace in reports
- Reports use `master` branch, not `main`
