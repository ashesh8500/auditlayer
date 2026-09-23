# Report product qualification — 2026-09-23

## Outcome and scope

Base: `81cfcc5d3d56a9e4154af8c5b740778ae27300a7`. The worker now supports **typed descriptive diagnoses, ranked strategic decisions and original prospective production briefs**, including a public-only social-report path. It no longer delivers an extract-only substitute when evidence cannot support that strategic contract. **This is implementation progress, not full-product or launch qualification.** The original full-product objective remains; no narrower pilot, pricing change or copy downgrade was authorized here.

Changes are confined to `worker/` and this handoff. Parent commits in the shared worktree are not part of this worker change. No push/deployment, production write, paid provider call or reviewer subprocess was performed. Stripe and AWS migration are outside this worker task.

Prompt version: **1.18**. Typed artifact contract: **strategy-v3**. OpenRouter `deepseek/deepseek-v4-flash-0731` remains explicit. The existing one-analysis/at-most-one-correction and separately bounded research path remain unchanged; no judge, parallel harness, router, scoring invention or wallet implementation was added.

## Implemented behavior

- `strategic_analysis.py` computes versioned descriptive diagnoses from the retained connected calculation rows: single-format measured baselines and cross-format comparisons. Every comparison retains measured/admitted denominators, calculation IDs, contributing media IDs and `METH#strategic-decisions-v1`. Missing counts remain unknown. These are descriptive sample differences, not causal explanations, impact scores or account-wide rankings.
- The existing model pass selects supported diagnoses and authors **2–3 ranked decisions**, each with a stable ID, observed supporting sources, objective, explicit proposed effort, dependency, horizon and **2–3 original production instructions**. Numeric ranks express editorial order; effort is an owner-confirmable production estimate, not measured ROI. Dependencies must point backward; selected diagnoses must actually inform a decision; at least one follow-up occurs after review.
- Original execution instructions are no longer confined to copied caption fragments or the old three-question grammar. Examples include a pantry-to-bowl transformation and a zipper-replacement demonstration. They are rendered as prospective instructions, not observations about existing visuals. Known unsafe numeric, causal, absence and website-scope constructions are rejected. **The lexical checks are not a general semantic entailment guarantee**; they cannot prove that every model-authored instruction is relevant, feasible or free of implied unsupported claims. Real artifact review remains necessary.
- The previous grounded experiment contract remains alongside strategy: observations still equal complete admitted extracts/calculations, and caption-anchored experiments retain measured baselines and explicit non-causal caveats. Format-transfer experiments now say **bundled topic-and-format contrast** and name both formats rather than implying an isolated format effect.
- The public-only path requires at least two different admitted URLs and descriptions, with at least two descriptions of 80 characters. It produces source-limited positioning decisions, original execution tasks and ordered follow-up without pretending to know private metrics. Public goals now reach the actual outgoing model prompt. This mechanical floor does **not** establish source independence, deep coverage or universal sufficiency. If neither connected measured support nor this public floor exists, generation raises nonretryable `insufficient_strategy_evidence` before analysis. Historical narrow-form rendering is still available internally; new production delivery cannot select it as a successful substitute.
- Connected profiles without measured content can use sufficiently rich public material without fabricating measurements. Website copy remains outside the social-report scope and is rejected before analysis.
- The accepted typed form, version, audit ID and artifact hash now join the **existing canonical research cache**. The existing evidence recorder/fenced RPC is invoked again after inference, so a revoked final checkpoint withholds the report. No separate connected form/caption JSON file is written. Existing disconnect/deletion lifecycle, fresh connected pulls and public-cache filtering remain in force. The final hash has the same pre-existing normalized-artifact semantics as the earlier proof; it is not a new immutable report-version store.
- Mixed-offset coverage timestamps are ordered by parsed chronological time, preserving original source timestamp strings.
- Factual refinements remain rejected before provider dispatch. Persisting a typed form is only a prerequisite: the current refinement API still accepts section/HTML/instruction, not an authenticated typed patch with metric reconstruction, revision binding and full revalidation/rerendering. Re-enabling HTML fragments would break the factual boundary. **Functioning factual refinements are not shipped.**

