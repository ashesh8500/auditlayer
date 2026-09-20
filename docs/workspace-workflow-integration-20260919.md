# Brand-update workflow integration — 2026-09-19

One saved recurring brand review, per `docs/workspace-integration-intake-20260919.md` §4. Not a generic workflow builder, not a second paid executor.

## Status

Implemented and exercised offline against real PostgreSQL 16. Nothing is deployed, enrolled, live, or committed. No provider call, email, credential, shared database, environment file, build, or server was used. Models remain unqualified and enrollment remains blocked, so the workflow cannot reach a provider through this lane: activation is possible, execution always pauses truthfully with zero calls until the parent wires the queue port described below.

## Files owned by this lane

- `supabase/migrations/20260919221848_brand_update_workflow.sql` (CLI-generated filename)
- `supabase/tests/brand_update_workflow_test.py`
- `worker/auditlayer_worker/brand_update_workflow.py`
- `worker/tests/test_brand_update_workflow.py`
- `web/src/lib/actions/workflows.ts`, `web/src/lib/actions/workflows.test.ts`
- `web/src/lib/workflows/{server.ts,dto.ts,routes.test.ts}`
- `web/src/components/workflows/{workflow-owner.tsx,workflow-owner.test.tsx,workflows-library.tsx,workflows-library.test.ts}`
- `web/src/app/(app)/workflows/page.tsx`
- `web/src/app/api/resources/workflows/route.ts`
- `web/src/app/api/workflow-artifacts/[id]/route.ts`
- `worker/auditlayer_worker/worker.py` — **only** the opt-in scheduler hook inside `run_worker_loop`

No edits to the credit or dispatch migrations, `pipeline.py`, `generation.py`, `supabase_client.py`, shared contracts, generated types or dependencies.

## SQL authority (`brand_workflow_*`, all service-role only)

`save` · `grant` · `control` · `next` · `tick` · `collect_reviews` · `approve` · `send_claim` · `send_result` · `artifact_access` · `resource` · `assert_dispatch`. Every owner write takes the profile row lock first, matching the existing ledger/Stripe serialization authority; every RPC validates canonical subject ownership rather than trusting caller IDs. Owner reads additionally use RLS `auth.uid()`; `anon`/`authenticated` have no writes, no RPC execute and no direct DML anywhere.

- **Immutable definition.** A saved version row can never be updated or deleted (trigger), including by privileged DML. Editing a workflow creates a new version; old occurrences keep their old `version_id`.
- **Separate permissions.** `run`, `schedule` and `delivery` grants are distinct rows. Saving or granting `run`/`delivery` does not activate anything: `activate` requires both run and schedule grants and still leaves status `draft` otherwise. Trial/run approval is never schedule consent. Revoking any granted permission (or cancelling) immediately returns the workflow to a blocked state.
- **Time policy.** `brand_workflow_next` evaluates at most eight local dates, resolves the instant by round-tripping UTC back to the wall clock (so a nonexistent spring-forward time is skipped to the next valid date) and returns the single earliest overlap instant (so a fall-back time fires once, and the second fold is never admitted). `tick` refuses occurrences older than 5 minutes and re-arms instead of replaying a backlog: skipped, missed or machine-offline occurrences are dropped, and no unbounded catch-up loop exists.
- **Occurrences.** `(workflow_id, version_id, scheduled_at)` is unique; the row is created empty-context-insert-then-check under the profile lock, so two concurrent schedulers produce exactly one occurrence (the two-thread test asserts a count of one). Reservation and run identity come from the canonical admission port, which is the only component allowed to create them; this lane creates neither. Context is resolved to the exact `living_brief_versions.id` of the latest **confirmed** version at trigger time and stored on the row; later confirmations never rewrite an existing occurrence.
- **Revocation.** `assert_dispatch` is the single live-authority check used by scheduling, approval, send and artifact access. It re-reads current workflow status, version staleness, subject ownership, confirmed-context existence and both live grants. Revoke-after-queue therefore denies dispatch; pause or cancel denies send and denies already-issued artifact links, which are re-authorized on every request.
- **Review.** `collect_reviews` only binds an immutable `audit_report_versions` row belonging to that occurrence's own audit **and** canonical intelligence run, whose run is `completed`, whose subject matches, whose brief version equals the pinned context version, and whose audit owner matches. Any other artifact is refused. Approval is bound to that exact artifact id plus the exact version recipient list; a mismatch raises and creates no outbox row.
- **Delivery.** One outbox row per `(occurrence, artifact version, recipient, channel)`; repeated approval/callback/send is a no-op returning the same receipt. `send_claim` is the last barrier before the provider boundary: it takes the profile lock, re-checks live grants and the immutable review, and atomically consumes the pending row. A consumed row never returns another claim permission — including after a lost response, timeout or restart — so an ambiguous send stays `reconciling` and is never blindly resubmitted. `send_result` is idempotent for identical payloads and rejects a different receipt for an already-sent row.
- **Spend.** This lane never reserves or settles. Unknown/absent queue authority pauses with `execution_unavailable` after the occurrence is retained; the occurrence keeps its identity so the parent's canonical admission can be retried without duplicating the schedule.

