# Factual qualification repair — live 87af636

## Decision and scope

The captured report remains **failed qualification**. Do not ship that artifact or enable production traffic from its original `ready` / quality `100` / `candidate_pass` result. This change makes no deployment, paid product call, production configuration, web, SQL, pricing entitlement or historical-report mutation.

The current pinned product model remains `deepseek/deepseek-v4-flash-0731` through OpenRouter, with one fixed Exa fast research call, one analysis and at most one correction. Existing reservations, ceilings, provider receipts, cost reconciliation and no-replay rules remain in force. Prompt version is **1.16**.

## Small, fail-closed contract

- Website evidence is admissible for attributed brand-copy inspection, **not** for the existing full social report. Generation checkpoints that evidence then returns nonretryable `unsupported_report_scope` before analysis. There is no silent switch to a website/funnel-optimization product, follower target or Instagram diagnosis.
- The current OpenRouter generation path accepts only `observations` (source ID plus the **complete exact admitted excerpt**) and unique recommendation IDs. It does not accept free-form factual conclusions, model scores, peer tables, causal/absence claims or milestones. A real URL or matching citation is not treated as entailment of a model-written assertion.
- Local rendering keeps the existing section framework and connected Instagram API metric renderer. Unknown cadence/conversion/performance remains unknown, not a negative score or diagnosis. Scores remain unrated: there is no implemented defensible per-dimension measurement rubric, so no model-authored substitute is allowed. There are no red zero bars for unknowns.
- Recommendations are explicitly labeled AuditLayer recommendations selected from a small measurement/action catalogue, not observed deficits or promised outcomes. This deliberately restricts editorial richness rather than attempting an unreliable semantic judge or adding more model calls.
- A mixed flattened excerpt containing fictional/example/sample/demo report material is quarantined **in full**, including its numbers and diagnoses. The filter is not a six-number blacklist. Separate uncontaminated subject-attributable excerpts remain admissible. We do not pretend to recover lost DOM/sample boundaries by deleting a heading.
- Current report pricing copy is a neutral `View current pricing` link to `https://auditlayermedia.com/pricing`. Model-authored upsell ledes/items/tables/callouts in that slot are not shown. No `$50/month`, `?plan=pro` or invented extended-feature promise is emitted there. Legacy entitlements remain untouched.
- The quality validator rejects unresolved bracketed milestone placeholders. The factual renderer uses a nonnumeric measured-baseline heading rather than inventing a target.

## Evidence and privacy

Before analysis, the worker persists private, exclusive, fsynced and read-backed files under `<output_dir>/research-evidence/` (directory 0700, files 0600; no symlink following for that directory or file opens):

1. `raw-<attempt_id>.json`: the exact bounded returned annotations, including rejected rows, with collection timestamp and correlation ID. Generated research prose is not admitted evidence. Oversized/nonfinite inputs fail closed rather than being silently truncated into a claimed exact capture.
2. `admitted-<random_id>.json`: the exact normalized packet with `WEB#` IDs, source URLs/titles/excerpts and cache-reuse flag. Its preparation timestamp is not a claim of fresh source observation on a cache hit.
3. `connected-<random_id>.json`, where applicable: allowlisted `IG#1` API fields actually consumed by the metric renderer and their observation timestamp; never tokens or media URLs. This is separate from web research caches.
4. `factual-<random_id>.json`: the validated form and packet plus SHA-256 of the final, metadata-stripped HTML. It is not proof that every source statement is true.

The admitted-only packet is written to the existing audit research cache before analysis. Connected writes use the existing OAuth credential-version-fenced RPC and fail closed if rejected. Raw annotations never enter audit caches, receipts, event logs or report uploads. Raw annotation persistence failures retain provider spend receipts and stop subsequent analysis. Existing output-directory retention/backup policy must protect these private diagnostic artifacts; do not expose or bulk upload the directory. This patch does not add a retention service.

The qualification harness independently reads raw/admitted/form/report files, reruns admission and form validation, compares the exact admitted packet and report digest, and requires those checks alongside the existing receipts/status checks. `candidate_pass` now declares `qualification_scope: extractive_contract_only`; `launch_qualified` remains false. Missing raw evidence cannot be reconstructed or rescued by a nonempty source list.

