# Workspace integration intake — 2026-09-19

## Decision and evidence boundary

Implement the expanded release, not a replacement platform. `workspace-release-20260919.md` controls: Telegram 19332 authorizes pricing/reader/credits/model selection/workspace in this release; AWS is later. Preserve the existing sweep and its recovery/security fixes. September GTM's stale-checkout claim that subject/context/run runtime was absent is **not true of this feature tree**.

Inspected `/home/asheshkaji/projects/alm-report-mobile-20260919`, branch `fix/report-mobile-20260919`, HEAD `38ab957b7669a0525af390882bad3c305f971660`, with extensive concurrent dirty/untracked changes. Findings describe observed files, not committed or deployed functionality. Main checkout was not used as implementation authority. No tests, builds, code execution, deployments, provider calls, or production probes were performed. Only this document was written. Re-read active files before editing.

## 1. Reuse map: current → minimum extension

| Surface | Actual evidence in this tree | Minimum release extension |
|---|---|---|
| Subject, channels, confirmed context | `20260723020611_alm_intelligence_kernel.sql` defines `subjects`, `subject_channels`, `living_brief_versions`, `intelligence_runs`, `evidence_snapshots`, `evidence`; `web/src/lib/intelligence/subjects.ts` reads owned subjects, briefs, proposals, runs, scores, recommendations and decisions. `actions/intelligence.ts` saves brief versions and resolves proposals through RPCs. | Display **Brand Context / Versions**, retain existing IDs and SQL authority. Add missing author/source/diff/confirmation presentation and exact context pin to execution receipt. Do not create a second brand-memory database. Enforce new pilot one-owner/one-brand at admission without deleting legacy subjects. |
| Decisions and temporal continuity | `getSubjectHomeBundle` reads durable `decisions` (lines 284–299), recommendations and method-tagged scores; `recordRecommendationDecisionAction` exists. | Keep rejection/deferral history and recommendation revision identity; link new updates to evidence/context/method/model changes. `sinceLast` is currently initialized empty (line 351), recommendation `auditId` is empty (337), score rationale is only a methodology label (309–311): do not call these a finished change/evidence explanation. |
| Execution and provenance | `worker/auditlayer_worker/intelligence/{bridge,runtime,ledger,report_provenance,telemetry_persistence}.py`; `supabase_client.py` has start/finalize intelligence and generation runs. | Attach shared pinned model/rate/tool/quote/reservation/receipt contracts to the existing run lifecycle, not another execution database. Keep unknown historical pins unknown. |
| Immutable reports/refinements | `audit_report_versions` migration; `ReportViewer`; owner report API's version query; `enqueue_report_refinement`; worker initial/regenerated/refinement finalizers. | Rich reader controls plus explicit version/context/evidence/receipt continuity. Refinement is a quoted execution against an exact predecessor; keep old bytes and report lineage. |
| Workspace ownership/freshness | `workspace-resources.tsx`, `lib/resources/*`, `/api/resources/*`, `OwnedReportReader` already use one retained TanStack owner, owner-scoped DTOs and immutable content hash/presentation revision keys. | Add wallet/catalog/workflow resources to this owner, with narrow invalidation. Do not replace it with Fractal's custom cache, gRPC, a second RSC loader, or a global store. Every server read still authorizes current scope. TTL/read/URL signing must never execute paid work. |
| Customer intake | `prepareAndSubmitIntelligenceBatch` performs retry lookup before mutable allowance checks, then `submit_entitled_audit_batch_v2`; draft subject/brief/batch path already exists. | Extend existing command with quote/model/rate/grants and atomic reservation; preserve retry-before-entitlement behavior. No new parallel audit-submit action. |
| Billing | `startCheckout` → `runCheckoutIntent`; Stripe webhook → pure reducer → SQL `reconcile_stripe_subscription`; current path grants count-based Starter/Pro and exact period windows. | Explicit new commercial-contract discriminator and new paid-credit events; separate legacy obligations. Existing subscription status reconciliation is not a credit-payment ledger. |
| Operator/chat | `actions/operator.ts:66,231` requires **requireAdmin** for both message and job actions; UI is `app/admin/audits/[id]/operator-panel.tsx`. Operations doc describes founder company profile, deterministic audit session, tool-free discussion and typed admin jobs. | **Admin-only, not a customer-safe hosted agent.** Never expose it by removing requireAdmin. If conversational entry is needed, implement a bounded owner-scoped proposal surface delegating to the same customer commands/grants; no founder profile/tools/secrets/session reuse. The saved-job form can ship without a generic chatbot. |
| Recurring workflow | Queue/retry/admin jobs exist. Repository search found no `workflow_versions`, `schedule_grant`, `delivery_grant`, or `scheduled_runs`. GTM explicitly describes schedules as target behavior. | Add only one saved brand-update definition, durable schedule occurrences, independent grants and delivery outbox/receipts. Existing worker queue is not proof of customer scheduling. |

