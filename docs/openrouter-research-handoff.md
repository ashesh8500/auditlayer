# Fixed OpenRouter Exa research handoff

## Scope and release state

This is an **opt-in, new quote contract**, not activation or qualification. No catalog
row, qualified rate, feature flag, allowance, production configuration, or existing
quote is changed by the migration. Free (500 monthly + 500 welcome), Brand
($199 / 5,000), Studio ($499 / 15,000), and existing contracts are unchanged.
Top-ups remain closed. No new business/legal terms are introduced.

The commercial ordinary queue now supports one fixed research stage before its
existing analysis and optional formatting correction. All calls use the product
`ALM_OPENROUTER_API_KEY`, exact `deepseek/deepseek-v4-flash-0731`, and the existing
killable SDK process boundary. Research alone sends:

```json
{"plugins":[{"id":"web","engine":"exa","mode":"fast","max_results":3}]}
```

There is no engine/model router, model-selected tool, SDK retry, Yahoo fallback,
URL fetch, or alternate vendor key on this path. Old quotes retain their old
collector, tariff and budgets; they cannot silently acquire research spend.

## Explicit candidate bounds (not qualified configuration)

The versioned `commercial_runtime_catalog.research_policy` must be exactly:

```json
{
  "version": "openrouter-exa-fast-v1",
  "context_tokens": 1310720,
  "output_tokens": 256,
  "search_fee_microusd": 7000,
  "reservation_microusd": 190573,
  "aggregate_token_cap": 1398976
}
```

For the example report pin `max_input_tokens=32000`, `max_output_tokens=12000`,
`max_calls=2`, input/output ceilings `140000/280000` micro-USD per million:

- Research reserves **1,310,720 input + 256 output tokens**, and **$0.19057248**.
  SQL rounds the research envelope up to **190573 micro-USD**.
- Report envelope: **15,680 micro-USD** for two calls.
- Shared upstream quote ceiling: **206253 micro-USD ($0.206253)**.
- Existing 3× reference tariff maximum: **618759 micro-USD ($0.618759)**.
- Aggregate reserved tokens: **1,398,976**. Report input remains at most 32k;
  this does not relax report generation, correction or output validation.
- The old `research_microusd` allowance **must be zero** with this policy.
  `data_api_allowance_usd` remains zero for commercial work.

The aggregate formula is `1310976 + (max_input_tokens + max_output_tokens) *
max_calls`; SQL and Python both validate it. Rates/context/fee are fixed by this
version. A provider catalog/rate change requires explicit review and a new
contract, not an automatic price or model fallback. `max_results=3` is **not**
an input bound. Before live qualification, independently refresh the accepted
OpenRouter catalog/context and Exa fee and retain those artifacts.

For ordinary execution the operator must explicitly authorize **both**:

- Worker `AUDITLAYER_TOKEN_CAP >= 1398976` and
  `AUDITLAYER_COST_CAP_USD >= 0.206253`, with `HERMES_MAX_TOKENS >= 256`
  (12,000 is the candidate report output ceiling).
- `app_settings.token_cap >= 1398976` and `app_settings.cost_cap_usd >= 0.206253`.

These are prerequisites, **not instructions to raise global caps automatically**.
The implementation changes no defaults, never bypasses smaller operator/app caps,
and returns `research_operator_budget` with exact required values before dispatch.
The claimed run is blocked and known-zero upstream/customer settlement is recorded.
A smaller explicit report envelope changes the aggregate requirement by the formula
above. Parent/operator owns deciding and pinning the accepted caps.

## Accounting, persistence and evidence

SQL canonical snapshots omit a null new column, preserving the JSON semantics and
signatures of historical quotes. New snapshots include the complete research policy
and existing `rate_version`. Submit/claim reject catalog drift; existing immutable
wallet admission, owner isolation, replay fences and report-artifact settlement
remain in place. The additive migration extends the existing inference trigger
rather than introducing another executor or ledger.

