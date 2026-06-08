# Product Specification — AuditLayer

The product spec captures what was validated through the interactive demo and viability planning. This document is the bridge between the static demo at `asheshkaji.com/auditlayer/` and the production implementation.

> **v2 implementation:** Next.js portal in `web/`, Supabase control plane, Python worker in `worker/`.
> Operational handoff: [`agent-handoff.md`](agent-handoff.md). Schema: [`architecture-contract.md`](architecture-contract.md).
> Intake scope broadened beyond PhD/med-only creators; credential gating removed — see `web/src/lib/domain.ts`.

---

## Product Vision

AuditLayer generates deep, structured social media competitive intelligence reports for evidence-based creators in biohacking, health, and wellness. Users enter a handle, answer 3 quick questions, and receive a beautiful downloadable HTML report. No signup wall, no dashboard hell — just the audit. Reports answer six specific questions: (1) Where you're at, (2) What's holding you back, (3) Who's doing it better, (4) What to post next week, (5) When you'll hit the next milestone, (6) The money move.

---

## User Flow (Validated via Interactive Demo)

### Screen 1: Landing
- Hero: value proposition, 3-tier pricing, "Start Free" CTA
- No signup required to see pricing and product description

### Screen 2: Signup / Auth
- Email-link magic auth (Clerk-inspired — no passwords)
- After auth, redirect to Dashboard

### Screen 3: Dashboard
- Report list (date, subject, platform, status)
- "New Audit" button (primary CTA)
- Account management (plan, billing, usage)

### Screen 4: New Audit — Three Questions
3-step flow, one question per screen, minimal friction:

1. **Handle** — "@handle" text input with live platform detection (Instagram, TikTok, YouTube)
2. **Goal** — "What's the goal?" (Growth / Monetization / Rebrand / Launch readiness)
3. **Context** — "Anything else we should know?" (free text, optional)

**Design rationale:** Three questions, not five. The audit engine infers everything else — platform type, depth, competitive context — from the handle and goal. This removes the AI literacy barrier: Narin's network of creators shouldn't need to understand "audit parameters." The fewer the questions, the higher the completion rate. Goal selection is the critical signal — it determines which of the six audit outputs gets weighted most heavily.

### The Six Audit Outputs
Every report answers exactly six questions:
1. **Where you're at** — current metrics, content mix, platform health
2. **What's holding you back** — bottlenecks, content gaps, growth ceiling diagnosis
3. **Who's doing it better** — auto-selected peer comparison (see Peer Comparison rules below)
4. **What to post next week** — concrete content calendar with format, hook, and pillar
5. **When you hit the next milestone** — growth trajectory computed per tier (see Milestone Computation)
6. **The money move** — monetization opportunity specific to their audience and format mix

### Peer Comparison: Auto-Suggest, Never Free-Choice
**Critical UX rule:** Do NOT let users freely choose comparison accounts. Left to their own devices, users pick aspirational 1M+ accounts (Huberman, Attia) that make their own progress look bad and produce demoralizing reports.

Instead, the system auto-suggests **3 same-tier peers** with rationale blurbs explaining why they're relevant comparables. Users can swap out any auto-suggested peer, but only from a same-tier pool. Custom comparison against any account (including aspirational 1M+ accounts) is a **Pro tier upsell**.

### Milestone Computation Per Tier
Milestones are never hardcoded. The "Road to X" target is computed from the account's current follower tier:

| Current Followers | Next Milestone |
|---|---|
| 0–300 | Road to 2K |
| 300–2K | Road to 10K |
| 2K–10K | Road to 20K |
| 10K–50K | Road to 100K |
| 50K–100K | Road to 250K |
| 100K+ | Road to 500K |

The advice changes per tier — what gets a 500-follower account to 2K is different from what gets a 50K account to 100K.

---

## Chat Refinement (Scoping Rules)

The chat panel in the Report Viewer allows users to refine individual sections. Critical scoping constraints:

**What users CAN do:**
- "Make the growth strategy more aggressive" → rewrites that section
- "Add more specific Reel ideas" → expands the content format arsenal
- "Compare our engagement to the industry average" → adds data to the relevant section
- "Simplify the language — my client isn't technical" → adjusts tone for the whole report