## 2. Reader intent recovered beyond September GTM

Primary historical locator: session `20260718_225153_167c54`, assistant message **69427**, recovered by session search (`reader` + `score`, before July 20). It explicitly proposes sticky chapter rail grouped around six product questions, current section, persistent overall/primary-focus score, **Why this score**, evidence/citations, **Actions only**, and deep links. Detailed contemporaneous requirements are preserved in `auditlayer-web` skill reference `references/report-form-contract-and-reader-v12.md`:

- Desktop: chapter rail, active-section indicator, persistent overall/primary-focus score, score explanation drawer, source panel, actions-only mode, finding/action-ID links.
- Mobile: compact score strip, bottom-sheet contents, tap-to-expand evidence, safe charts/tables, one-action-card rhythm.
- Source panel: title, publisher, observation time, evidence type and confidence. Metrics use authoritative snapshot; recommendation links finding/dimension; strategic opinion is labelled as ALM interpretation, not fake evidence.
- Canonical static HTML remains usable for sharing/offline/export. Renderer emits IDs and evidence attributes; React enhances navigation, not truth. Unavailable scores show **Data needed**, never a red zero. Historical observations remain historical.

**Provenance limit:** message 69427 is an assistant proposal, not independent evidence that its aesthetics were approved. The July 14 “Editorial Intelligence Studio” rehaul also appears in session summaries; no approval was established in this intake. Current authorization is Telegram 19332 plus controlling release scope, not an invented approval of every old mockup. Exact names of the six question groups were not recovered here; use the actual emitted report structure rather than inventing categories. This is a bounded presentation-content gap, not a reason to restart architecture.

Existing mobile work is necessary but insufficient: `report-mobile-web-20260919.md` documents body/root typography restoration, local table overflow, legacy telemetry removal, authorized presentation projection and pricing navigation. `OwnedReportReader` currently wraps `ImmersiveReport` with resource status; the observed code does not establish the richer controls above. `ReportViewer` exposes latest version/refinement, not by itself the full historical navigation story.

Reader acceptance for this release:
1. Open owned report → see stable report/version/as-of/context identity; choose an older version without changing latest; a missing provenance field says unknown. New refinement never rewrites the prior version.
2. Navigate real sections via desktop rail/mobile contents; deep link finds the correct stable target; actions-only mode never fabricates actions from unrelated prose. Legacy reports lacking semantic IDs keep readable contents and truthful “not available” controls rather than guessed score/evidence mapping.
3. Inspect a score/action → resolve owned, version-pinned evidence with observation date, limitations and method; unsupported/missing evidence remains explicit. Do not derive evidence from the latest subject run when reading an older report.
4. At 320/390px, table/chart overflow stays local; keyboard/focus/navigation work; owner/share/download presentation agrees. Share recipients receive only the authorized artifact, not wallet/context/source credentials.
5. Warm revisit reuses exact-version bytes; refresh reads metadata/content only; logout/account switch fences late responses. Usage receipt is separate authorized workspace UI, not restored internal token/cost footer text.

## 3. Canonical integration entrypoints — no parallel bypasses

