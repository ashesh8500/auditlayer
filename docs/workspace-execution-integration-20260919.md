# Workspace execution integration — 2026-09-19

## Integration API (implemented and exercised offline; not release evidence)

Policy is exactly `P-01.v1`. New additive SQL will expose service-only `workspace_execution_admit(p jsonb) -> uuid`, `workspace_execution_dispatch(p jsonb) -> jsonb`, and `workspace_execution_finish(p jsonb) -> uuid`. Admission wraps `workspace_credit_reserve` in the SAME transaction as binding canonical RunIntent, reservation UUID, existing audit UUID, existing intelligence run UUID, request fingerprint and a worker lease. Dispatch serializes on profiles then execution row, rechecks ownership/context/lease/policy/held ledger reservation and consumes the one dispatch marker. A consumed marker NEVER returns another dispatch permission, including after transport ambiguity, timeout, process restart or lease expiry. No retries of provider calls.

Billing: keep credit RPC APIs; internal flat reserve projection is explicit, generated RunIntent/UsageReceipt validation precedes SQL. Finish requires exact receipt/intent/reservation/model/rate/refs linkage; artifact linkage is an existing immutable audit_report_versions row for the same audit and intelligence run. Unknown upstream remains NULL and zero customer charge; no conversion from rated estimate into actual provider spend. Finish and credit_finish share one transaction and immutable duplicate payload. Lost responses retry only finish, never dispatch.

Workflow lane: do not route old jobs to new models. Pipeline gains explicit workspace execution port; absent port remains legacy. New workspace jobs require trusted qualification/config and prepaid evidence; analysis has no tools and no implicit unbudgeted research. Scheduled dispatch remains denied until a live grant authority is wired, rather than treating stored consent as current schedule authorization.

## Exact service adapter fields (frozen for sibling integration)

Migration CLI generated `20260919221938_workspace_execution_lifecycle.sql`.

- `workspace_execution_admit(p)`: `{intent: <validated RunIntent>, reservation_id: UUID, audit_id: UUID, intelligence_run_id: UUID, attempt_id: UUID, worker_id: nonempty string, lease_seconds: integer 1..300, expected: <Executor expected mapping>}`. Returns reservation UUID. `expected` contains owner_id, subject_id, intent_id, request_fingerprint (bare SHA256 of Request dataclass canonical JSON), provider/model/model_version/data_route/rate_card_version, upstream_max_microusd/customer_max_microusd. Quote input_fingerprint is `sha256:` + that fingerprint. Reuse EXACT payload for lost-response retry. Existing audit and intelligence run must already exist; admission transaction binds them and reserves ledger atomically. This RPC is worker admission, not a customer create-audit API. Billing submission must create the existing audit/run in its transaction before calling this or queue a canonical intent for a qualified worker to admit; no plain credit_reserve-only dispatch.
- `workspace_execution_dispatch(p)`: `{reservation_id, attempt_id, worker_id, expected}`. Returns `expected` plus `receipt_id` (stable attempt UUID). Duplicate ALWAYS raises `dispatch_consumed`; never retry dispatch on an ambiguous response. SQL checks the authoritative row lease, audit worker claim, confirmed context, owner, live credit cycle and revocation.
- `workspace_execution_finish(p)`: `{reservation_id, receipt: <validated UsageReceipt>, artifact_version_id: UUID|null}`. Exact replay returns reservation UUID. Report version must match bound audit + intelligence run. Actual succeeded requires artifact; failed disallows artifact; pending may link an artifact but releases customer hold with upstream NULL. SQL calls credit_finish in the same transaction.
- `workspace_execution_revoke(p)`: `{owner_id, reservation_id}`; revokes the pending run grant under profile/execution locks; does not pretend to cancel a dispatched provider call or erase liability.

- `workspace_execution_publish(p)`: `{reservation_id, receipt, report_path, delivery_status (ready|needs_review), prompt_version, agent_bundle_version}`. Returns the immutable `audit_report_versions.id`. Calls the real `finalize_initial_report`/`finalize_regenerated_report` (chosen from `audits.report_path`), then `workspace_execution_finish` with that artifact, then links the receipt to the bound `intelligence_runs` row in the same transaction. Exact replay returns the same artifact id; a different payload is `publication_mismatch`. The worker stores report bytes at the deterministic path `{audit_id}/workspace/{attempt_id_hex}.html`.

