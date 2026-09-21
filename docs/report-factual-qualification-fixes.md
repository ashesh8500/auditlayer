# Factual qualification repair — bounded follow-up to 42211c1

## Handoff / release decision

**Release remains closed; product/live qualification is not established.** This is one offline repair of the independently reproduced blockers in `PLANS/ALM_GTM/FACTUAL_FIX_REVIEW.md`, starting at `42211c185a9ea3c204bace7366198a3f54966f7c`. The failed real `live87af636` artifact remains unchanged and failed qualification. Nothing here authorizes a paid attempt, push, deployment, production configuration/credential change or launch.

Changes are confined to `worker/` and this document. OpenRouter, `deepseek/deepseek-v4-flash-0731`, the existing research/analysis/correction call budget, commercial prices/entitlements, reservations, provider receipts and replay/settlement fences are unchanged. Prompt version is **1.17**; factual artifact contract is **analysis-v2**. There is no extra model call, judge subsystem, routing layer, website product or retention service.

## Exact behavior

### Refinements

- `HermesReportGenerator.refine` raises nonretryable `factual_refinement_unavailable` **before provider dispatch** for any HTML carrying `data-factual-contract`, including historical `extractive-v1`.
- It also rejects an audit whose stored prompt version is 1.16 or newer, even if its marker is absent. No valid persisted typed-form refinement API exists yet, so these reports cannot accept an HTML fragment under a factual marker.
- Historical report reads are untouched. Pre-factual/unknown-version legacy reports without a factual marker retain their old refinement path; that path is not newly declared factually qualified. This is not a migration or cleanup of historical HTML.
- Initial generation and its existing single correction both pass through the same parser and deterministic renderer. Adequate connected evidence cannot downgrade to the old empty-observations/inventory-actions form after correction.

### Connected evidence and its lifetime

- The new independent `connected-*.json` diagnostic copy is **removed**. Connected runs also do not write local `admitted-*.json` or `factual-*.json` copies that could duplicate connected captions or forms.
- The bounded connected projection is placed in the **existing canonical audit research cache**, alongside admitted public evidence. Its binding contains `audit_id`, `user_id`, `connection_id`, `credential_version`; the profile observation time and individual media timestamps are retained. Credential-version identifiers are provenance, not access tokens. No tokens, raw API response or media URLs enter the projection.
- Production invokes `_persist_admitted_evidence` through the existing `write_instagram_worker_state` RPC before analysis. That RPC validates ownership/audit/account association and credential lifetime. Rejection yields `evidence_persistence_failed`, zero analysis calls, and no new connected diagnostic file. Pure offline generation can return an in-memory checkpoint without a gateway; this does not authorize a production write.
- This deliberately uses existing lifecycle authority rather than inventing a second retention store: `20260918182043_instagram_subject_continuity.sql` clears `audits.research_cache` and account research caches on disconnect; `20260918184915_instagram_worker_write_fence.sql` prevents stale writes from recreating them. `audits.user_id` and `accounts.user_id` already cascade on profile deletion. A new disposable-SQL test exercises actual connected generation/checkpoint, readback, disconnect purge, rejected stale/foreign-owner attempts, and owner-deletion cascade.
- Existing final report history is still retained under the existing report policy. Existing raw **public research** annotation receipt files are unchanged; they are not connected API snapshots. Public-only admitted/form diagnostics also retain their previous behavior. No cleanup of files created by prior code was attempted; any old `connected-*` diagnostics need separately authorized operational review.
- Cached connected projections are never admitted as fresh media: web-cache filtering removes the old connected payload, and the current connected pull supplies the new projection. Cache TTL/freshness fences are unchanged.

### Bounded analysis restored for connected content

`connected_analysis.py` restores a constrained creative-analysis surface to the **existing** model pass, rather than emitting a report consisting mostly of constant Data needed sections:

1. Inspect at most 24 supplied posts. Admit unique IDs with a supported format, timezone-bearing date, complete nonempty caption of at most 1,200 characters, and no fictional/report-panel marker. Preserve complete captions, dates, media IDs and individually labelled likes/comments/reach. Invalid/missing/negative/non-integer counts remain unavailable, not zero. Counts of supplied/inspected/admitted/excluded posts and explicitly partial coverage are included.
2. Compute per-format descriptive means locally, with measured denominator, admitted denominator and input evidence IDs. These are `CALC#` sources, not model scores or causal comparisons. Missing top-level averages can be calculated on a display copy from labelled admitted counts, with a visible calculation/coverage notice. Supplied aggregate values are not overwritten. The ordinary API metric renderer and unrated score treatment remain in use.
3. Supply those sources, media inventory, coverage, client context and goal to the model. Owner/credential binding is excluded from the connected analysis prompt. With at least two admitted media items, require typed `observations`, `interpretations` and `recommendations`; public-only or smaller connected inputs retain the earlier narrow extractive form.
4. Observations must equal a complete admitted caption, public extract or locally calculated metric description. Arbitrary factual prose with a valid source ID is rejected. Complete long captions are shown in the source ledger rather than being silently shortened into a purported exact observation.
5. Interpretations are typed exploratory questions: creative emphasis, repeatability or format transfer, with selected supporting observations, a literal caption topic anchor and an available measure. They are rendered as **untested hypotheses**, not factual deficits. There is no free-text hypothesis/rationale field that can launder “no funnel,” audience distrust or causal claims by relabeling them.
6. Recommendations select a concrete contrast between two distinct caption anchors, an opening/sequence/format treatment, target format and even exploratory test batch of 4–12 posts. Each links to one hypothesis, its observed captions and a measured format baseline. The renderer supplies the experiment rationale, measurement procedure and cautions. A changed format must actually differ from the control format. Duplicate designs, unknown links, unsupported metrics and missing measured support fail closed.
7. Render observations, format analysis, creative questions, proposed briefs, experiments and success measures into the existing social-report sections. Links resolve to a dated local source ledger. No invented dimension/overall scores, peers, growth timetable, audience demographics or absent capabilities are introduced. Existing pricing remains the neutral current-pricing link.

This restores **caption-anchored experiment selection and descriptive content analysis**, not unrestricted editorial intelligence. The model can select topic contrasts and designs but cannot invent a new free-text creative strategy or provide a general narrative diagnosis. That limit is intentional in this bounded repair; it must not be marketed as the complete approved strategy product. No regex-based claim-entailment guarantee is asserted.

### Admission / filesystem boundary

- Standalone cooking demos and product demonstrations now survive admission. An excerpt containing both a demo/demonstration marker and a report/audit/score/metrics/panel marker is still quarantined **in full**, even across newlines and long flattened text. Explicit fictional/sample/example report markers remain quarantined. This conservative rule can still exclude legitimate mixed content and cannot recognize every unlabeled fiction.
- Website copy still produces nonretryable `unsupported_report_scope` before analysis; it cannot unlock a social report. It is auxiliary brand evidence, not a newly implemented website/funnel audit product.
- `persist_evidence` traverses every output-root component using directory-relative `O_NOFOLLOW` opens. Ancestor and leaf symlinks are rejected, as is parent traversal. Existing exclusive writes, 0700 directory/0600 file modes, fsync, readback and bounded raw payload semantics remain.
- Placeholder rejection, subject/platform filtering, neutral pricing, raw research receipts and correction/replay limits are unchanged.

## Representative offline artifacts and manual content inspection

All data and provider responses in `worker/tests/fixtures/factual-repair-v2/` are explicitly **synthetic**, not recovered/live account observations. The builder replaces only provider transport and exercises `HermesReportGenerator.generate` → actual prompt → typed parsing → deterministic rendering and the report-quality gate. It saves input, exact outgoing prompt, form, evidence, HTML and extracted visible text.

- `creator/report.html`: affordable-cooking creator, community goal. Eight dated posts; opening experiment contrasts “finished lentil bowl” with “ingredient prep.” Comments per post is the proposed measure; the VIDEO historical mean is **11.5 from four posts**. It asks for a matched future test, not a missing inventory.
- `business/report.html`: repairable-bag business, sales goal. Eight different synthetic outcome records; sequence experiment contrasts “repairable zipper” with “day bag capacity.” Reach is explicitly a **proxy**, not sales evidence; VIDEO reference is **975 from four posts**. The creative contrast and measured outcome differ from the creator case.
- `website-negative-control.json`: sparse subject-matching website copy; `unsupported_report_scope`, **zero analysis calls**, no social report produced. No fake website report is manufactured to make this negative control look successful.
- `qualification.json`: `qualification_scope=offline_connected_typed_contract`, `launch_qualified=false`, `live_calls=0`.