| Command/read boundary | Exact existing seam | Required integration |
|---|---|---|
| Offer/Checkout | `web/src/lib/{offer-pricing,stripe,checkout-intent}.ts`, `actions/billing.ts:startCheckout`, `app/pricing/{page,actions}.tsx/ts` | Add configured workspace offer and explicit top-up intent with separate idempotency/purchase consent. No payment on GET. Old report CTAs may retain Starter/Pro query intent, but must land on honest legacy/new-offer explanation, not silently purchase a different contract. Preserve login return intent. |
| Stripe webhook | `app/api/webhooks/stripe/route.ts:POST`, `lib/stripe-reconciliation.ts:reduceStripeSubscriptionEvent` | Current switch handles subscription events and checkout with subscription; checkout without subscription returns `no_subscription` (74–78), all other events unsupported. Add confirmed paid allowance/top-up/refund/dispute/failed-renewal facts routed through typed commands to authoritative SQL. Do not mint credits from `active` status, redirect success, or metadata alone. |
| Reconciliation | `reconcile_stripe_subscription` and `scripts/reconcile-existing-stripe-windows.py` | Preserve current subscription identity/order/manual-access safeguards. Extend separate durable payment/usage reconciliation for missing/out-of-order events and ambiguous provider calls; never run the existing reconciliation script as an automatic legacy conversion. |
| Intake | `actions/intelligence.ts:prepareAndSubmitIntelligenceBatch`, `intelligence/api.ts:rpcSubmitEntitledAuditBatch`, `rpcLookupEntitledAuditBatchRetry` | Include complete immutable intent fingerprint: context, channels, model/config, rate, tools/data destination, quote and consent. Lookup existing committed operation before depleted allowance errors. Validate ownership/grants under SQL locks and create run/reservation atomically. Legacy contract follows legacy entitlement path. |
| Refinement | `actions/refinements.ts:requestRefinement` → `enqueue_report_refinement`; `report-viewer.tsx` | Quote selected section/exact report version; show model/data route and bounded cost before explicit submission. Same reserve/receipt authority, no free bypass through old action. Keep section/version fence and successful-only resource invalidation. |
| Claims/dispatch | `worker.py:run_worker_loop`, `_process_refinement_attempt`; `supabase_client.py:claim_next_queued`, `claim_next_refinement`; latest claim SQL in `20260919211532_worker_fleet_drain.sql` | Claim checks executable reservation, current grants, cancellation and pinned supported model; preserve fleet drain. Reserve worst-case upstream and customer exposure before every costly call including tools. Expired lease alone must not refund an ambiguous dispatched call. |
| Finalization | `pipeline.py:run/refine`; `supabase_client.py:finalize_initial_report/finalize_regenerated_report/finalize_refinement_report/finish_report_generation_run/finalize_intelligence_run` | Stable attempt/artifact identity across retries; settle successful path once and release unused holds transactionally with accepted result, or durable recoverable reconciliation linkage. Internal failed attempts are ALM expense; unknown usage stays pending. Lost commit response cannot duplicate charge/version or turn committed success into billable retry. Coordinate with current refinement owner. |
| Reads | `lib/resources/*`, `/api/resources/report/[id]`, `/api/audits/[id]/{report,read,progress,refinements}`, share API, `intelligence/subjects.ts` | Add owner-scoped wallet/receipt/catalog/workflow read projections. No provider calls, scheduling, wallet mutation or generation on reads. Cache keys carry owner/scope/schema/version; current grants override pinned permissions. Keep raw admin/provider diagnostics out of customer errors. |

Legacy transition is explicit: purchased owed reports, gifts/trials and already-queued legacy work keep their contract; do not infer wallet credit from report counts. A new workspace contract can coexist with historical artifacts. Opt-in/change requires a documented obligation treatment, not a boolean silently changed by the new price mapping.

## 4. One saved workflow, exact lifecycle

Product job from `GTM_V0_1.md:78–91`: review changes for one brand, propose priorities, produce a concise cited update and prepare an authenticated-link delivery. “No material change” is valid. Strategic changes remain unconfirmed proposals. No social publishing/ad spend, arbitrary connectors, graph builder, or autonomous code generation.