**Schedule authority (live, not stored).** A `trigger='schedule'` intent is admitted only when it names a `schedule_id` that is a durable `brand_workflow_occurrences` row in state `awaiting_admission`, whose workflow/version/subject/context exactly match `quote.refs`, whose workflow is active and whose run **and** schedule grants are currently granted — checked by calling the workflow lane's own `brand_workflow_assert_dispatch`. Direct RPC callers cannot fabricate that row. Dispatch re-runs the same live check, so revoking a grant between admission and dispatch stops the provider call (`workflow_permission_denied`). Manual intents are unaffected.

**Workflow lane's remaining port:** `brand_workflow_queue_occurrence(jsonb)` is still a stub in `20260919221848_brand_update_workflow.sql`; it must create the audit row, the evidence snapshot, the intelligence run and the deterministic quote for the occurrence's resolved confirmed context, then call `workspace_execution_admit` with `trigger='schedule'`, `schedule_id=occurrence_id` and the issue time as `attempt_id`, and return `{audit_id, intelligence_run_id, reservation_id}`. Do not emulate it with ledger-only `workspace_credit_reserve` (the lane's own comment forbids it, and it would bypass dispatch authority).

## Verification (executed, offline)

```sh
python supabase/tests/workspace_execution_test.py
worker/.venv/bin/python -m pytest worker/tests/test_workspace_execution.py -q
worker/.venv/bin/python -m pytest worker/tests -q
```

Observed:
- Disposable PostgreSQL 16/pgvector (`alm-execution-<uuid>`, random ephemeral loopback-only port, no bind mounts, unconditional cleanup of only its own container; no URL/env override accepted): `PASS real SQL atomic admission and cross-process one-dispatch`, `PASS revocation, pending unknown liability, artifact linkage and concurrent exactly-once settlement`, `PASS actual report finalizer and receipt atomically linked; lost-response retry stable`, `PASS scheduled admission bound to durable occurrence and live revocable grants`. The preceding canonical migration chain is applied first, so this runs against the real billing/refinement schema, not hand-made copies.
- `worker/tests/test_workspace_execution.py`: 5 passed (real SQL through the port, both failed and successful provider outcomes, gateway wire shape).
- `worker/tests`: 831 passed, 11 skipped — no regressions in the legacy generator, pipeline, or model-execution suites.

Key assertions: at most one dispatch across concurrent processes and after a lost response; a duplicate dispatch is `dispatch_consumed` even with a valid lease (so an ambiguous provider call can never be re-executed); a provider exception leaves `actual_upstream_microusd` NULL with zero customer debit and no fabricated rated cost; the immutable artifact version, `workspace_credit_reservations` debit and `workspace_executions` terminal payload commit in one transaction; a different receipt payload for a settled execution is `receipt_mismatch`; `anon`/`authenticated` cannot execute or read execution rows.

## Canonical rate/model DTO additions needed in the shared schema lane (not duplicated here)

The execution lane deliberately added **no** second catalog and **no** new wire schema. For the parent shared-contract lane to make execution legitimately dispatchable, extend `contracts/workspace-v1` exactly as follows:

1. `ModelOption.available` should require, in addition to a rate version and a null unavailable reason, a **qualification reference**: a new required field (e.g. `qualification_id` plus `qualified_at`) naming an ALM-controlled evaluation/config record. `workspace_execution` refuses to construct without it; the schema should make the same statement so an unavailable model can never be presented as selectable.
2. `rateCards` must be populated with dated, evidenced rates before any model is offered — the execution port reads rates only through the pinned `Model`/`RateCard`, so an empty catalog means unavailable, not free.
3. `Quote.model` already carries the full `ModelPin`; no change needed there. Keep `input_fingerprint` as `sha256:` + the canonical `Request` fingerprint (admission recomputes it in SQL and rejects a mismatch).
4. Optional but recommended: a canonical `MeasurementQualification` marker distinguishing *provider-reported actual* from *SDK-counter estimated*. The lane treats SDK token counters as estimated and only a trusted provider usage record as actual; the schema currently permits `measurement: "actual"` with no such evidence, so SQL is the only guard today.

## Remaining qualification blockers (explicit, unresolved)

- Neither catalog candidate is product-qualified. `deepseek-v4-flash` remains non-dispatchable (alias without immutable version proof); `gpt-5.6-sol` needs ALM credential, tokenizer and behavioural qualification before `available` is true. No provider call, credential read or spend occurred in this lane.
- Rate-card population and the exact model/rate values are the parent/shared-schema owner's decision; this lane invents none.
- Successful executions publish as `needs_review` with a pending receipt until the deterministic report templates are bound to a separately admitted evidence job; the submission/consent UI to create `intelligence_runs` from a canonical intent belongs to the billing/web lane.
- Policy identifier coupling: admission validates canonical `P-01.v1`, while the credit-ledger RPCs carry their own `p01.v1`. The ledger test discovers the ledger constant at runtime; the parent must resolve the identifier in the canonical contract (already flagged in the ledger handoff) so both agree.
- Paid enrolment remains blocked on the unresolved legal/retention terms from the release scope.

## Worker-side wiring (owned by this lane)

`GenerationPipeline.run(..., workspace_execution=<port>)` is an explicit opt-in. With no port the legacy generator path is byte-for-byte unchanged (paid/gift/trial/queued work keeps its contract); a workspace run additionally requires `persist_report=True` and a `gateway`, so it can never execute without durable admission.

`worker/auditlayer_worker/workspace_execution.py`:

- `WorkspaceExecution(intent=..., request=..., reservation_id=..., intelligence_run_id=..., worker_id=..., boundary=..., qualification_id=..., bundle_version=..., lease_seconds<=300)`. It validates the canonical `RunIntent` through the generated `validate`, and refuses to exist unless the canonical quote and the bounded `Request` agree exactly (intent/owner/subject ids, model pin, rate-card version, `input_fingerprint == 'sha256:'+request_fingerprint`, both Money caps) and `qualification_id`/`bundle_version` are non-empty. `tools` must be empty: the analysis adapter is tool-free and there is no implicit research budget.
- `SQLAdmission.consume` calls `workspace_execution_admit` then `workspace_execution_dispatch` and returns the dispatch payload. Both calls are single-shot: an ambiguous transport error propagates and is never retried, so the SQL `dispatch_consumed` marker is the only replay guard needed.
- `attempt_id` is the durable attempt identity. For scheduled occurrences the workflow lane's queue stub must pass the occurrence issue time as `attempt_id` (matching the occurrence's `attempt_id`/dedupe key); the trigger and `schedule_id` come from the occurrence, not from the worker.
- Receipt construction: SDK token counters are `estimated`, never `actual` — cost fields stay NULL, `customer_charge` is 0 and the execution settles as `pending_reconciliation`/`released` with the upstream hold retained. A malformed/unsupported provider response is the same zero-charge pending path. Only the workflow/billing lane's trusted provider usage record may produce an `actual` receipt, and never for the engine's own retries.
- On a validated analysis the port renders with the existing `assemble_structured_report_html`, uploads to the deterministic attempt path, and calls `workspace_execution_publish`, so artifact version, receipt and ledger debit commit together.
- `SupabaseGateway.workspace_rpc(name, payload)` sends the SQL adapter shape `{"p": payload}`, allow-lists the five execution RPCs, and does not retry. `SupabaseGateway.upload_workspace_report(audit_id, attempt_id, html)` uses `{audit_id}/workspace/{attempt_id_hex}.html` so a lost response re-uploads identical bytes instead of allocating a second object.