## Execution wiring

`tick` is the only path that queues work, and it delegates exclusively to canonical authority: it first calls `brand_workflow_assert_dispatch`, then requires `public.brand_workflow_queue_occurrence(jsonb)` to exist and to return `{audit_id, intelligence_run_id, reservation_id}`; if the port is missing it raises and the workflow pauses. This lane deliberately does not emulate enqueue with a ledger-only `workspace_credit_reserve`: the existing `workspace_execution_admit` requires a pre-existing audit/intelligence run plus a worker lease, so it is worker admission, not a customer enqueue API. Per the execution sibling's handoff, scheduled intents already fail closed with `schedule_authority_required` until this lane supplies the live grant recheck hook — the hook is now published (below) and the queue port is the remaining connection.

The worker loop calls `scheduler_tick(gateway, enabled=os.environ["ALM_BRAND_WORKFLOWS_ENABLED"] == "1")` once per iteration. Disabled is the default and does nothing; when enabled it performs one bounded tick (`limit` 10) plus one bounded review collection. Failure classification maps to `insufficient_credit`, `model_unavailable`, `permission_revoked`, `execution_unavailable` (default) or `confirmed_context_required`, and all of them pause. There are no orphan helpers: the loop path is the same function the tests exercise.

## Frozen ports for the parent and the execution sibling

1. **Dispatch hook** — implement `brand_workflow_assert_dispatch(jsonb_build_object('owner_id', …, 'occurrence_id', intent->>'schedule_id'))` for `trigger='schedule'` (`schedule_id` must be the durable occurrence UUID, never the workflow id). It takes the profile lock, re-checks active current version, live run+schedule grants, subject ownership and the occurrence's exact confirmed context, and raises on pause/revoke/cancel. It returns the occurrence JSON so the caller can compare quote refs (subject/context/workflow/version) before admitting or dispatching. It never reserves, never creates another execution and never releases unknown holds.
2. **Queue port** — `brand_workflow_queue_occurrence(p jsonb) -> jsonb` with input `{occurrence_id}`, implemented by the canonical admission owner against the existing quoted-run/audit/intelligence-run authority; returns `{audit_id, intelligence_run_id, reservation_id}`. Called transactionally inside the tick, with the occurrence id as the stable idempotency key. Until it exists, scheduling is paused and no calls are made.
3. **Shared projection** — add generated `WorkflowResource` to `contracts/workspace-v1` (fields listed below); then delete the temporary `web/src/lib/workflows/dto.ts`.
4. **Resource owner** — add `workflows` to the retained `ResourceName` union/revisions and the cookie revision in `(app)/layout.tsx`; until then the UI reuses the retained provider and client with an owner-scoped key, with no second cache or provider.
5. **Navigation** — add a `/workflows` entry to `web/src/components/app-header.tsx` (shared file, not edited here).
6. **Mail adapter** — an ALM-scoped `MailBoundary` (`send(recipient, url, idempotency_key) -> provider acceptance id`, SDK retries disabled, bounded, timeout raises). The worker kernel only accepts an injected boundary and persists provider acceptance; it never constructs credentials, never attaches the report, never exposes a signed storage URL and never re-sends after an ambiguous result. No company-operator credentials may be reused.

### Required parent-owned shared projection (before web typecheck of generated types)

Response uses snake_case except `ownerId`/`fetchedAt` required by the retained resource owner:
- `ownerId: UUID`, `fetchedAt: timestamp`, `workflows: WorkflowSummary[]`.
- WorkflowSummary: `id`, `subject_id`, `version_id`: UUID; `objective`, `timezone`, `local_time`: strings; `weekday: integer|null`; `status: draft|active|paused|cancelled`; `pause_reason: string|null`; `next_at: timestamp|null`; `model: ModelPin`; `rate_card_version`, `method_version`: string; `allowed_tools: string[]`; `customer_max`, `upstream_max`: Money; `recipients: UUID[]`; `run_granted`, `schedule_granted`: boolean; `delivery_granted: UUID[]`; `occurrences: WorkflowOccurrence[]`.
- WorkflowOccurrence: `id`, `version_id`, `context_version_id`: UUID; `scheduled_at`: timestamp; `state: awaiting_admission|queued|review|failed`; `audit_id: UUID|null`; `artifact_version_id: UUID|null`; `deliveries: WorkflowDelivery[]`.
- WorkflowDelivery: `id`, `recipient_id`, `artifact_version_id`: UUID; `status: queued|dispatching|reconciling|sent`; `sent_at: timestamp|null`. Provider receipt is internal and intentionally absent from the customer DTO.