## Reproduce offline — no credentials or paid calls

From `worker/`:

```bash
uv run pytest tests/test_factual_report.py tests/test_qualify_research.py -q -s \
  --basetemp="$TMPDIR/alm-factual-qualification"
uv run pytest tests/ -q
uv run pytest tests/test_intake_parity_crosslang.py \
  tests/test_refinement_parser_crosslang.py tests/test_report_quality_contract.py \
  tests/test_template_pipeline.py tests/test_report_customer_surface.py -q
```

Use a fresh, disposable `--basetemp` path: pytest owns and may replace it. The qualification test writes inspectable HTML, private raw/admitted/form files and `result.json` beneath its printed `run` directory. All provider responses in that test are explicitly offline synthetic fixtures, **not live qualification**. The real disposable-database integration tests use fake provider transport with real reservation/settlement SQL; they do not exercise production billing.

`python -m auditlayer_worker.qualify_research` remains dry by default; `--live` still requires separate operator authorization, product credentials and an exclusive new output directory. **No new live attempt is authorized by this document.**

## Captured regression provenance

`worker/tests/fixtures/live87af636/report.html` and `report-text.txt` are exact copies of the captured failed output, not sanitized corrected examples. Tests extract and assert its actual six Your Account scores (32, 55, 68, 22, 44, 61), unsupported 46 overall, absence/cadence diagnoses, and unresolved heading before verifying rejection by the new boundaries.

`postrun-official-site-review.json` is an explicitly separate post-run retrieval. It demonstrates the fictional sample boundary and visible CTA/feedback copy. It is **not** the lost original research annotation payload and is never relabeled as that input. Its full flattened text is quarantined; a separately bounded clean marketing-copy case remains admissible but cannot unlock a full website social report.

Regressions also cover arbitrary alternative demo scores, cache-mode bypass, fabricated source IDs, paraphrase/cherry-picked substring laundering, duplicate JSON keys, NaN, unknown fields, invented peer/score payloads, recommendation-text injection, persistence failure before analysis, credential-fence rejection, neutral pricing, connected API metric preservation and private raw-input non-disclosure.

## Verification and review status

- Full worker suite: **980 passed, 12 skipped, 22 warnings**. Warnings are existing Python multiprocessing/fork deprecations. The suite includes disposable-SQL reservation/settlement and renderer/cross-language tests; skipped tests are not claimed verified.
- Focused factual + harness + cross-language + rendering/golden pass: **126 passed**. Final harness mutation probes also reject changed HTML and missing raw annotations.
- The new factual regression and offline qualification harness run without product network calls; raw/admitted/form/result/HTML artifacts remain inspectable under the chosen pytest base directory.
- **Codex external review not run; parent review pending.** The optional engineering reviewer exited on a 401/token-refresh failure. No retry, login/logout or credential change was performed. This is not an ALM OpenRouter/runtime credential failure. Parent explicitly requested the tested commit and will perform independent review before promotion.

## Remaining limitations — not launch approval

- This is an **extractive safety contract**, not a complete evidence-backed strategic-analysis product. Many framework sections correctly say Data needed. A source quotation is attributable, not independently verified truth; deterministic checks cannot establish completeness, authenticity, translation accuracy or every possible unlabeled fictional/injected passage.
- The conservative marker filter may reject useful mixed pages and miss novel/unlabeled fiction. Exact complete quotation avoids model-added entailment claims but cannot prove the source is honest. No claimed general semantic validator has been added.
- Score rubrics, peer eligibility/measurements and richer grounded recommendation generation still need substantive qualification. The legacy generic renderer is retained for legacy/mock contracts; the pinned current product generation path cannot use its unconstrained model-section form.
- This does not requalify free-form legacy refinement semantics. Keep release flags closed until the final reviewed deployment and separately authorized live report are inspected, including any refinement flow offered for these artifacts.
- No new live OpenRouter run, production SQL/wallet/Stripe settlement or launch cap qualification was performed. Offline fixture success is not a replacement for any of these gates.