Each call persists a reservation before dispatch and a completed/failed receipt
before downstream work. All three receipts survive final telemetry and correction.
Stage, fixed research version, context/output bounds, fee bound, provider request
ID, returned model/provider, token usage and cost provenance are retained. Timeout
or process death leaves unknown liability and blocks replay; cancellation does not
prove zero provider billing. Receipt-persistence failure stops downstream calls.

On successful report delivery only, research uses the **same versioned quote's**
reference input/output rates and explicit 7000-micro-USD search tariff, with the
existing 3× multiplier. Report correction failures remain ALM COGS; only the
successful report path debits. Any failed/blocked/review report has customer debit
zero. Missing usage cannot become a fabricated measured zero. `usage.cost` is the
provider-reported total and is never charged an additional Exa fee. Where inference
cost details reconcile with that total, the receipt itemizes the $0.007 difference;
otherwise the provider total remains unitemized. Missing totals yield an explicitly
rate-estimated token-plus-fee cost, or unknown if token usage is missing. Settlement
actual upstream is null unless every durable call has a provider-reported total.
These are provider reports, not independently audited invoices.

Only `annotations[].url_citation.content` is evidence. Generated prose is discarded;
research may finish `length` or have null prose while report generation still
requires `stop` and valid strict JSON. Unsafe/credentialed/local/IP/lookalike URLs,
wrong-platform profiles, locator-only or oversized content are rejected. Exact
social-platform hosts and attributable profiles/posts are required. A brand website
can support a website report only, never Instagram observations or statistics.
Research annotations do not populate indexed Instagram statistics. The same filter
runs on live evidence and cache before prompts, rendered sources and success cache.
Sources are visibly labeled **OpenRouter Exa extracted source**. Empty usable
annotations fail closed; there is no retrieval retry. No returned URL is fetched.

## Reproducible qualification harness (no live calls performed during development)

`python -m auditlayer_worker.qualify_research` defaults to a **no-network dry run**.
It never connects to Supabase, writes catalog rows, or enables launch flags. It uses
the production pinning, generator, pipeline/quality gates, SDK and per-call process
containment. Live mode writes fsynced/read-back reservation and completion snapshots
to an exclusive new directory before/after each request, saves the report and final
summary, and computes a **settlement preview**, not a customer debit. Reusing that
directory fails even after a crash. Never delete/reuse a failed directory to retry.

Create an operator-reviewed `candidate.json` outside the repository. Example public
website candidate (not proof of evidence sufficiency or an approved live run):

```json
{
  "handle": "auditlayermedia.com",
  "platform": "website",
  "goal": "growth",
  "pin": {
    "provider": "openrouter",
    "model": "deepseek/deepseek-v4-flash-0731",
    "data_route": "https://openrouter.ai/api/v1",
    "rate_version": "OPERATOR-REVIEWED-CANDIDATE-REFERENCE",
    "input_microusd_per_mtok": 140000,
    "output_microusd_per_mtok": 280000,
    "max_input_tokens": 32000,
    "max_output_tokens": 12000,
    "max_calls": 2,
    "research_microusd": 0,
    "research_policy": {
      "version": "openrouter-exa-fast-v1",
      "context_tokens": 1310720,
      "output_tokens": 256,
      "search_fee_microusd": 7000,
      "reservation_microusd": 190573,
      "aggregate_token_cap": 1398976
    },
    "upstream_microusd": 206253,
    "retail_microusd": 618759,
    "reservation_id": "LOCAL-QUALIFICATION-NOT-A-WALLET-RESERVATION"
  }
}
```

From `worker/`, with the reviewed product runtime environment (never personal keys):

```sh
ALM_INFERENCE_PROVIDER=openrouter \
ALM_INFERENCE_MODEL=deepseek/deepseek-v4-flash-0731 \
HERMES_MODE=inprocess AUDITLAYER_GENERATOR=hermes \
.venv/bin/python -m auditlayer_worker.qualify_research \
  --candidate /absolute/operator/candidate.json \
  --output /absolute/operator/new-exclusive-run-directory \
  --token-cap 1398976 --cost-cap-usd 0.206253
```