Minimum durable state (extend shared contracts and SQL lane, not competing schema): owned workflow/version; timezone and constrained local schedule; pinned model/rate/method/tools/caps; resolver for latest **confirmed** context; independent run/schedule/delivery grants; occurrence/run mapping; review decision; delivery outbox and receipt. Every triggered run stores the resolved exact context/evidence/version.

1. **Draft → inspect → trial:** show brand, objective, timezone, channels, tools, model/data destinations, recipients, usage range and hard ceilings. First-run approval is not schedule or send permission.
2. **Save/activate:** immutable workflow version plus separately approved standing schedule grant. Recipient grant does not authorize workspace membership. Default `review_before_send`; no unattended delivery without separately explicit standing delivery authority.
3. **Trigger:** resolve current ownership/access/context, claim unique `(workflow/version, scheduled occurrence)` under lock, reserve account/wallet/upstream limits, then queue existing execution. Pin timezone rules and deterministic DST/missed-occurrence behavior; show next run locally and in UTC. Recommended bounded policy for owner confirmation in UI: skip nonexistent local time, one occurrence during overlap, no unbounded catch-up.
4. **Execute:** recheck live grants before sensitive reads; revocation pauses work despite stored consent. Finish cited update/proposals/receipt even if no material change. No repeated full report merely to consume allowance.
5. **Review/send:** approval references exact artifact version and recipients. Before send recheck current owner, schedule/delivery policy and each recipient grant; use an authenticated, revocable artifact link rather than unrestricted attachment. Changes to recipients/model data route/tools/caps require renewed consent.
6. **Retry/revoke:** outbox idempotency binds occurrence + artifact version + recipient + delivery channel. Persist provider acceptance/receipt; ambiguous send stays reconciling, not blind resubmission. Pause/resume is explicit and resume revalidates grants/caps; cancel immediately blocks new occurrences. Revocation prevents future access/send; it cannot retract an already delivered email, so the link must still enforce revocation.

Acceptance: duplicate schedulers → one run/reservation; DST/clock jumps → declared occurrence behavior; insufficient credit/invalid provider → paused with recovery, zero calls; revoke after queue and before delivery → no forbidden read/send; changed confirmed context → exact newly resolved pin; edit workflow → old occurrences retain old version; cancellation → no new runs; repeated approval/webhook/send callback → one receipt; ambiguous dispatch remains pending.

## 5. Next execution slices and file ownership

Shared-contract, credit-SQL and model-adapter lanes already exist: consume their outputs, do not redo them. Parent owns integration and all shared/generated files and migration ordering. Proposed new paths below are assignments, not claims those files exist.

### Slice A — paid permission to execute, end to end

**Outcome:** test-mode owner sees actual configured model/cost, authorizes one job, gets one artifact and one receipt; legacy owed report still runs under its original rights.

- Web integration owner: offer/checkout/reconciliation adapters, `actions/intelligence.ts`, wizard, pricing and wallet/receipt UI. Contract lane provides canonical schema + generated projections; credit lane supplies SQL reserve/settle/payment RPCs; adapter lane supplies configured catalog and bounded usage interface.
- Parent integrates worker handoff only after refinement lane releases `pipeline.py`, `core.py`, `hermes_inprocess.py`, `supabase_client.py`; coordinate `worker.py`/generation seams too. Do not race those files.
- Gate: local real SQL duplicate/out-of-order payments and simultaneous last-balance reservations; browser quote→consent→queue→receipt, missing-config denial, failed/ambiguous execution; initial/refinement/regeneration all covered. No live charging needed to implement.

### Slice B — context-to-reader continuity, not just selector UI

**Outcome:** owner edits/confirms Brand Context, generates or refines with selected model, inspects resulting evidence/version/change/usage, reopens older report and exports permitted data.

- Workspace/reader owner: `components/intelligence/subject-home.tsx`, subject readers/actions (serialize overlap with Slice A), `owned-report-reader.tsx`, `immersive-report.tsx`, `report-viewer.tsx`, report DTOs and owner/share handlers; parent owns renderer semantic-ID handoff to worker.
- Reuse versioned brief/recommendation/evidence tables; build missing explained-change projection, historical version selector and bounded source drawer. Export context/evidence references/artifacts/workflow definitions without credentials; no invented historical backfill.
- Gate: browser first-time and returning-owner stories, sparse legacy report, proposed vs confirmed context, exact historical source/version, 320/390px/accessibility, sharing revocation, account switch, no calls on reads. Existing mobile fixes and prior QA reports are regression inputs, not proof this slice passed.

