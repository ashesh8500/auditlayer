# Real-provider qualification admission — 2026-09-23

## Outcome: blocked before paid dispatch

Base: `e8eea1b585efe09d350a12a3cc38276d65f0e41b`. **No real report was generated, no paid inference/search was dispatched, and launch is not qualified.** The current 120,000-token / $3 app contract cannot admit the committed research policy. This is an explicit stop under the authorized no-dispatch condition, not a successful provider qualification or approval for a narrower product.

Scope: `worker/` and this document only. No push, deploy, service restart, production DB/settings write, wallet entry, private Instagram pull, engineering credential use, model substitution, or fallback. The supplied app caps are attributed to the parent's read-only query; this lane did not independently query production. The canonical dry-run path was exercised with those exact caps.

## Provider and tariff refresh

Read-only GETs used the existing ALM-owned OpenRouter key from the protected handoff file, without printing its value. That file names the variable `OPENROUTER_API_KEY`, whereas inference expects `ALM_OPENROUTER_API_KEY`; the initial local lookup failed before any request, then metadata retrieval used the correct field. No personal credential discovery occurred.

Public source snapshots and admission receipts are committed under `worker/qualification/20260923/`, with a SHA-256 manifest:

- `model.json`: official `GET https://openrouter.ai/api/v1/models`, exact ID `deepseek/deepseek-v4-flash-0731`; observed at `2026-09-23T15:40:32.949917+00:00`.
- `endpoints.json`: subsequent official `GET /api/v1/models/deepseek/deepseek-v4-flash-0731/endpoints` in the same investigation.
- `web-search.md`: official `https://openrouter.ai/docs/guides/features/plugins/web-search.md`.
- `admission.json`: exact canonical CLI invocations, exit codes, output/error, arithmetic and eligible endpoint projections. These are **admission receipts, not provider inference receipts**.

The catalog currently advertises $0.04 input / $0.64 output per million tokens for its default listing. That is **not a universal rate for every upstream endpoint**. The existing pin's $0.14 / $0.28 ceilings remain supportable: the refreshed endpoint snapshot contains eight status-0 endpoints advertising `response_format` at or below both ceilings. These include StreamLake, DeepInfra, Makora, DigitalOcean, Nebius, Cohere, Together and Parasail. Availability/parameter metadata is not proof that a real request will succeed.

Retained those explicit ceilings instead of silently replacing the route policy with the catalog's default pair. Updated the qualification candidate's rate-version/provenance note. The SDK already sends these exact `provider.max_price` ceilings, `require_parameters=true`, `allow_fallbacks=false`, the exact model ID and `max_retries=0`. Nothing in this change modifies routing or enables fallback. Exa `fast` remains $0.007 per request including up to ten results; the fixed plugin requests three. No fee change was needed after refresh.

The existing product key's read-only policy returned paid tier, no expiry, and `limit=null`, `limit_remaining=null`. This is **not** a provider-side $3 guard. Safe local metadata remains at `$TMPDIR/alm-live-qualification-20260923-metadata/key-policy.json`; its account-wide usage is not this task's spend.

## Admission diagnosis and exact operator requirement

The model-level context ceiling is **1,310,720**, while the top-provider metadata advertises **1,048,576**. Individual endpoint limits differ. Neither is an application research-input budget. The current pin deliberately reserves the broad model ceiling because Exa inserts search excerpts server-side, after local request construction.

The official plugin documentation calls highlights adaptively sized, **typically** 2,000–4,000 characters per result. It provides result count, search mode, prompt and domain filters, but no documented hard injected-token/byte maximum for this Exa plugin. `max_tokens=256` bounds generated completion, not inserted search input. The 12,000-byte annotation filter runs **after the paid call** and therefore cannot bound upstream spend. Three results and a short caller prompt do not prove a 32k paid input maximum.

Consequently, substituting a guessed 31,744-token research input allowance to fit 120k, using average observed usage, dropping the retained research reservation after completion, or treating post-response rejection as a pre-dispatch limit would weaken the contract. No such change was made. Reducing a global context number to today's top-provider value would still exceed 120k and would require an independently enforced route restriction. A future externally collected/clipped evidence path or provider-enforced input cap would need its own reviewed contract; it is not justified by this metadata refresh.

Exact existing policy arithmetic (recomputed in `admission.json`):

| Reservation component | Tokens | USD ceiling |
|---|---:|---:|
| Research input | 1,310,720 | $0.1835008 |
| Research output | 256 | $0.00007168 |
| One Exa fast request | — | $0.007 |
| Research, rounded up to microdollars | 1,310,976 | $0.190573 |
| Analysis plus retained possible correction: `(32,000 + 12,000) × 2` | 88,000 | $0.015680 |
| **Aggregate declared admission** | **1,398,976** | **$0.206253** |

