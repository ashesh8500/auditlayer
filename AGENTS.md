# AGENTS.md — AuditLayer

Guidelines for AI agents (Hermes, Claude Code, Codex) working on this repository.

---

## What This Repo Is

AuditLayer is a social media competitive intelligence platform for evidence-based biohacking, health, and wellness creators. It generates deep, structured HTML audit reports calibrated by domain expertise. The product is the report — a beautiful, self-contained HTML file that answers six questions: Where you're at, What's holding you back, Who's doing it better, What to post next week, When you hit the next milestone, The money move.

**Founders:** Ashesh Kaji (tech/infra) + Narin (domain — biohacking, med-tech, wellness, content strategy)

---

## Architecture

```
User Browser
    ↓
Cloudflare Tunnel → Flask/FastAPI portal (~500 lines)
    ↓
API proxy (thin — auth, rate limiting, input validation)
    ↓
Hermes API → social-media-audit skill → HTML report generation
    ↓
Result: self-contained HTML saved to disk, viewer rendered
```

- **Infra:** Single CX22 VM (Hetzner, 100.83.195.75, 2 vCPU/4GB RAM). No database needed initially — reports are static HTML files.
- **Payments:** Stripe Checkout + webhook handler
- **Exposure:** Cloudflare Tunnel (no open ports)
- **Deployment:** Flask/FastAPI behind systemd. Portal code goes in `src/`.

---

## Design Philosophy

1. **Reports are the product.** Every decision serves report quality. The HTML report is what clients pay for — it must look like it came from a research institution.
2. **Domain calibration over generic analytics.** The technology isn't the differentiator. Narin's knowledge of biohacking benchmarks, audience psychology, and content formats is.
3. **Three screens max.** Handle input → goal selection → beautiful report. Not a dashboard, not a platform, not a SaaS app with 14 nav items.
4. **Static over dynamic.** Reports are self-contained HTML files that survive offline, in email, in print.
5. **No signup wall.** First audit is free. Paywall after that. Let the report sell itself.

---

## Key Conventions

### Docs-first development
All product decisions, methodologies, design systems, and implementation patterns are documented in `docs/` before code is written. Read `docs/` before coding. Update docs when decisions change.

### Design system
- Light theme (not dark Hermes theme — client-facing, not dev-facing)
- Teal accent (`#0d9488`) — scientific/clinical credibility
- Inter for body, JetBrains Mono for numbers
- Zero external dependencies in reports — all CSS inline
- See `docs/report-design-system.md` for full component library and tokens

### Git conventions
- Branch: `master` (not `main`)
- Commit messages: imperative, lowercase, descriptive
- One commit per comparison addition in audit reports
- Repo-local git identity: `git config user.email "ashesh@asheshkaji.com"` / `git config user.name "Ashesh Kaji"`

### The social-media-audit skill
The core engine lives in `~/.hermes/skills/productivity/social-media-audit/`. This repo documents the product layer — what the skill should produce, how reports should look, and what the UX should be. Don't modify the skill from this repo; modify the docs to reflect desired behavior and the skill gets updated separately.

### Report delivery
- When sending reports via messaging platforms, use native media delivery (never paste local filesystem paths)
- Check session context for the correct target (group vs. DM)
- See `docs/implementation-patterns.md` for delivery patterns

---

## File Map

| Location | Purpose |
|---|---|
| `docs/product-spec.md` | Product vision, user flow, pricing, architecture, roadmap, decisions |
| `docs/audit-methodology.md` | 15-section framework, research sweep, scoring, delivery |
| `docs/creator-strategy.md` | 15-question creator growth knowledge base |
| `docs/comparison-frameworks.md` | Competitive/peer/blueprint comparison structures |
| `docs/report-design-system.md` | CSS tokens, component library, typography, print styles |
| `docs/implementation-patterns.md` | Deployment, git ops, cache invalidation, server infra |
| `docs/media-manager-wishlist.md` | Narin's feature requests and UX priorities |
| `src/` | Application code (portal, API proxy) |
| `templates/` | HTML templates for reports and portal pages |
| `.hermes/SKILL.md` | Repo-local Hermes skill |

---

## Agent-Specific Notes

### When generating audit reports
- Load the `social-media-audit` skill — it has the 15-section framework, CSS patterns, delivery conventions
- Save reports to `~/projects/analyses/<subject-slug>-social-media-audit.md`
- Deliver via native media delivery, not local paths

### When editing existing reports
- Use the report's existing CSS classes — never introduce new styles
- Always update the `.subtitle` to include new benchmark handles
- Use Python scripts (not chained sed) for bulk find-and-replace
- Commit after each comparison addition

### When building portal features
- Light theme only — this is client-facing, not developer-facing
- Three screens max — no feature creep
- The guided question flow is sacrosanct — don't add steps to the wizard
