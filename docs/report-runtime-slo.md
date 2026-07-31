# Report Runtime SLO and Measurement Contract

This contract defines when AuditLayer report generation is fast, token-efficient, stable, and qualitatively acceptable. It applies to the production worker and disposable live benchmarks.

## Runtime shape

One report attempt is a deterministic pipeline:

1. Load the owner-scoped report bundle and cached evidence.
2. Start fresh connected-platform retrieval, when applicable.
3. Run the fixed public evidence sweep in parallel, unless a valid cache is reused.
4. Wait a bounded time for connected metrics.
5. Make one tool-free DeepSeek V4 Flash structured-analysis call.
6. Allow one formatting-only correction call when local schema validation rejects the first response.
7. Validate, score, render, quality-check, store, and finalize locally.

The model cannot browse, spawn children, select retries, write state, or author report HTML. There is no fallback provider. Production remains pinned to provider `deepseek`, model `deepseek-v4-flash`.

## Stability controls

- Hermes API attempts per model call: 1.
- Hermes turns per call: 3 maximum.
- Per-call provider timeout: 150 seconds.
- Connected Instagram wait: 30 seconds.
- Automatic audit retries: 1.
- A retry reuses the successfully collected research evidence instead of rerunning the web sweep.
- Formatting/schema failure after the bounded correction is non-retryable and moves to founder review.
- Stale generation-run records are marked `crashed` by the worker control plane.
- Two worker processes remain isolated and claim work atomically.

## Metrics

Every production attempt records one private `report_generation_runs` row with:

- report type and account signal mode;
- fresh, reused, or resume cache mode;
- total latency and per-stage latency;
- input/output tokens and estimated cost;
- evidence item count and formatting-correction usage;
- deterministic quality score;
- terminal status and bounded error code;
- model, prompt version, worker, and bundle lineage.

Raw handles, report content, customer context, credentials, and traceback text are never stored in runtime metrics.

## Release gates

Evaluate current live measurements by report type and account mode. Historical unbounded runs must not be mixed into the release sample.

| Metric | Release target | Hard stop |
|---|---:|---:|
| Success or deterministic `needs_review` rate | at least 95% | below 90% |
| p50 total latency, Standard | at most 120 s | above 180 s |
| p95 total latency, Standard | at most 240 s | above 330 s |
| p95 total latency, Pulse | at most 120 s | above 180 s |
| Average cost, Standard | at most $0.25 | above $0.50 |
| Combined tokens, Standard | at most 20,000 | above 40,000 |
| Deterministic quality score | at least 90 | any blocker |
| Service restart delta during benchmark | 0 | any new restart |
| Cross-tenant connected-metric fallback | 0 | any occurrence |

Extended and Enterprise reports have larger output contracts. They are reported separately and never allowed to hide Standard or Pulse regressions in a blended average.

## Benchmark matrix

A disposable live benchmark must cover at least:

- a public personal creator;
- a public business/organization;
- a connected Instagram account when an owner-scoped active connection is available;
- Pulse, Standard, Blueprint, and Extended report structures across the suite;
- one fresh-evidence path and one cache-resume path.

Benchmark output is local and does not create customer audits, consume entitlements, replace report artifacts, or write customer-facing rows. The production worker deployment is accepted only after the same code and profile bundle pass the live benchmark, worker health settles, restart counts remain stable, and public health routes pass.
