# Live generator baseline — 2026-09-18

Executed deployed `/opt/auditlayer/worker` (pre-release code/profile) as its normal `auditlayer` service user via the canonical `run_live_benchmark` API, repeats=1, include_connected=true, isolated output/account-home root `/tmp/alm-launch-model-baseline`. Customer report persistence disabled; benchmark telemetry permitted. No customer report/history uploads or mutations. JSON and private stdout are under that root, mode-restricted.

## Observed results

- personal creator Standard: ready, 37.180 seconds; model analysis 33.963 seconds.
- wellness business Standard: ready, 34.820 seconds; model analysis 33.554 seconds.
- company public Pulse: ready, 10.610 seconds; model analysis 8.985 seconds.
- company connected Standard: failed before inference, 1.950 seconds, `connected_metrics_unavailable` / reconnect_required.
- Overall benchmark verdict: FAIL (3/4 ready). This is NOT a valid full-data quality/launch pass or a before/after performance claim.
- Structural report quality checker returned 100 for the three produced HTMLs. All three had **zero verified web evidence**. Never present structural quality as factual/evidence quality.
- Cost fields include the product's base accounting charge (including 0.12 on the zero-model connected failure), so they are not provider-invoice measurements.

## Root causes confirmed

1. Benchmark selected an `is_active=true` company row despite `connection_status=reconnect_required`. A metadata-only query of all three stored company connection rows confirmed all reconnect_required, graph_api_family null; one expired, two future expiry. None is a usable connected authorization. Worker follow-up will filter eligibility before LIMIT rather than treating is_active alone as usable. A skipped connected case is still UNVERIFIED, not a green full-data gate.
2. Managed web research logged `Firecrawl client initialization failed: missing direct config and tool-gateway auth`; fallback index requests failed with HTTPError. Safe presence-only checks of the live worker environment, worker .env, ALM .env and ALM Hermes .env found no configured Exa/Tavily/Firecrawl/Brave/SearXNG backend or tool-gateway credentials. Personal/default-profile keys were not copied into ALM.

## External follow-up

Fresh normal Meta authorization for the company account is needed before the connected production acceptance run. User was asked via UI; no response received. Separately provision an ALM-scoped supported research backend and exercise it as the service user. Do not replace missing evidence with invented output or claim go-to-market readiness based on these runs.