Manually read both complete extracted reports against their fixture inputs/ledgers. Captions, dates, count labels and displayed descriptive means matched; each hypothesis remained a question; experiments included actual topic anchors, rationale/source links, comparison measure and non-causal/proxy caveats. The report does not demand an inventory it already has. Only peer/audience modules remain Data needed in these standard fixtures. A first inspection caught the framework's 320-character body clipping (including dropped caveats) and an absent-aggregate coverage contradiction; regressions now require complete caveats, short local item bodies and explicitly derived sample coverage. The rebuilt artifacts were inspected again. This was a content review, **not** a new live-provider or visual/browser qualification.

## Tests and reproduction

Red tests adapted from the independent probes reproduced the refinement bypass, pre-fence local connected write, cooking-demo over-quarantine, ancestor symlink escape and dropped media/analysis contract before the corresponding fixes. Additional adversarial coverage rejects invented anchors, partial observations, model scores, causal hypothesis text, free-form rationale injection, missing metric support, duplicate designs, unknown IDs, old-schema downgrade, and correction laundering.

Final focused command from `worker/`:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest \
  tests/test_factual_report.py tests/test_factual_repair.py tests/test_factual_repair_sql.py \
  tests/test_qualify_research.py tests/test_openrouter_research.py \
  tests/test_openrouter_production.py tests/test_openrouter_pipeline.py \
  tests/test_worker_cache_fence.py tests/test_refinement_security.py \
  tests/test_refinement_review_closure.py tests/test_prompt_version.py \
  -q -p no:cacheprovider --tb=short
```

**172 passed** in 30.10s, including the actual disposable-SQL provenance/purge test.

Final full worker regression:

```bash
PYTHONDONTWRITEBYTECODE=1 .venv/bin/python -m pytest tests/ -q \
  -p no:cacheprovider --tb=short --basetemp="$TMPDIR/alm-factual-repair-final"
```

**1,014 passed, 12 skipped, 22 warnings** in 301.37s. Warnings are multiprocessing/fork deprecations in the existing isolated runtime tests; skips are not verified. Existing disposable-SQL reservation, unknown-liability and replay tests remain green. An earlier full checkpoint was 1,008 passed before the final coverage/refinement regressions. `git diff --check` is clean for changed source/docs/tests; the two exact generated HTML fixtures retain the pre-existing skeleton's whitespace-only line 210 (reported as trailing whitespace). They were not hand-edited after rendering.

Regenerate the synthetic artifacts into a **new** destination (the builder refuses an existing destination):

```bash
PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=.:tests .venv/bin/python \
  tests/build_factual_repair_fixtures.py "$TMPDIR/alm-factual-repair-inspection-new"
```

`worker/tests/fixtures/live87af636/` is immutable: the captured bad scores, absence diagnoses and unresolved milestone remain regression evidence. Its separate post-run site retrieval is not relabeled as lost original annotations.

## Unresolved release/product limits

- No current factual-report refinements are enabled. A separately scoped typed-form patch/revalidate/rerender implementation is required before offering them.
- This small typed creative grammar cannot substitute for broad, nuanced brand diagnosis, new editorial ideation, goal-specific outcome attribution or qualified plan differentiation. The offline forms are hand-authored transport fixtures: they prove that the real path can admit/render useful, different grounded selections, not that the paid model reliably selects them.
- Source attribution is not authenticity or general entailment. Captions do not prove visual content, audience response, sales or causal drivers. Partial collection does not establish absence. The framework still has legacy generic shell labels such as “Public profile” and “Calibrated in report”; no redesign was attempted.
- No scoring rubric, verified peers, private audience/sales inventory, forecast or sufficient-evidence policy for every account class has been qualified. Very sparse/unmeasured connected inputs may remain narrow or fail the typed support gate.
- Existing stored report/history policies and older local diagnostic files are not retroactively changed. Production lifecycle operation, deletion of old local files, live inference quality/latency, customer settlement and deployment remain unexercised here.
- Parent independent review and any separately authorized bounded live attempt remain required. No recursive reviewer or Codex CLI was used.