### Slice C — save, schedule, review, deliver one brand update

**Outcome:** owner trials the update from Slice A/B, saves it with schedule consent, receives a review item, approves a recipient-bound delivery and can pause/revoke/cancel.

- Workflow owner: proposed `web/src/lib/actions/workflows.ts`, owned workflow UI/API, bounded `worker/auditlayer_worker/brand_update_workflow.py`; SQL/grants/outbox additions remain credit/SQL owner or parent-assigned migration owner; shared-contract owner adds workflow projections. Email adapter must use ALM-scoped provider configuration, never company-operator credentials.
- Gate: full occurrence→reserve→run→review→delivery fixture plus DST, duplicates, revocation race, budget exhaustion, ambiguous delivery and cancellation tests. Parent serializes full build/browser/regression/review/preview/release after all slices; production remains unchanged until those gates pass.

## 6. Critical omissions to prevent “done” on a subset

- Rich reader is not the mobile overflow patch. Recover and implement navigation/explanation/action/evidence capabilities, with truthful legacy fallback.
- Persisted context and run/evidence history already exist; do not spend the release rebuilding them from the stale September inventory.
- A model dropdown is not model execution: actual configured alternative must be evaluated for the frontier task, with disclosed route, rate pin, bounded tools and no silent fallback. Two cheap models do not satisfy the frontier requirement.
- Stripe subscription events alone do not prove payment or create top-up lots. Include failed renewal, refunds/disputes, cancellation, ambiguous usage and independent upstream cap, not just a happy-path wallet.
- Preserve expiry-first lot consumption, explicit top-ups, purchased cap distinct from consumption cap, upstream failures distinct from customer charges, and prepaid liability distinct from cash/revenue.
- Data exit and lawful deletion are part of the offer. “Immutable” is a history rule, not permission to retain private content forever.
- Generic admin chat is not customer conversation history. Any customer proposal/discussion must be owner/brand scoped, version-linked and separately authorized; do not sell admin Ask ALM as a customer feature.
- Method/rubric/schema version and fact-vs-interpretation survive provider changes. Score-change explanations must allow model/config variation and unknown/mixed causes, not force all changes into evidence/brief/method/correction labels.
- Paid release acceptance includes all earlier auth/connection/intake/share/admin/latency fixes plus the new stories; existing sweep test counts alone cannot certify expanded scope.

## 7. External choices/configuration versus implementable work

**Implement now without another product debate:** existing-object reuse; shared contract consumption; ledger integration; configured/unavailable catalog; quote and consent UI; reader/context/version controls; legacy discriminator; single-workflow state machine with explicit schedule policy; test-mode payments and offline failure fixtures; export mechanics and enrollment gate.

**ALM-scoped configuration/evidence needed before live capability:** exact provider/model IDs, ALM-owned credentials/project, supported data classifications/destinations, dated token/cache/tool rates and capability/evaluation results, bounded evaluation spend authorization; Stripe workspace/top-up Price IDs, test/live webhook events/secret and portal cancellation behavior; sender/domain/email provider configuration and delivery reconciliation semantics; actual Meta permission/non-role onboarding evidence for claims made. Never borrow Codex/engineering credentials or another profile's provider account. Unconfigured capability stays unavailable.

**Actual user/legal decisions, separately blocked:** approved retention/deletion periods and export window; jurisdiction-valid purchased-credit expiry, refund/tax/consumer disclosures and final cancellation terms; explicit legacy subscription opt-in/obligation treatment if migration is wanted; approved data-processing/provider disclosures; pilot enrollment/recruitment/loss budget. Source P-01's 12-month expiry is conditional, not enacted law. No need to ask again whether to implement credits/model choice/AWS deferral: current scope answers that. Live enrollment remains gated while these terms/configurations are unresolved; do not silently reduce the requested release or pretend it is live.
