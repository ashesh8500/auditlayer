# Workspace v1 contracts handoff

Integration API (implemented and verified offline):
- TS `@/lib/workspace-contracts`: exported types `Money`, `ModelOption`, `RateCard`, `Quote`, `RunIntent`, `UsageReceipt`, `Wallet`, `WalletLot`, `WorkspaceError`, `Reservation`, `PinnedRefs`; `validate(name, value)` returns typed data or throws; `policy` is P-01 versioned configuration; `rateCards` is empty until evidenced rates are supplied.
- Python `auditlayer_worker.workspace_contracts`: identical named TypedDict models, `validate(name, value)` returns validated data or raises `ValueError`; `policy`, `rate_cards` data exports.
- Source: `contracts/workspace-v1/schema.json`, `policy.p01.v1.json`, `rate-cards.json`, `fixtures.json`.
- Generation: `python scripts/generate_workspace_contracts.py`; drift: same command `--check`.

Money is `{currency: "USD", microusd: integer}` (0..9007199254740991). Rates use integer microusd per million tokens (tools per call). Display credits are not the accounting unit.
References use `owner_id`, `subject_id`, `context_version_id`, `workflow_id`, `workflow_version_id`, `policy_version` (`P-01.v1`), `contract_version` (`workspace.v1`); UUID identifiers, never email. Models pinned with `provider`, `model`, `model_version`, `data_route`. Quote binds refs, model, `rate_card_version`, `input_fingerprint`, `customer_max`, `upstream_max`, `expires_at`. Run intent binds immutable quote plus idempotency key; SQL must verify current owner, matching input/model/config, expiry and all admission caps transactionally.

SQL remains source of truth: wire validation does not perform authorization, wallet arithmetic, expiry admission, ledger allocation, provider dispatch or settlement. No automatic model fallback or legacy conversion. Legal/retention terms remain enrollment blockers; no live rates are invented.

## Field semantics / integration responsibilities

- `ModelPin`: `provider`, `model`, `model_version`, `data_route` are required exact pinned strings. SQL/catalog resolution must reject aliases and validate the requested pin against configured credentials, evaluated capabilities and the matching immutable rate card. Shape validation does not establish provider availability. `ModelOption.available` requires a rate version and null unavailable reason; unavailable options require a reason. `allowed_tools` is an explicit list; no default grants.
- `RateCard`: integer `input_microusd_per_million_tokens`, `cache_read_microusd_per_million_tokens`, `cache_write_microusd_per_million_tokens`, `output_microusd_per_million_tokens`; `tool_rates` is `{tool, microusd_per_call}[]`. Rates are fixed reference costs; apply policy `retail_reference_multiplier` once, not twice. `source_url`, `verified_at`, `effective_at`, `version` and `model` pin provenance. Fixtures use explicitly synthetic `.invalid` provenance; they are never the product catalog.
- `RunIntent`: `id`, immutable `quote`, `idempotency_key`, `requested_at`, `consent: {model_data_route: true, customer_max: true}`, `trigger`, nullable `schedule_id`. Quote identifies owner/subject/context/workflow; authorize those IDs against SQL, not caller claims.
- `Reservation`: `id`, `run_intent_id`, `quote_id`, `refs`, `customer_reserved`, `upstream_reserved`, `status`, `created_at`, `expires_at`.
- `UsageReceipt`: identity/refs/model/rate version, `measurement`, `status`, token/tool counters, `customer_charge`, `successful_path_upstream_cost`, `absorbed_retry_upstream_cost`, `total_upstream_cost`, `settled_at`. Actual settled successes/failures require measured counters and costs. Failures have zero customer charge. Estimated/unknown remain pending with zero charge and null settlement timestamp; unknown counters/costs are null, never fabricated zeros. `total_upstream_cost` must capture all upstream liability including terminal failures. SQL checks cost reconciliation and enforces exactly-once billing; retries and terminal failures are ALM cost. These contracts intentionally do not calculate charges or execute state transitions.
- `Wallet`: owner/policy/currency, exact `stripe_subscription_id`, `stripe_period_start`, `stripe_period_end`, aggregate `balance`, `reserved`, cycle consumption/purchases/upstream exposure and `lots`. Each lot has `id`, `kind`, `granted`, `balance`, `reserved`, `consumed`, `granted_at`, `expires_at`, `stripe_source_id`. Interpret balance as remaining unconsumed value (including reserved); available = balance minus reserved. SQL must check aggregate equality, nonnegative availability and allocation order. Expired lot value is not spendable regardless of a stale projection.
- UTC timestamps use `...Z`, calendar-valid dates and at most six fractional digits. UUID references are lowercase standard UUIDs, not emails. Fingerprints are `sha256:` plus 64 lowercase hex digits. All object fields are required (explicit nulls where supported); unknown fields reject at every nesting level. Monetary maxima and counts are JSON safe integers.

## Implementation and dependency boundary

Runtime validation delegates to existing Zod `fromJSONSchema` (tested 4.4.3) and Python `jsonschema` (tested 4.26.0), rather than implementing another validator. The small generator projects only this closed schema vocabulary into TS aliases and Python TypedDicts, including discriminated unions; it is not a general JSON Schema compiler. Generated validators/data are colocated, so neither production consumer needs the repository source directory. Python TypedDicts are static models: call `validate` explicitly at every wire boundary; constructing a dict does not validate it.

**Dependency closure (parent):** declared `jsonschema==4.26.0`, reconciled `worker/uv.lock`, and synced the isolated worker development environment with the frozen lock. Parent reproduced all 3 contract tests and all 62 cross-runtime fixtures plus generation `--check`. Built an actual wheel and installed it into a separate Python 3.13.13 environment outside the repository; verified packaged `data.json`, exact `P-01.v1` policy and runtime Money validation. A first smoke environment defaulted to unsupported Python 3.14; that result is superseded by the explicitly supported 3.13.13 run. This is package/runtime proof, not production deployment.

## Verification

Executed:
```
python scripts/generate_workspace_contracts.py
python -m unittest scripts.tests.test_workspace_contracts -v
python scripts/generate_workspace_contracts.py --check
```
Result: 3 tests passed; 62 shared fixtures passed in both Python and TS; isolated TS strict typecheck passed; explicit NaN/+Infinity/-Infinity rejection passed. Generation is byte-reproducible; `--check` detects a deliberately corrupted projection in a disposable directory without repairing it. Source Draft 2020-12 schema validity and exact P-01 values are asserted. Tests check every named contract has valid and invalid fixtures, missing/unknown fields, invalid references/dates, USD-only, negative/fractional/overflow values, receipt settlement safety, and unavailable-rate safety.

Observed RED before GREEN: missing generator; missing fixture corpus; invalid receipt charge/settlement combinations; available model without rate version. An additional runtime mismatch revealed that jsonschema's optional date-time checker was absent in this environment; generated Python now registers a stdlib calendar checker, with the shared malformed-month case proving parity. Final `--check` reports `workspace.v1: projections match`.

This proves the shared boundary and reusable policy, not end-to-end billing, provider execution, enrollment or deployment. Parent lanes must bind these contracts to atomic SQL authority, preserve legacy report entitlements, implement consumption/rounding with integer arithmetic, verify exact provider pins/rates, and resolve the explicitly blocked legal/retention policy before enabling enrollment.