## Actual artifacts inspected

`worker/tests/fixtures/product-strategy-v3/` contains explicitly authored **synthetic inputs and synthetic provider responses**, not live account observations or paid-model output. The builder substitutes provider transport only and exercises the actual generator, prompt, parser, renderer and quality gate. Each positive bundle contains input, outgoing prompt, accepted form, evidence/cache, HTML and extracted visible text.

- `creator/`: eight synthetic dated posts, locally computed comments comparison (VIDEO 11.5 versus CAROUSEL_ALBUM 15.5, each four measured posts), conversation priority, original pantry-to-bowl production task, then a dependent repeatable-series decision.
- `business/`: eight synthetic dated posts, locally computed reach comparison (975 versus 1175, each four measured posts), product-education priority and original zipper-replacement task. The rendered report explicitly says reach is not purchases and requires authorized visits/orders before sales conclusions.
- `public/`: no connected metrics. Two admitted synthetic public statements support source-limited positioning proposals and original production tasks. Metrics stay N/A; no private audience, sales result, peer score or growth forecast is inferred.
- `sparse-public-negative-control.json`: `insufficient_strategy_evidence`, zero analysis calls, no report.
- `website-negative-control.json`: `unsupported_report_scope`, zero analysis calls, no report.
- `qualification.json`: remains synthetic, zero live calls, `launch_qualified=false`.

Read all three complete report-text files against their forms and evidence. Locally displayed means and denominators matched; action order, dependencies, new instructions, provenance and sales/non-causal caveats survived rendering. Initial inspection caught that the generic Executive Summary renderer discards item bodies as score rows: descriptive diagnoses now live in the diagnosis section instead. Final regeneration changed only “caption material” to the more accurate “source material” in report text; the final text diff was inspected. The legacy shell still has generic labels such as “Public profile,” “Calibrated in report,” and automatic creative-board category tags. No visual/browser qualification is claimed.

Rebuild into a **new** destination (the builder refuses overwrite):

```bash
cd /home/asheshkaji/projects/auditlayer/.worktrees/alm-gtm-integration/worker
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.:tests .venv/bin/python \
  tests/build_product_strategy_fixtures.py "$TMPDIR/alm-product-strategy-inspection-new"
```

The separate `qualification-candidate.json` is an operator config, not generated synthetic report evidence. Previous `factual-repair-v2` and failed `live87af636` fixtures are unchanged.

## Tests and environment

The worktree initially had **no worker `.venv`**. The main checkout's existing worker environment lacked `jsonschema`. That was an environment issue, not a product defect. Created the worktree-local environment with `uv sync --frozen --all-extras --group dev`; no dependency or lockfile change. The main checkout was not modified.

New positive controls and negative regressions cover descriptive diagnosis, original strategy briefs, ranked order/dependencies, unknown sources/diagnoses, invented numeric claims, absence/certainty/scope violations, single-format support, mixed-offset dates, public-only strategy, sparse withholding, mixed public/unmeasured-connected handling, actual public goal prompt, bundled format experiments, accepted-form provenance and final OAuth-checkpoint rejection. Existing financial full-chain fixtures were upgraded with sufficient **synthetic** evidence so they still exercise the intended timeout/correction/settlement/replay boundaries; no financial assertion or provider-budget fence was relaxed.

Final full worker run:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/ -q \
  -p no:cacheprovider --tb=short \
  --basetemp="$TMPDIR/alm-product-strategy-final2"