The current policy is conservative: the context ceiling plus completion reservation can overcount a shared context window. Removing that 256-token conservatism would not approach 120k; this patch does not change its established semantics. These are reserved worst-case liabilities, **not expected consumption or measured spend**. Reservations remain retained across errors; actual usage/cost only comes from terminal provider receipts. Retail/debit preview is distinct from provider cost.

**Minimal setting for the unchanged pinned policy:** both effective worker and app `token_cap >= 1,398,976`; both USD caps `>= 0.206253`; effective `max_tokens >= 256`. Existing $3 already suffices, so the blocker is the token cap, not dollars. Raising only a local harness argument does not authorize production admission. No operator setting was changed. The successful larger-cap check below is no-network arithmetic only and is not authorization to dispatch.

Canonical entry point, run without `--live`:

```bash
ALM_INFERENCE_PROVIDER=openrouter \
ALM_INFERENCE_MODEL=deepseek/deepseek-v4-flash-0731 \
HERMES_MODE=inprocess AUDITLAYER_GENERATOR=hermes \
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m auditlayer_worker.qualify_research \
  --candidate tests/fixtures/product-strategy-v3/qualification-candidate.json \
  --output "$TMPDIR/alm-live-qualification-uncreated-120000" \
  --token-cap 120000 --cost-cap-usd 3
```

Observed: exit 1, `research_operator_budget: token_cap>=1398976; cost_cap_usd>=0.206253; max_tokens>=256`. Repeating **only the dry-run admission** with 1,398,976 returns `dry_run`, aggregate 1,398,976 and $0.206253. Neither creates its output directory or sends inference. Added an offline test of `execute=True` at 120k proving the generator is not constructed and no run directory is created, plus exact-minimum and invalid-lowered-policy tests.

## Bounded reproducible generation repair

A real deterministic defect was reproducible without paid inference: removing the master section-slot comment left its two-space indentation on a blank output line. Added a real-generator synthetic regression; observed RED (`1 failed`) before changing the comment-removal regex to consume its leading horizontal indentation. GREEN focused suite: **96 passed**. This changes whitespace only, not prompts, template content, product framework, scoring, or factual refinements; prompt version remains 1.18 / strategy-v3.

Rebuilt the synthetic creator/business/public fixtures through the existing builder into a fresh scratch destination. Verified each new HTML differs only in trailing whitespace and all three complete visible-text artifacts are byte-identical. Copied the regenerated HTML plus evidence cache hashes back. Compared old/new evidence after replacing only `analysis.report_sha256`: all other fields are identical. Removed the extra EOF blank line in `product_strategy_fixtures.py`. Historical v2 and failed live artifacts remain untouched.

New normalized report hashes:

- Creator: `41e8609470681c75d699115bd9aa5ce98d0eddb2bc61171716133c129e886dda`
- Business: `2fb15310daf8a998ed2514e419596be838da1aad7fe535dbcc1a843e39d88e55`
- Public: `0fb76d935f633f6e180f7c19fce6a9c482eb3c993b11fa483dfe4fc06bc48386`

These remain **synthetic fixtures**, not actual public auditlayermedia evidence or real-provider reports.

## Verification and unresolved full-offer gates

Full worker suite at the final worker code: **1,036 passed, 12 skipped, 22 warnings in 309.85s**. Warnings are existing multiprocessing/fork deprecations; skips remain unverified. Command:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/ -q \
  -p no:cacheprovider --tb=short --basetemp="$TMPDIR/alm-live-qualification-suite"
```

Logs: `$TMPDIR/alm-live-qualification-{whitespace-red,focused,suite}.log`, retained verbatim as decoded strings in `worker/qualification/20260923/test-logs.json`. The commit hook mistakes raw pytest separator lines for merge markers; JSON encoding preserves the exact logs without bypassing the hook. Scope-specific `git diff --check` passes. No independent review, visual/browser gate, production execution or deployment is claimed.

**Actual task inference/search spend: $0; provider inference calls: 0; provider inference receipts: none; customer wallet writes: 0.** Only read-only metadata HTTP requests were made. There is no real report to inspect for grounding or positive usefulness. Thus real public strategy quality, real connected-account usefulness, and full-offer qualification remain unproved. No fictional evidence was substituted and no second paid attempt occurred.

The original acceptance scope is preserved: validated multidimensional scoring, verified peers, maturity/audience calibration, meaningful paid-tier differentiation, deep narrative positioning and an evidence-based 90-day program remain required, not silently removed. Factual refinements remain disabled because the authorized typed-patch/revalidation/rerender path is still absent. Parent-owned connected authorization, production provenance/deletion readback, release review and deployment remain separate gates. Stripe and AWS are deferred as instructed; this admission stop does not broaden that deferral or authorize a narrower launch.
