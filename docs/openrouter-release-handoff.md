# OpenRouter production release handoff

## Implemented and verified locally

The existing queue-worker `build_generator` → `HermesReportGenerator` →
`InProcessHermesClient.chat` path now supports **ALM Auto → explicit DeepSeek V4
Flash 0731 through OpenRouter**. This is not `openrouter/auto`, a custom router,
a model picker, or a silent fallback. Existing direct DeepSeek configuration is
retained solely as an explicit rollback path. No schema/web files were changed.

- Uses the already locked OpenAI SDK (`openai==2.45.0` in the isolated test venv),
  fixed `https://openrouter.ai/api/v1`, explicit ALM key, zero SDK retries, no
  environment proxy inheritance or redirects. No engineering profile/config/key
  discovery on this inference path. Research still uses the existing Hermes tools.
- Exact model `deepseek/deepseek-v4-flash-0731`; tools absent, `n=1`, JSON object
  mode, reasoning disabled, non-streaming completion so the complete usage receipt
  is available. Existing progress/heartbeat remains; no latency improvement claimed.
- OpenRouter `provider.allow_fallbacks=false`, `require_parameters=true`, and
  per-token rate ceilings from existing worker pricing settings. No `models` or
  `route` fallback list. Returned model identity must match exactly; drift, refusal,
  truncation and provider errors fail rather than substituting another model.
- Existing Linux killable-call containment enforces at most 150 seconds, including
  SDK/network time. Parent-death cleanup retained. Refinement containment permits
  its nested bounded SDK child. Killing locally does not prove upstream billing
  cancellation.
- One analysis + at most one formatting correction, each pre-reserved against the
  stricter environment/app-settings token and USD cap. UTF-8 byte length plus chat
  overhead is a conservative **admission ceiling**, never actual token telemetry.
  Rejected/unknown calls retain their reserved liability; provider and reservation
  failures do not enter automatic queue replay. No retry engine was added.
- Production reports require a private `report_generation_runs` row. Before
  dispatch, the run's existing `stage_timings._inference` JSON stores a reserved
  receipt, then reads back that exact running row; failed persistence prevents
  inference. Completion/failure receipts are also saved before returning. Existing
  finalization persists stage durations plus allowlisted receipts. No new table.
- `Usage`/`CostBreakdown` retain provider `usage.cost` when supplied, including
  legitimate zero. Actual tokens alone produce `rate_estimated` USD, not actual
  cost. Missing/malformed usage stays `unknown`, with null token/cost values in
  receipts rather than fabricated measurements. Existing non-null aggregate
  columns retain known spend plus the legacy **estimated** research allowance;
  with unknown calls that aggregate is a lower bound, not an invoice. Read receipts
  for provenance. Failure/correction spend is included upstream, not projected as
  a customer charge. Refined report costs use the same cost structure; safe receipt
  metadata is logged and actual/unknown cost is retained on existing refinements.
- Receipts contain attempt/correlation IDs, requested/returned model, provider and
  response ID, upstream provider label, elapsed milliseconds, correction index,
  tokens, reserved USD, cost/source and status. No prompt, evidence or credential
  content. `_inference` is a reserved non-duration key: consumers must not sum all
  `stage_timings` values as floats.

## Evidence gate / product contract

Prompt contract is now **v1.13**. No web evidence, connected metrics, or supplied
context means `insufficient_evidence`, blocked **before inference**, no automatic
retry and no invented report. Supplied-context-only workflows can still produce a
review draft: deterministic score/metric item values become N/A, quality is 0 and
status is `needs_review`, not a qualified successful factual report. Connected-data
workflows remain available without web results. Existing tenant evidence filtering,
strict report JSON validation, local escaping/rendering and refinement HTML
sanitization remain. OpenRouter refinements return a strict one-key JSON envelope
`{"fragment":"<section>...</section>"}` before the existing HTML validator.

This is an evidence-absence gate, not proof that every cited statement is correct.
Human/live launch qualification must still inspect claims and provenance.

## Exact parent-owned configuration

Install the **user-authorized existing handoff key** as `ALM_OPENROUTER_API_KEY` in
the worker's protected service environment. This lane did not access, print,
install or test that key. Latest user direction authorizes it as ALM's key; do not
require a new/exclusive key or change its provider spending limit.

```dotenv
ALM_INFERENCE_PROVIDER=openrouter
ALM_INFERENCE_MODEL=auto
# ALM_OPENROUTER_API_KEY=<parent installs authorized value securely>
HERMES_MODE=inprocess
```

`ALM_INFERENCE_MODEL=auto` (or omitting that variable) resolves locally to
`deepseek/deepseek-v4-flash-0731`. An explicit exact ID is also accepted. The ALM
provider/model pair takes precedence over `HERMES_PROVIDER`, `HERMES_MODEL` and
mutable `app_settings.hermes_model`. The generic `OPENROUTER_API_KEY` is deliberately
not a fallback: map the authorized value to the product-specific variable.
`HERMES_API_BASE` is not the OpenRouter base and need not be changed.

Retain approved existing app token/cost limits. The existing environment defaults
remain `AUDITLAYER_TOKEN_CAP=120000`, `AUDITLAYER_COST_CAP_USD=3.0`,
`AUDITLAYER_PRICE_IN_PER_MTOK=0.14`, `AUDITLAYER_PRICE_OUT_PER_MTOK=0.28`. The last two
now also act as OpenRouter endpoint price ceilings, NOT claims about the catalog's
minimum prices or an account spending-limit change. A route unable to honor them
fails visibly. `HERMES_TIMEOUT_SECONDS` is capped to 150 per model call. Poll
interval remains 5 seconds; Instagram collection pool/reuse is unchanged.

