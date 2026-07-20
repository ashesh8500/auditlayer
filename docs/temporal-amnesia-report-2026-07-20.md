# AuditLayerMedia Temporal Continuity Report

**Date:** 20 July 2026
**Status:** Analysis and recommendation only — no temporal-memory implementation has been made as part of this report.
**Question:** How should AuditLayer prevent a new audit from forgetting, contradicting, or silently reversing earlier evidence, Narin-approved judgments, and recommendations?

## Executive conclusion

AuditLayer already has useful pieces of continuity, but it does **not yet have a canonical memory model**.

Current continuity is distributed across:

1. report HTML artifacts;
2. `audits.prompt_version`;
3. numeric `account_progression` points;
4. a short-lived unstructured `accounts.research_snapshot` cache;
5. broad per-user Hermes `MEMORY.md` state;
6. Narin’s report skills and reference documents;
7. refinement and report conversations.

Each piece solves a different problem. None records, in a machine-resolvable way, **which earlier claims and recommendations remain true, which were rejected, which were implemented, which expired, and why a new audit is allowed to disagree**.

That is the source of temporal amnesia. The next model run is given some context, but not a versioned decision ledger with precedence and validity rules.

The required solution is not “more memory” or a larger prompt. It is a **versioned account intelligence ledger** that distinguishes observations, interpretations, decisions, recommendations, and presentation rules. Hermes memory should become a derived working summary of that ledger, not the ledger itself.

## Evidence window and limitation

The request asked for six months of Narin’s reports and conversations. The directly retrievable AuditLayer evidence available in the repository and Hermes session store spans primarily **17 May–19 July 2026**, with canonical report artifacts dating from May 2026. This is a meaningful product-development window but not a complete six-month archive. Conclusions below are therefore grounded in the available May–July record and should not be represented as exhaustive of six months.

## What Narin’s work actually shows

Narin’s corrections fall into five distinct memory classes. They should not all be stored or applied the same way.

### 1. Durable global product rules

Examples preserved in current skills and references:

- The 15-section framework is the default product structure.
- Account type must be detected first; personal brands and businesses require different scoring and advice.
- Live metrics must never be fabricated when Instagram is not connected.
- Peer handles must be real and verified.
- Reports should be comprehensive without repeating the same diagnosis.
- Horizontal score bars are the default; circles were tried and then explicitly rejected as the default.
- Client-facing language should be polite, evidence-led, and specific.

These are policy-level decisions. They should apply across accounts until Narin explicitly supersedes them.

### 2. Format-variant rules

Narin maintains at least two legitimate report structures:

- the older Hemal/canonical light-format rules;
- the newer Shaima-style standard report variant.

The repository correctly documents that these variants have different headings, footer rules, and permitted visual components. The temporal risk is that a later generation treats an older variant as the new global default, or applies a global rule that the selected variant intentionally overrides.

A variant decision therefore needs a named, versioned contract rather than being inferred from whichever reference the model happens to load.

### 3. Account-specific facts and strategic decisions

The July report conversations demonstrate that recommendations depend on the actual business model and current account state:

- `@mayday_digital` required business framing, not generic creator/personal-brand framing.
- `@luciesocials` was supplied as a social media agency for beauty clinics and wellness brands, with 12 posts, 647 followers, and 1,993 following. Those facts define the baseline and should not be rediscovered or silently overwritten without newer evidence.
- The `@iampayam4` report was revised to use real fitness-coach peers and specific re-audit dates rather than vague cadence language.
- Existing contact or partnership status changes whether a CTA belongs in a client-facing artifact.
- Known pronouns, service boundaries, account niche, and buyer type are durable account facts unless explicitly changed.

These must remain scoped to the account/handle. They must not leak into another creator audited by the same founder account.

### 4. Recommendation lifecycle decisions

Narin’s corrections frequently express more than preference. They indicate the lifecycle of a recommendation:

- rejected as wrong;
- removed as repetitive;
- accepted but not yet implemented;
- already active, so no longer a valid “new” recommendation;
- intentionally restored after an over-compressed redesign;
- superseded by a newer strategy;
- deferred until a specific re-audit date.

The present system does not store these states structurally. A future audit can therefore recommend something that was rejected, claim an already-active strength is missing, or reverse an earlier priority without explaining why.

### 5. Presentation feedback

The June 30 exchange—“make it neat, it’s not clean enough”—and subsequent iterations show a stable preference for restraint: tighter composition, fewer decorative explanations, and no unnecessary visual weight. But presentation feedback is not account evidence. It belongs in template/design policy, not creator memory.

Mixing presentation preferences with account facts makes later prompts noisy and increases the chance that an old layout correction affects strategic reasoning.

## Current implementation: what works

### Prompt reproducibility exists

`audits.prompt_version` records the methodology prompt generation. The worker is currently on prompt v1.1, with a changelog from v0.1 onward. Reports receive a footer containing prompt version, timestamp, cost, and token counts.

This is valuable. It answers: “Which generation rules produced this report?”

It does **not** answer: “Which prior account decisions did this report inherit?”

### Numeric progression exists

`account_progression` records per-audit followers, engagement, average likes/comments, and score. This supports simple score and metric history.

It does not preserve:

- section-level scores;
- qualitative findings;
- evidence citations;
- prior recommendations;
- recommendation status;
- contradiction explanations;
- account classification at the time;
- benchmark/peer selection and rationale.

### Research caching exists

The worker reuses an account-scoped `research_snapshot` for fresh cache hits while fetching connected Instagram metrics live each audit. Current code writes at most 10,000 characters and uses a 24-hour cache expiry.

This is a cost/latency cache, not durable memory. It is unstructured evidence text and is overwritten by later research.

There is also documentation drift: migration `0027_research_cache.sql` describes a seven-day validity window, while current worker code writes 24 hours. That is not necessarily a product defect, but it demonstrates why versioned semantics matter.

### Broad Hermes memory exists

Per-account `HERMES_HOME` directories preserve `MEMORY.md` across audits. The prompt instructs the model to use prior memory but verify volatile metrics against live data.

This provides continuity, but the current scope is primarily the authenticated `user_id`, not necessarily the individual Instagram handle. Repository review explicitly identified the risk: one user auditing multiple creators can place those creators in the same memory namespace.

That can cause cross-account contamination. It is especially unsafe for founder/admin users who audit many unrelated accounts, including celebrities and prospects.

### Account and audit history exist

The portal already shows account score history and audit history, and the MCP layer exposes audit methodology versions. This is a strong substrate for a proper temporal model.

The missing layer is a structured interpretation of that history.

## Root causes of temporal amnesia

### 1. No separation between evidence, interpretation, and decision

A follower count, the inference “conversion path is weak,” and the recommendation “rewrite the bio” are different objects with different expiry rules. Today they can all be flattened into HTML, cache text, or memory prose.

### 2. No validity interval

A claim can be true on 1 June and false on 1 July. Current rows carry timestamps but not `valid_from`, `valid_to`, volatility class, or supersession relationships.

### 3. No recommendation ledger

Recommendations do not have durable states such as accepted, rejected, implemented, stale, or superseded. Therefore the next audit cannot reliably distinguish “still outstanding” from “already done” or “Narin rejected this.”

### 4. No contradiction protocol

A newer audit can assign a very different score or recommendation without having to cite:

- the previous claim;
- the new evidence;
- the reason for the change;
- whether the difference comes from methodology drift or account change.

### 5. Memory scope is too broad

A founder/admin account auditing many handles must not share an undifferentiated creator memory. Tenant isolation is not creator isolation.

### 6. Methodology is only partly versioned

Prompt version is stored. Template version, scoring-contract version, benchmark-set version, source snapshot version, and Narin-policy version are not consistently recorded as separate identifiers.

### 7. Report artifacts are final-form HTML

HTML is excellent as the owned client artifact, but poor as the only canonical source for future reasoning. Parsing old prose back into structured state is inherently lossy.

