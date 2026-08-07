# AuditLayer Improvement Idea Queue

Status vocabulary: `proposed → in_flight → done`; `parked` is explicit. The assigner changes `proposed` to `in_flight`; only a verified merge gate changes it to `done`.

| Status | Tag | Idea | Check | Type |
|---|---|---|---|---|
| done | P1 · C1/C2 · D3 | Build an evidence-coverage contract for the six customer answers | On a corpus of existing sanitized/mock report payloads, every material metric/finding/recommendation resolves to evidence ID + observed time + freshness + confidence/limitation; invalid payloads fail closed; no customer data or live calls | engineering |
| done | P2 · C5 · F5 | Produce a deterministic audit-to-audit change classifier | Fixture-backed versions classify every delta as evidence, brief/lens, methodology, or correction; unexplained deltas become UNKNOWN with a correction tip; backward-compatible serialization passes | engineering |
| proposed | P3 · C6 · F1 | Measure recommendation specificity and actionability against the canonical method | A predeclared rubric applied to at least 20 sanitized repository report sections reports inter-rater-ready features and honest coverage; no efficacy claim from synthetic labels | research |
| proposed | P4 · C3 · F1 | Add a same-tier peer validity auditor | Real repository peer fixtures and public test data reject tier mismatch, unverifiable handles, stale metrics, and relationship-framing errors; valid peers include rationale and source age | engineering |
| done | P5 · C7/C8 | Falsify customer waiting-state truthfulness under retries and resume | Deterministic state-machine tests cover preparing/analyzing/finalizing/delayed/success/failure, leave-return resume, stale heartbeat, and duplicate events; no internal trace leaks | engineering |
| in_flight | P6 · F4 · D4 | Quantify bounded runtime reuse and retry invariants | Local mock runs prove single-channel one-call behavior, ≤3 independent channel calls, one synthesis, cache-key exactness, stage reuse, deadline enforcement, and zero live token spend | engineering |
| in_flight | P7 · C10 · F2 · D3 | Property-test tenant and artifact access boundaries | Route/RLS contract tests cover owner/admin/other-user/anonymous matrices for briefs, reports, evidence, and signed access; no service-role secret reaches client output | security |
| done | P8 · C9 · D5 | Define the recommendation-outcome linkage contract | Typed schema and tests capture accepted/rejected/modified recommendation, experiment window, observed outcome, and confounding notes; unlinked outcomes cannot support efficacy claims | engineering |
| in_flight | P3 · C1/C6 · F1 | Create an honest-null report quality regression harness | Golden structural fixtures verify six answers, limitation language, strengths, priorities, and print-safe HTML while explicitly avoiding subjective efficacy claims; diffs are inspectable | product |
| proposed | P4 · C3 · F1 | Audit niche and account-type misclassification paths | At least 30 sanitized/public test cases stratified by creator/company/expert/general-media and platform report accuracy, class balance, abstentions, and error categories; no recommendation when type is unknown | research |
| in_flight | P5 · C4/C9 | Build Living Brief protected-field proposal semantics | Tests prove model output can only propose diffs; identity/vision/goals/constraints require explicit confirmation; version history remains immutable; rejected proposals stay rejected absent new evidence | engineering |
| proposed | P7 · F3/F6 | Build founder-facing release-evidence packet generation | One local command emits code/commit/test/preview/migration/production-state distinctions and rollback checklist from real local state; it cannot deploy or approve production | devops |

## Founder-brief expansion — 2026-08-07

| Status | Tag | Idea | Check | Type |
|---|---|---|---|---|
| proposed | P9 · C11/C13 · F8 | Surface a minimal brand-intelligence semantic contract | A versioned vocabulary with fewer than 25 core classes, SHACL/typed invariants, five competency queries, and valid/invalid fixtures answers partner/subject/evidence/decision/outcome questions without introducing a graph service or competing with SQL authority | architecture |
| proposed | P10 · C12 · F1/F8 | Establish a real multi-route experience baseline | Desktop and 390px captures of public, auth, account, audit, report, support, privacy, loading, empty, error, and delayed states produce a ranked system-first defect map; auxiliary vision findings are grounded in images and mechanical accessibility/overflow checks | design-research |
| proposed | P10 · C12 · D2 | Enforce shared product-experience primitives | Static and component tests measure token, panel, header, button, banner, empty/loading/error-state, tap-target, radius, and hardcoded-color conformance across product routes; the check reports coverage and exceptions rather than claiming subjective perfection | frontend |
| done | P11 · C14 · F7 | Define evidence-backed offer and pricing contracts | Current plans, entitlements, runtime outputs, delivery costs, promises, and observed funnel events map to versioned offer hypotheses; unsupported distinctions fail a parity test and empirical gaps render unknown rather than fabricated demand | product |
| proposed | P3 · C1/C13 · F5 | Make reports explicit projections of canonical intelligence | A fixture-backed projection contract proves report sections, dashboard summaries, and exports derive from one pinned evidence/brief/method bundle and cannot be parsed back into canonical state; old immutable reports remain retrievable | architecture |
| proposed | P12 · C12/C15 · F4/F9 | Measure end-to-end responsiveness and runtime budgets | Reproducible local/preview measurements separate browser rendering, Vercel route time, Supabase round trips, worker queue time, evidence acquisition, inference, and rendering; each budget has a baseline, target, and honest unavailable state | performance |
| done | P12 · C15 · F9 · D7 | Build an authentication and capability preflight matrix | Deterministic checks cover supported login methods, OAuth/env presence without secret disclosure, callback/deletion/support requirements, worker commands, model features, migrations, and failure/recovery states; missing capability blocks before mutation | reliability |
| proposed | P12 · F6/F10 · D8/D9 | Prove portable interfaces and release containment | An architecture contract names every Vercel/Supabase/Hetzner interface, health probe, dependency, migration order, canary, and rollback; a dry-run release fixture fails closed on missing preconditions and emits a machine-readable evidence packet | devops |

## Replenishment rules

- Read the latest ledger rows, `VISION.md`, `FUNDAMENTALS.md`, `USER-STORIES.md`, current canonical implementation packet, and repository test gaps.
- Prefer a different underdeveloped program when the last four completed cards cluster in one area.
- Every idea names a baseline, observed or fixture-backed evidence, an honest-null clause, and a no-production safety boundary.
- Append new ideas; do not rewrite history to make the queue look cleaner.
