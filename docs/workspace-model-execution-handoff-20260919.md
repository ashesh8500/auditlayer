# Model execution lane handoff — 2026-09-19

## Outcome and truthful readiness

Implemented **standalone, opt-in execution primitives**, not a connected model picker or production generator. Existing generation/configuration untouched. Both candidate catalog entries remain explicitly unavailable for product selection. Public documentation review and fake-provider tests are not model entitlement, quality, latency or live capability probes.

Verification: `PYTHONPATH=worker python -m pytest worker/tests/test_model_execution*.py -q` → **43 passed in 0.96s**. Ran staged RED/GREEN cycles for missing usage normalization, catalog, execution, budgets, provider errors/timeouts, SDK/accounting and invalid settlement provenance. Timeout test observes a real child counter stop; duplicate-attempt test observes exactly one provider-boundary invocation. Tests exercise real parser, integer arithmetic, normalization and process termination; only provider/SDK and admission boundaries are offline substitutes. Scoped `git diff --check` clean. No full build, broad worker regression, service, deploy or commit performed.

No `.env`, credential store, personal/coding/subscription/shared profile, production service or database was read or modified. No authenticated model list request or paid inference call. Documentation access was public/unauthenticated.

## Existing path findings (read-only inspection)

- `generation.py`: `ReportGenerator` / `GenerationResult`; bounded evidence → JSON analysis → local `assemble_structured_report_html`. Existing generation usage is aggregated across formatting attempts and includes an estimated flag.
- `hermes_inprocess.py`: existing `AIAgent` call hardcodes DeepSeek V4 Flash, tool-free; uses session counters and substitutes character estimates if absent. This lane does not remove its old restriction or route new models through it.
- `intelligence/inference.py`: independent DeepSeek-only structured inference wrapper; converts token counts into floating cost without carrying complete estimation provenance. Not changed.
- `config.py` source defaults still carry $0.14/$0.28 per million tokens; those do **not** match today's public DeepSeek rates. Did not invoke `WorkerSettings.from_env` or read any environment file.
- Existing optional `openai` dependency supports the canonical released SDK interface. New `sdk.py` adapts public `with_options`, `chat.completions.create`, `model_dump`; no duplicate REST provider client, Hermes auto-provider resolution or new package/lock edit.

## Public source receipts and model decision

`worker/auditlayer_worker/model_execution/source_receipts.json` records sources and reviewed facts (observed 2026-09-19). This is a documentation receipt, not a provider response or live benchmark.

| Candidate | Exact public identity | Source rates per million tokens, USD | Decision |
|---|---|---|---|
| Economical default | Provider `deepseek`; callable alias `deepseek-v4-flash`; reported version `DeepSeek-V4-Flash-0731`; route `https://api.deepseek.com` | Peak input miss **0.44**, hit **0.014**, output **1.32**; off-peak **0.22 / 0.007 / 0.66** | Preserve default candidate. Version label is NOT assumed callable. Strict immutable dispatch unverified; SDK dispatch blocked. |
| Frontier alternative | Provider `openai` (NOT `openai-codex`); documented model/snapshot **`gpt-5.6-sol`**; route `https://api.openai.com/v1` | Input **4**, cached input **0.4**, output **20**; cache-write multiplier **1.25** | Public docs reviewed; no product entitlement or behavioral evaluation. Unavailable without explicit trusted deployment qualification. |

Sources:
- https://api-docs.deepseek.com/quick_start/pricing
- https://api-docs.deepseek.com/api/create-chat-completion
- https://developers.openai.com/api/docs/models/gpt-5.6.md
- https://developers.openai.com/api/docs/models/gpt-5.4 (reviewed first; dated `gpt-5.4-2026-03-05` exists, but not added as a third candidate)
- https://raw.githubusercontent.com/openai/openai-python/main/README.md

DeepSeek docs confirm JSON mode, tool calls, Responses and non-thinking mode; request enum lists aliases, not the dated version label. OpenAI docs identify GPT-5.6 Sol as flagship, support Chat Completions/Responses, structured outputs and reasoning effort `none`. They describe >272K input price uplift and promotional pricing at least through 2026-11-21. Adapter ceiling is 32K input/18K output, text-only, no tools, 150s maximum, standard service tier, one call. OpenAI worst-case admission uses **$5 input** (cache write), not $4; DeepSeek uses peak cache-miss price. No regional endpoint or additional billable tools accepted.

## Internal ports and invariants

These dataclasses are internal composition values, **not another workspace wire schema**. Read the shared lane's `docs/workspace-contracts-handoff-20260919.md` before connecting. Keep `contracts/workspace-v1` authoritative and map its generated worker types at integration.