**What users CANNOT do (blocked at the proxy layer):**
- Access raw configs, prompts, or system-level controls
- Modify pricing, token budgets, or backend parameters
- See or modify other users' reports
- Execute arbitrary commands or access the server
- Modify the audit framework itself (sections, scoring weights)

**Implementation:** The chat refinement is scoped to report sections only. Each refinement prompt is sent to Hermes with the specific section context, and the response replaces only that section. No general-purpose chat — the input is always anchored to a specific report section.

---

## Pricing Model

### Evolution
The pricing model evolved through client feedback:

| Component | v1 (Internal) | v2 (Pilot) | v3 (Live Demo) |
|---|---|---|---|
| Starter | $49/mo (2 audits) | $49/mo (5 audits + 10 refinements) | $30/mo (5 audits) |
| Pro | $99/mo (5 audits) | $99/mo (15 + comparison + trajectory) | $50/mo (15 audits + auto-comparison + trajectory) |
| Enterprise | $249/mo (20 + white-label) | $249/mo (20 + white-label) | Contact Sales |

**Current pricing (v3 Live Demo):**
- Starter: $30/month — 5 audits, 10 chat refinements, PDF + HTML export
- Pro: $50/month — 15 audits, automated competitive comparison, growth trajectory forecasting, priority generation
- Enterprise: Contact Sales — unlimited audits, white-label reports, API access, dedicated support

**Feature tier differentiation:**
- Automated comparison audits and trajectory forecasting are Pro-only upsells
- White-label and API access are Enterprise-only

### Economics
- Fixed infra cost: ~$4.90/month (single CX22 VM)
- Variable cost per audit: $0.60-$1.80 in LLM tokens + data API calls
- Safety cap: $3/audit hard limit
- Margins: ~50% at Starter, higher at Pro/Enterprise volumes
- Philosophy: lower price + higher limits = mass adoption; 50% margin is acceptable for pilot that scales by volume on a single server

---

## Technical Architecture

### Current (Demo)
- Fully static HTML/CSS/JS deployed on GitHub Pages (`asheshkaji.com/auditlayer/`)
- No backend, no real API calls
- Report data hardcoded from @hemalpatelphd audit
- Payment form is a mock (no real Stripe)

### Production Target
```
User Browser
    ↓
Cloudflare Tunnel → custom portal (Flask/FastAPI, ~500 lines)
    ↓
API proxy (thin — auth, rate limiting, input validation)
    ↓
Hermes API → social-media-audit skill → 15-section report generation
    ↓
Result: self-contained HTML report saved, viewer rendered
```

**Infrastructure:**
- Single CX22 VM (2 vCPU, 4GB RAM) — sufficient for pilot
- No database needed initially (reports saved as static files)
- Stripe for payments (webhook handler ~50 lines)
- Cloudflare Tunnel for secure exposure (no open ports)

**No new infrastructure required** — Hermes sessions + the existing `social-media-audit` skill handle report generation. The portal is a thin wrapper for auth, queuing, and delivery.

---

## Competitive Moat

1. **Skill improvement through use** — every audit calibrates the pipeline further
2. **Domain calibration** — the skill improves in specific verticals (med-tech, wellness, creator economy) with each audit
3. **Structured report consistency** — unlike raw LLM output, the 15-section framework produces comparable, benchmarkable reports
4. **Chat refinement history** — users build a refinement history that makes switching costly
5. **Guided questions as UX moat** — the 5-step wizard creates structured parameters that raw chat interfaces can't replicate

---

## Implementation Roadmap (4 Phases)

### Phase 0: Validation (Complete)
- ✅ Interactive demo built and deployed
- ✅ Viability plan published
- ✅ Pricing model validated through iteration

### Phase 1: Portal + Stripe (Week 1-2)
- Flask/FastAPI portal with real auth (Clerk or email-link magic)
- Stripe integration with webhook handler
- Real audit queue (Hermes API calls replace mock data)
- Basic dashboard with report list

### Phase 2: Chat Refinement (Week 3-4)
- Floating chat panel connected to real API
- Section-scoped refinement with context injection
- Report export (PDF via headless Chrome, HTML direct download)