## Recommended model: Versioned Account Intelligence Ledger

The ledger should be the canonical product memory. Each generated report becomes a view over that ledger plus a frozen evidence snapshot.

### A. Observation records

Every factual observation should include:

- account/handle ID;
- field or claim type;
- value;
- `observed_at`;
- source type and source URL/reference;
- confidence;
- volatility class;
- `valid_from` and optional `valid_to`;
- collection method: connected Instagram, public web, client input, founder override;
- audit and evidence-snapshot IDs.

Connected Instagram observations should outrank public-indexed values for the same timestamp. Explicit client/founder corrections should outrank inference.

### B. Finding records

Each strategic finding should store:

- normalized topic, such as `profile.positioning` or `conversion.booking_path`;
- conclusion;
- supporting observation IDs;
- confidence;
- first-seen and last-confirmed audit IDs;
- current status: active, resolved, disputed, or superseded;
- scope: global, report variant, niche, account, or one audit.

### C. Recommendation ledger

Every recommendation should have:

- normalized recommendation key;
- exact recommendation and rationale;
- evidence/finding IDs;
- priority and expected outcome;
- state: proposed, accepted, rejected, in progress, implemented, stale, superseded;
- Narin/client feedback;
- `carry_forward` flag;
- review date or expiry condition;
- superseding recommendation ID when applicable.

This is the most important missing component. It prevents the system from re-proposing rejected work and lets a new report explicitly say “still outstanding,” “implemented,” or “revised because…”

### D. Policy registry

Narin’s product rules should be formalized separately from account memory:

- policy ID and version;
- scope: global, niche, report type, format variant, account;
- rule text and structured value where possible;
- effective date;
- superseded-by link;
- source conversation/artifact;
- approval status.

Examples include default score visualization, peer-verification requirements, account-type calibration, and business-vs-personal framing.

### E. Audit and report versions

Distinguish these concepts:

- **Audit run:** one research/generation event.
- **Evidence snapshot:** facts frozen for that run.
- **Methodology version:** prompt/scoring/benchmark contract.
- **Report revision:** presentation or copy refinements to the same audit evidence.
- **New audit:** a new temporal observation, not just a revised file.

A report revision should not silently replace the original artifact. It should have a revision number, parent revision, change note, actor, and timestamp.

## Required precedence model

When two pieces of memory conflict, apply this order:

1. safety/legal/data-integrity rules;
2. newer connected-platform evidence;
3. explicit latest client or founder correction scoped to that account;
4. active accepted account recommendation/decision;
5. selected report-variant contract;
6. current global Narin policy;
7. verified public web evidence;
8. older observations still within validity;
9. model inference.

The model should never resolve an important conflict silently. It should emit a structured conflict when competing evidence cannot be reconciled.

## Required “continuity packet” for every new audit

Before generation, the worker should eventually assemble a bounded packet containing:

1. current account identity and classification;
2. latest connected metrics and freshness;
3. latest public research evidence with citations;
4. previous audit baseline;
5. unresolved and implemented recommendations;
6. Narin/client corrections applicable to this account;
7. active global and variant policies;
8. explicit deltas since the last audit;
9. conflicts requiring cautious language;
10. methodology/version identifiers.

The model should receive this packet—not raw accumulated HTML and not an unlimited `MEMORY.md` dump.

## Required output behaviour

Every repeat audit should answer four continuity questions:

1. **What changed?** Measured evidence and score deltas.
2. **What did not change?** Persistent blockers and still-valid strengths.
3. **What was acted on?** Recommendations implemented or rejected.
4. **Why does advice differ?** New evidence, changed goals, or methodology update.

Large reversals should require a contradiction note. For example:

> Earlier audit: conversion path was the primary blocker.
> Current evidence: booking link and three service case studies are now live.
> Resolution: mark the earlier recommendation implemented; shift priority to distribution.

This is much more trustworthy than simply emitting a different recommendation.

## Product UX implications

A clean client/admin surface should eventually expose:

- `Audit #3 · Report revision 2 · Prompt 1.1 · Template 1.x`;
- “Since your last audit” summary;
- recommendation states and owner feedback;
- evidence freshness/provenance;
- report revision history and change notes;
- methodology-change notices when score comparison is not apples-to-apples;
- founder-only conflict resolution and policy promotion controls.

The client should see continuity and progress. Admins should see the underlying evidence, conflicts, and overrides without needing a separate disconnected mental model.

## What not to do

- Do not solve this by expanding free-form `MEMORY.md` indefinitely.
- Do not treat research cache as product memory.
- Do not parse HTML reports on every future run as the primary state store.
- Do not make every Narin correction global.
- Do not overwrite old reports when refining them.
- Do not compare scores across methodology versions without a comparability warning.
- Do not let admin/founder users share one creator-memory blob across unrelated handles.
- Do not let “fresh data” erase accepted historical decisions; freshness and continuity are complementary.

## Targeted implementation sequence — recommendation only

### Phase 1: provenance and versions

- Add explicit report revision, template, scoring-contract, and evidence-snapshot identifiers.
- Stop overwriting revisions without lineage.
- Show versions in admin/client history.

### Phase 2: recommendation ledger

- Persist normalized findings and recommendations.
- Add accepted/rejected/implemented/superseded states.
- Capture Narin/client corrections against the relevant object.

### Phase 3: continuity compiler

- Compile the bounded continuity packet for repeat audits.
- Require delta and contradiction output.
- Keep live metrics fresh while carrying forward durable decisions.

### Phase 4: memory isolation and derivation

- Scope working memory by tenant **and handle/account ID**.
- Generate a compact derived memory summary from the canonical ledger.
- Add size bounds, compaction, and concurrency control.

### Phase 5: calibration feedback loop

- Track which Narin corrections become global policies, niche policies, or account-only overrides.
- Measure repeated corrections and promote recurring ones only after review.

## Acceptance criteria for a future implementation

A future continuity system is successful when:

- a rejected recommendation is not reintroduced without new evidence;
- an implemented recommendation is acknowledged as progress;
- score changes cite either real account changes or methodology changes;
- one founder-audited celebrity cannot influence another account’s memory;
- all material claims have provenance and freshness;
- old report versions remain accessible;
- Narin can correct a fact once and choose its exact scope;
- repeat audits are more coherent than first audits without becoming stale;
- context size remains bounded as audit count grows.

## Final assessment

AuditLayer has already built approximately half of the infrastructure needed for temporal continuity: account ownership, audit history, prompt versioning, numeric progression, research caching, and scoped Hermes homes. The missing half is semantic: a versioned model of what was observed, decided, recommended, corrected, and superseded.

The highest-value next step is **not additional generative prompting**. It is the recommendation ledger plus explicit audit/report lineage. That will preserve Narin’s accumulated judgment, make repeat reports explainably consistent, and turn audit history into the switching-cost moat described in the ALM v2 design specification.

## Evidence consulted

- Hermes conversations and report work, 17 May–19 July 2026, including `@mayday_digital`, `@luciesocials`, `@iampayam4`, Shaima-format work, and June presentation corrections.
- `docs/plans/alm-v2-moat-design-spec.md`, especially Moats 1, 2, 4, 8, and 9.
- `docs/profiles/report-narin-fidelity.md`.
- `hermes-profile/skills/productivity/social-media-audit/SKILL.md` and Narin report references.
- `hermes-profile/skills/ppt-production-expert/narin-brand-audits/SKILL.md` and compliance references.
- `supabase/migrations/0017_prompt_version.sql`.
- `supabase/migrations/0026_account_ownership.sql`.
- `supabase/migrations/0027_research_cache.sql`.
- `worker/auditlayer_worker/account_homes.py`.
- `worker/auditlayer_worker/core.py`.
- `worker/auditlayer_worker/pipeline.py`.
- Existing reviewer analyses `REVIEW-t_68c6ebff.md` and `REVIEW-t_7c0f9bba.md`.