- `catalog.Model` is an immutable, dated candidate/rate ceiling. `resolve` checks exact provider/model/data-route tuple; mutation of model/rate pins is rejected. `unavailable_reason` remains populated; don't expose these entries as available UI choices.
- `execution.Request` binds owner, subject, intent, attempt, model/rate/data-route, copied audit context, system/user content, token ceilings, timeout and empty tools. SHA-256 canonical request fingerprint includes the full internal request. This fingerprint format must be translated into the shared quote's `input_fingerprint` consistently at integration; it is not silently interchangeable with another lane's algorithm.
- `Executor(boundary, admission).execute(request)` requires a matching receipt **before** the provider process starts. `Admission.consume(attempt_id, expected)` is a narrow **trusted authority port**. Implement it against SQL: authenticate owner/subject, verify live reservation/expiry/config/quote pins, independently check customer and upstream cycle/run holds, and atomically consume the attempt. The adapter compares exact echoed owner/subject/intent/model/version/route/rate/fingerprint and worst-case customer/upstream bounds. A Python dictionary, qualification string or client request alone is NOT authorization.
- Local lock/set rejects repeated attempts on one executor. SQL must enforce replay protection across executors, workers and restarts, and supply a distinct paid admission for every separately authorized retry. Executor never retries or switches models/providers.
- `Boundary.count_input` is an explicitly supplied, qualified **local** tokenizer/upper-bound function that includes chat overhead. No character heuristic is silently treated as actual token usage. Missing/invalid/over-limit count fails before reservation/dispatch. Tokenizer and SQL admission implementations must have their own bounded execution; the hard process timeout bounds the provider call, not arbitrary caller-supplied admission code.
- `SDKBoundary` never constructs/discovers credentials. Trusted deployment composition supplies an isolated product SDK client, tokenizer and qualification receipt ID; an absent qualification fails closed. This string is a release attestation reference, not a self-authenticating proof, and must never come directly from a customer. It must certify exact model, tokenizer, product identity and capability probe. DeepSeek stays blocked even with a qualification ID until immutable dispatch support is resolved. Both public catalog entries stay unavailable until the release owner updates qualified product availability.
- SDK route rechecked, SDK retries disabled, redirects and environment proxy inheritance disabled, explicit max completion tokens/reasoning mode/service tier, `n=1`, no tools, no streaming. Completion itself occurs only in Linux killable child containment, with parent-death signal. Local kill **does not prove cancellation of upstream computation/billing**; unknown usage retains a reconciliation obligation.
- `parse_analysis` rejects provider HTML/fences and reuses the existing deterministic section, table, heading, duplicate-key, nonfinite and size validation/local escaping path in `core.assemble_structured_report_html`. It returns analysis JSON, not provider HTML. This does not replace final quality/evidence coverage gates or prove factual correctness.
- `NormalizedUsage`: `actual`, `estimated` or `unknown`; absent/malformed usage never becomes zero or actual. Legitimate actual zero is preserved. Cache/reasoning detail retained when present; no double-addition to totals. Actual tokens do not constitute an actual USD invoice.
- `Result` separates successful path / absorbed failure / pending reconciliation, usage, stable sanitized error, admission/fingerprint linkage and **rated** upstream estimate. `actual_upstream_microusd` remains `None` pending real cost provenance. Failed parsed responses preserve known usage; timeout/provider exception liability is unknown, never free.
- `accounting.summarize` includes failed attempts in upstream estimates, excludes them from customer charge projection, rejects duplicate attempts/receipts and multiple successful paths, and leaves unknown liability pending. Its 3× projection follows P-01 for this candidate, not a wallet write or settlement authority. Integrate with shared pinned retail rate cards/SQL instead of treating this projection as a charge. Cache/peak discounts are deliberately not presented as invoiced actual spend.

## Required integration / release blockers

1. Bind generated shared Quote/RunIntent/Reservation/UsageReceipt types and one canonical fingerprint/config/rate version. Populate authoritative shared rate cards only after review; this lane did not change the currently empty shared rates.
2. Implement real atomic SQL admission/consumption/settlement and durable attempt/result recording, including crash-after-send, expired reservations, cross-worker duplicate delivery and unknown upstream liability. Pure local tests do not establish financial concurrency safety.
3. Supply isolated product credentials and certified model-specific tokenizer/overhead; qualify SDK package version, schema support, refusal and usage behavior, prompt/report quality and latency under an explicitly approved spend cap. No such approval/paid probe was exercised here.
4. Resolve immutable DeepSeek pinning or explicitly revise the product pin policy. Do not turn `DeepSeek-V4-Flash-0731` into a guessed API model ID. Revalidate rates/terms before enabling either route (including promotional expiry/cache writes).
5. Integrate with generation only after the active refinement owner hands off. Keep research separately admitted; this adapter only handles tool-free report analysis. Preserve deterministic report renderer and final quality gate.
6. Wire failures/unknown usage to authoritative reconciliation before releasing holds; do not infer upstream cancellation from process termination. Run full regression and reviewed release integration separately.

## Files created

- `worker/auditlayer_worker/model_execution/{__init__,catalog,execution,containment,sdk,accounting}.py`
- `worker/auditlayer_worker/model_execution/source_receipts.json`
- `worker/tests/test_model_execution.py`
- `worker/tests/test_model_execution_executor.py`
- `worker/tests/test_model_execution_sdk.py`
- This handoff.

Only owned paths were written. No protected core/pipeline/config/runtime/client files, contracts, app, SQL, dependencies or lockfiles changed by this lane.