### Phase 3: Pro Features (Week 5-6)
- Automated competitive comparison generation
- Growth trajectory forecasting
- White-label report generation (Enterprise)

### Phase 4: Scale (Week 7+)
- Multi-tenant isolation
- Usage analytics dashboard
- API access for Enterprise clients
- Email notifications (report ready, subscription events)

---

## Niche Strategy: Evidence-Based Biohacking

### Credential Filter
AuditLayer only audits **evidence-based biohacking accounts** — creators with verifiable credentials (PhD, MD, NP, researcher, RD). The filter is: can this person cite the paper behind the protocol? This excludes influencer-biohackers who repeat protocols without understanding root cause.

**"AuditLayer audited" becomes a trust signal.** Creators who pass the credential filter get a badge they can display. This builds AuditLayer's reputation as the auditor of record in the biohacking space — the report you get when credentials matter.

### Biohacking Audience Segments
Not one monolithic audience — distinct segments with different content needs:
- **Quantified-self data nerds** — want biomarker data, peer-reviewed citations, protocols
- **Spiritual/energy healing** — want integration of science + traditional wisdom
- **Performance athletes** — want protocols for VO2 max, recovery, mitochondrial health
- **Longevity/anti-aging** — want lifespan extension, senescence research, supplement stacks
- **Silicon Valley tech-bio** — want wearable integration, nootropics, optimization culture
- **Biohacking moms** — want family protocols, kids' nutrition, household detox
- **Clinicians (MD, NP, RN)** — want clinical evidence, patient-applicable protocols
- **PhD researchers** — want deep mechanism dives, study design critique

### Content Format Priority (Biohacking Space)
For this niche specifically, content effectiveness ranks:
1. **Podcasts** (highest conversion) — long-form trust building, mechanism deep-dives
2. **Reels** (discovery) — hook-driven science snippets, protocol summaries, myth-busting
3. **Bite-size paper breakdowns** (saves/credibility) — one study, one slide, one takeaway

### Competitor Landscape
Existing tools and their gaps:

| Tool | What it does | Gap |
|---|---|---|
| Compicly | Generic social analytics | No niche calibration, generic scoring |
| Socialinsider | Industry benchmarking | No client-facing HTML reports |
| Hookly | Hook/creative analysis | No growth timelines, no domain expertise |
| QuickInsight | Fast metrics dashboards | No strategy depth, no content calendars |
| Luesco | Influencer analytics | No biohacking/health/wellness calibration |

**AuditLayer's differentiated position:** None of these produce client-facing HTML reports calibrated by niche. None give growth timelines specific to biohacking/health creators. None have domain expertise in the biohacking content space. AuditLayer's moat is not the technology — it's **domain calibration**. Generic tools treat a science account and a fashion account the same way. Narin's knowledge of biohacking benchmarks, audience psychology, and content formats is what makes the reports credible.

---

## Key Product Decisions

1. **Three questions, not five** — handle + goal + optional context. Less friction, higher completion. The goal selection determines which of the six audit outputs receives the most weight.
2. **Peer auto-suggest, never free-choice** — users can't pick their own comparables. The system selects 3 same-tier peers. Custom comparisons are a Pro upsell. This prevents the aspirational-comparison demoralization problem.
3. **Credential filter as moat** — only evidence-based biohacking accounts (PhD, MD, NP, researcher). "AuditLayer audited" becomes a trust signal that generic tools can't replicate.
4. **Domain calibration over generic analytics** — the reports are better not because the technology is better, but because Narin calibrates what "good" looks like in biohacking/health/wellness. Generic tools don't know that a 2% engagement rate is excellent for a PhD researcher but average for a fitness influencer.
5. **Chat scoped to sections** — users refine reports, not access the system; prevents prompt injection and config exposure
6. **Quality over cost** — token budgets are generous to preserve report depth; the $3/audit cap is a safety net, not a target
7. **Single CX22 for pilot** — no multi-node scaling until demand requires it
8. **Static reports by default** — audits are self-contained HTML files that survive offline, in email, and in print
9. **Paywall after first audit** — one free audit as lead gen, then subscription required