```

**1,032 passed, 12 skipped, 22 warnings in 307.28s.** Includes real disposable-PostgreSQL provenance/disconnect/cascade, reservation, ambiguous-liability and replay tests. Warnings are existing multiprocessing/fork deprecations; skipped tests are not verified. Log: `/home/asheshkaji/.hermes/cache/scratch/alm-product-strategy-final2.log`.

Earlier focused checkpoint: **189 passed in 31.67s**, `/home/asheshkaji/.hermes/cache/scratch/alm-product-strategy-focused.log`. The final full suite includes the later public-goal regression. Changed source/test/doc whitespace checks are clean; generated HTML retains the unchanged skeleton's whitespace-only line.

## Concrete bounded real-provider qualification

Existing harness only; no new execution system. The checked-in candidate selects public Instagram `auditlayermedia`, not the previously rejected website scope. Its tariff pin is copied from the historical reviewed candidate and explicitly marked **not freshly fee-qualified**. Before a paid attempt, the parent/operator must refresh provider catalog/fees, confirm this target and pin, and admit the same aggregate budget in the actual app. The operator must provide the existing `ALM_OPENROUTER_API_KEY` through the environment, never chat or command arguments.

Dry run executed successfully with the explicit product environment and returned model `deepseek/deepseek-v4-flash-0731`, aggregate token cap **1,398,976**, provider ceiling **$0.206253**. Receipt: `/home/asheshkaji/.hermes/cache/scratch/alm-product-strategy-dry-run.json`. No network/provider dispatch occurred.

The same dry run at the parent-reported app cap **120,000 / $3** fails `research_operator_budget: token_cap>=1398976; cost_cap_usd>=0.206253; max_tokens>=256`. Log: `/home/asheshkaji/.hermes/cache/scratch/alm-product-strategy-current-cap.log`. This is a real existing research-reservation mismatch; this patch does not silently raise caps or weaken it. A local harness admission with larger arguments is not proof that current production settings admit the run.

After those admission/fee prerequisites, this is the concrete **single paid attempt** command, not executed in this task:

```bash
cd /home/asheshkaji/projects/auditlayer/.worktrees/alm-gtm-integration/worker
ALM_INFERENCE_PROVIDER=openrouter \
ALM_INFERENCE_MODEL=deepseek/deepseek-v4-flash-0731 \
HERMES_MODE=inprocess AUDITLAYER_GENERATOR=hermes \
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m auditlayer_worker.qualify_research \
  --candidate tests/fixtures/product-strategy-v3/qualification-candidate.json \
  --output "$TMPDIR/alm-product-provider-qualification-v3" \
  --token-cap 1398976 --cost-cap-usd 0.206253 --live
```

The output directory must not already exist. One research call plus one analysis and at most the existing bounded correction; no automatic rerun, model swap or fallback after failure. Keep candidate, raw annotations, admitted evidence, accepted form, artifact, result and provider receipts. Inspect the actual delivered strategy against retained sources. `candidate_pass` means typed/runtime checks, **not** content/full-product/launch approval; the harness explicitly retains `launch_qualified=false`. Settlement is only a preview: no customer wallet row is written. This public-only harness does not substitute for the parent's separately authorized private connected-account qualification.

## Remaining launch blockers — not waived by this patch

1. **Real-provider usefulness and factual qualification remain unexecuted here.** Synthetic responses prove expression and safe handling, not that the paid model chooses useful grounded decisions. Known lexical rejection is not general claim entailment. Inspect fresh connected and public output, including sufficiency, scope, full caveats and concrete relevance.
2. **The original full offer is not yet demonstrated.** This extends diagnosis/prioritization/ideation materially, but does not establish broad narrative positioning analysis, a validated multidimensional scoring rubric, verified peer benchmarking, account-maturity/audience calibration, qualified paid-tier differentiation or a full evidence-based 90-day program. None may be invented to fill headings; none is removed from the acceptance contract here.
3. **Factual refinements remain unavailable**, for the typed-patch/revalidation reason above. No entitlement is declared fulfilled.
4. **Research app admission must be reconciled** before the provided public real-provider command can represent the production path. Existing 120k cap cannot admit its pinned worst-case research reservation.
5. **Deployment/production lifecycle remain the parent's responsibility.** Local tests are not production OAuth/cache/deletion readback, canonical report/version readback or live financial settlement. No production settings, pricing, Stripe configuration or migration state was changed by this task.