The installed worker still requires its normal `HERMES_AGENT_ROOT`; the harness
does not discover or use any engineering credentials. The product key is only
required for live mode. After separate explicit spend authorization, rerun the
same command with **`--live`** and a new exclusive directory. At most one research,
one analysis and one bounded formatting correction can dispatch. No CLI repeat or
fallback option exists. `candidate_pass` requires a ready evidence-bearing report
and actual provider totals; it still returns **`launch_qualified:false`**. A website
pass does not qualify Instagram, connected-data access or other platforms. Inspect
real evidence attribution, report claims, latency, receipts, quota/rate ceilings and
fees. Empty evidence/unknown cost is `candidate_blocked`, not a synthetic success.

The live harness intentionally does not claim real wallet/Stripe qualification.
The full-chain disposable PostgreSQL tests exercise actual quote → consent → claim
→ SDK containment → read-backed receipts → immutable artifact → wallet settlement,
with fixture provider responses. Parent must additionally qualify the real accepted
commercial path under explicitly pinned production caps before activating traffic.

## Rollout / rollback

1. Review this complete commit and run the tests below. Parent owns push/deploy.
2. Drain the worker fleet using the existing retained pause-token procedure.
3. Apply additive migration `20260920214155_openrouter_research_contract.sql`
   before the dependent worker. It preserves all old quote semantics and seeds nothing.
4. Deploy matching worker/assets, verify health and reviewed commit parity. Leave
   commercial execution closed and existing unqualified state unchanged.
5. Perform separately authorized candidate live qualification. Parent/operator alone
   pins the qualified catalog/rate version, qualification artifact/expiry and accepted
   worker/app caps after reviewing evidence. Do not infer qualification from fixtures.
6. Before activation, use one explicitly authorized commercial submission and verify
   exact quote, owner, three-stage receipts if correction occurs, artifact and settlement.
   Retain ambiguous finalizations/liabilities for reconciliation; never clear fences.

Rollback: stop new admission and drain first. Retain the additive schema, quote
snapshots, wallet holds, receipts and replay fences. Do not mutate signed/accepted
quotes or silently send research-enabled quotes to the old worker. Hold/reconcile
those jobs explicitly; restore only the previously reviewed runtime for compatible
old contracts. Do not overwrite operator-owned flags/caps or invent refunds.

## Offline checks and TDD evidence

Observed red tests before fixes: missing explicit research admission, attempted Yahoo
fallback, missing SQL research column, lost filtering of unsafe/locator/huge rows,
malformed-response errors without a failure receipt, research null-prose/usage-bound
violations, missing qualification module, and prompt version mismatch. Real SQL
tracers verify success, correction, research/report timeout, empty annotations,
operator cap rejection, history/call-bound guards, replay fences and foreign-owner
isolation; the new SQL quote also passes through the actual bundled web action.

```sh
cd worker
PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -q -p no:cacheprovider
.venv/bin/python _verify_s06.py
# Clean runner: provide CI's pinned tsx@4.22.4 on PATH, no Hermes checkout needed.
env -u HERMES_AGENT_ROOT HOME=/absolute/owned/empty-home \
  PYTHONDONTWRITEBYTECODE=1 .venv/bin/pytest -q -p no:cacheprovider
cd ..
python3 supabase/tests/commercial_review_fixes_test.py
python3 supabase/tests/commercial_composition_test.py
python3 supabase/tests/commercial_release_test.py
python3 scripts/check-migrations.py
```

Provider tests now opt into a fake agent-root fixture, not a personal checkout or a
CI dependency. Final empty-HOME run: **954 passed, 12 skipped, 23 warnings**
(existing Python multi-threaded-fork deprecations). The three commercial SQL
regression scripts above passed; the migration checker reports **82 migrations**;
prompt verification reports **5 checks passed**. The new research SQL tracer also
passes an actual SQL quote through the bundled production web action. TDD's
empty-HOME red run reproduced the missing checkout dependency before the fixture fix.
Full-suite skips are reported as skips, not passes. No production mutation, paid
call, push or deployment is performed by these tests.