## Owned files

- `supabase/migrations/20260919221938_workspace_execution_lifecycle.sql` (new, created with `supabase migration new`; the workflow lane's live schedule-authority branch was integrated into this file by that lane)
- `supabase/tests/workspace_execution_test.py` (new; real disposable PostgreSQL)
- `worker/auditlayer_worker/workspace_execution.py` (new)
- `worker/auditlayer_worker/model_execution/execution.py` (`request_expectations` extracted so admission and the SQL projection cannot drift)
- `worker/auditlayer_worker/pipeline.py` (opt-in port only; no legacy branch change)
- `worker/auditlayer_worker/supabase_client.py` (`workspace_rpc`, `upload_workspace_report`)
- `worker/tests/test_workspace_execution.py` (new)
- this handoff

No dependency, lock, contract, schema or generated-projection file was touched; `jsonschema`/`openai` availability in the worker venv was consumed, not modified.

## Evidence run by this lane (2026-09-19, offline)

```sh
python supabase/tests/workspace_execution_test.py
worker/.venv/bin/python -m pytest worker/tests/test_workspace_execution.py worker/tests/test_model_execution.py worker/tests/test_model_execution_sdk.py worker/tests/test_model_execution_executor.py -q
worker/.venv/bin/python -m pytest worker/tests -q
python supabase/tests/workspace_credit_ledger_test.py
```

Observed: the SQL harness printed four PASS lines (disposable `alm-execution-<uuid>` containers, random ephemeral loopback ports e.g. `127.0.0.1:32882`; only its own container is removed); the targeted worker run reported `49 passed`; the full worker suite reported `837 passed, 11 skipped`; the credit-ledger lane's own harness still reported its 11 PASS lines. Both model candidates remain unqualified, so no provider client was constructed, no credential or environment value was read (asserted by a guard test), and no paid call ran.