`release-preflight` retains all existing schema/runtime/drain requirements and
adds a non-mutating `GET /api/v1/key` metadata probe for the configured ALM key.
It returns safe limit/remaining/usage/expiry metadata. Null provider limit is
reported honestly and **not rejected or changed**. Exhausted bounded keys and
failed metadata probes fail preflight. This does not replace application admission.

Deploy the reviewed **worker/** source (including `openrouter.py`) and existing
unchanged dependency lock via the canonical drain/archive/parity workflow. No
service units, rollback mechanics, deployed venv, account homes, or profile bundle
were modified here. Parent owns secret installation, live bounded qualification,
preflight, deployment and restart. Never copy a local `.env` over production.

## Public model receipts (unauthenticated, no paid inference)

Read `https://openrouter.ai/api/v1/models` during this task:

| Exact callable ID | Catalog canonical slug | Catalog minimum input/output USD per token |
|---|---|---|
| `deepseek/deepseek-v4-flash-0731` | `deepseek/deepseek-v4-flash-20260731` | `0.00000004` / `0.00000008` |
| `deepseek/deepseek-v4-flash` | `deepseek/deepseek-v4-flash-20260423` | `0.00000003556` / `0.00000007112` |

These are **different revisions**, not assumed aliases. The dated July revision
is closest to the previously documented direct DeepSeek Flash 0731 default. Its
catalog lists text input/output, `response_format`, `structured_outputs`,
`max_tokens`, `temperature`, optional reasoning (`mandatory=false`), and tools.
We do not enable tools. Catalog presence/capability metadata is not a paid response
qualification, immutable-weight guarantee, or guaranteed eligible provider route.

Usage/API documentation read:
- https://openrouter.ai/docs/api/reference/overview
- https://openrouter.ai/docs/guides/guides/usage-accounting

The parent probe must verify exact returned model identity, JSON/refusal behavior,
reasoning-disabled acceptance, actual cost receipt, and an evidence-bearing report
under the approved run cap. Do not normalize a drifted identity silently.

## Commercial integration boundary

Worker `Plan` now recognizes `brand` and `studio` instead of silently mapping them
to Free. Their admission is SQL credit/cycle/brand-based, not legacy lifetime report
counts. Empty handles remain rejected. Existing Free/Starter/Pro purchased report
contracts are preserved; ordinary queue recalibration already trusts prior atomic
intake rather than recharging entitlements.

The commercial owner must verify atomic admission/settlement for approved Free
500/month + 500 welcome, Brand $199/5000 credits/1 brand, Studio $499/15000/5 brands.
This worker does **not** implement or debit those wallets. Per-run upstream holds
are not a cross-worker account wallet/circuit breaker. SQL must own account-wide
limits, duplicate intake/attempt protection, and failure credit release/noncharge;
unknown upstream liability requires reconciliation before replay. No parallel
billing/dashboard system was introduced. Provider-level limit is left unchanged.

The separately opt-in `workspace_execution`/`model_execution.SDKBoundary` candidate
lane and standalone typed-intelligence adapter are not silently activated or
rerouted by this change. ALM Auto in the ordinary claimed report queue is wired;
any new workspace Auto endpoint must use this canonical queue/config path or be
integrated explicitly by its owner, not bypass admission with the experimental
candidate executor.

## Research setup remains separate

OpenRouter supplies inference, not search credentials. Configure an effective
service-owned Hermes research backend (prefer `EXA_API_KEY` or `TAVILY_API_KEY`;
existing alternatives `BRAVE_SEARCH_API_KEY`, `SEARXNG_URL`, `FIRECRAWL_API_KEY` /
`FIRECRAWL_API_URL`). Confirm the actual service environment/toolset, probe real
search separately, and inspect evidence-bearing output. Do not treat the old
three-report structural score of 100 with zero evidence as factual launch quality.
No duplicate model/retrieval call optimization or speed improvement was claimed.

## Tests and remaining gates

Isolated worktree `uv sync --frozen --extra embedded`; no deployed venv mutation.
RED/GREEN cycles covered SDK payload/cost, unknown usage, provider failures/drift,
pre-call holds, read-backed persistence, Auto/config isolation, preflight metadata,
commercial plan recognition, nested process containment, evidence degradation,
refinement receipts, and pipeline actual-cost accounting.

- Focused (from `worker/`): `.venv/bin/pytest tests/test_openrouter_production.py tests/test_openrouter_pipeline.py tests/test_generation_runtime.py -q` → **63 passed**.
- Broader (from `worker/`): `.venv/bin/pytest -q --ignore=tests/test_refinement_parser_crosslang.py` → **874 passed, 12 skipped, 3 warnings**.
- Initial full suite exposed ten cross-language failures because this isolated
  worktree has no web `parse5` dependency. Confirmed by direct Node import
  (`ERR_MODULE_NOT_FOUND: parse5`). No web/dependency files were changed to bypass
  that ownership boundary. Parent must rerun the full suite after web deps exist.
- Existing three multiprocessing/fork deprecation warnings remain in the workspace
  execution tests. New bounded SDK tests use local fixtures, no paid calls.
- `git diff --check` clean. Live model capability/evidence quality, deployed parity,
  SQL financial concurrency and full cross-language release gate remain parent-owned.