## Exact commands and observed results

```sh
# real PostgreSQL, disposable container owned by this test, no URL/env override
python supabase/tests/brand_update_workflow_test.py
```
Exit 0:
```text
PASS immutable save, independent permissions, tenant isolation
PASS independent run/schedule/delivery grants, pause/revoke, DST policy
PASS duplicate scheduler, confirmed pin, revoke after queue, no catch-up, cancellation
PASS exact review approval, one outbox/receipt, revoked send/link, ambiguous no retry
PASS owner resource is read-only, excludes provider/storage secrets
```
The harness applies the full preceding migration chain plus this migration to a uniquely named container on `--network none` with the pinned pgvector digest, and removes only its own container. Exercises: duplicate-save immutability including direct privileged UPDATE, non-owner/foreign subject refusal, zero grants after save, run-grant-does-not-activate, two concurrent ticks with a real thread pool and a unique occurrence index, DST skip/overlap/once semantics, pause and revocation, no catch-up after a ten-day gap, cancellation stopping new occurrences, exact-confirmed-context pin plus older-occurrence retention when a newer version is confirmed, approval idempotency, revoked-recipient denial of both send claim and artifact link, ambiguous-no-retry, and receipt/idempotency immutability including a full resource JSON scan for absent provider and storage fields.

```sh
worker/.venv/bin/python -m pytest worker/tests/test_brand_update_workflow.py -q      # 5 passed
worker/.venv/bin/python -m pytest worker/tests -q                                   # 836 passed, 11 skipped
```
Covers opt-in default-off, bounded tick limits, ambiguous mail recorded as `reconciling` with exactly one provider-boundary call and no replay, revoked claim sending nothing, missing mail boundary making zero calls, acceptance receipt persistence, and the real `run_worker_loop` invoking the scheduler only when `ALM_BRAND_WORKFLOWS_ENABLED=1`.

```sh
cd web && ./node_modules/.bin/vitest run src/lib/actions/workflows.test.ts src/lib/workflows src/components/workflows   # 14 passed
cd web && ./node_modules/.bin/tsc -p tsconfig.json --noEmit                                                          # no errors in this lane's files
```
Covers owner-only scope (a submitted `owner_id` is ignored), readback-confirmed success instead of trusting a mutation response, failed readback producing no invalidation, unavailable model blocking save with zero RPCs and no provider call, grant commands never activating schedule or send, unauthenticated resource reads denied before any backend call, live grant check before downloading private artifact bytes, sandboxed same-origin delivery with `no-store`, and the UI rendering separate run/schedule/recipient permissions, recovered pause copy, reconciling (never "Sent") ambiguous delivery, and no leakage of injected provider receipts, storage paths or recipient emails.

RED before GREEN was observed for each slice, each first failing for the missing behaviour rather than a typo: missing `brand_workflow_save`; missing `brand_workflow_next`/`grant`/`control`; missing `tick`/`assert_dispatch`; missing `collect_reviews`; missing `resource`; missing `brand_update_workflow`; missing `lib/actions/workflows`; missing both route modules; missing owner component; and the real loop never calling the scheduler. Real defects were then exposed and fixed: the first `brand_workflow_next` resolved overlaps wrongly (an `exists ... instant > after` predicate admitted the second fall-back fold) and was replaced with the single-earliest-overlap form; the first `tick` had no staleness guard, so a stale `next_at` would have replayed a missed occurrence; and the artifact-link route needed the `sandbox`/`no-store` headers proved by test rather than assumed. One test fixture error (`intelligence_runs.evidence_snapshot_id` foreign key) was fixed in the test, not by weakening SQL.

## Remaining ports, limits and non-claims

- No qualified model exists, so no workflow can execute; `modelCatalog` entries stay `unavailable` and nothing in this lane defaults them to enabled.
- `brand_workflow_queue_occurrence` and the dispatch hook are published but not implemented here; scheduling pauses with zero calls until the parent connects canonical admission. Queued occurrences therefore stay `awaiting_admission` and `collect_reviews` finds no completed run.
- Mail is an injected boundary. This lane provides no provider credentials, no sender domain, no live mail verification and no ALM-scoped project configuration.
- Billing integration is not exercised end-to-end: `insufficient_credit` is only reachable through the canonical admission error text, not a real wallet in this fixture.
- The web tests are component/route-level with mocked server adapters; no browser, Playwright, build or Vercel preview was run. Screen reader and 320/390px checks were not performed.
- `web/src/lib/workflows/dto.ts` is a temporary typing shim for one server response, replaced by the generated contract above; it is not a second public wire schema and must not be extended.
