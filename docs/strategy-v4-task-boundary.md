# Strategic task boundary — H1 repair candidate

Scope: offline source repair of the H1 finding against `339c8a91ee74c26d5d6745a4d50f4c280c8d0a3a`. No provider call, push, deployment, or production write. Independent delta review remains required.

## Contract

Prompt **1.19**, factual contract **strategy-v4**, strategic methodology **METH#strategic-decisions-v2**.

Each decision still carries ranked relevance, a local diagnosis, contributing observed source IDs, objective, effort estimate, horizon and earlier dependencies. Tasks now discriminate:

- `{kind: "creative_proposal", instruction: "..."}`: original prospective production instructions, not factual assertions. At least two per decision; 20–180 characters each. Creative vocabulary is not restricted to source extracts or a fixed advice catalogue. A bounded English claim-risk check rejects numerical/rating language, result predicates, audience-preference predicates, comparative/superlative claims and declarative clauses, including number words. The whole invalid form is rejected, not silently edited or stripped.
- `{kind: "measured_fact", calculation_id: "CALC#..."}`: optional third task; the ID must belong to the decision's selected deterministic diagnosis. No model-authored value, instruction, rationale or additional property is accepted. Rendering resolves the complete local calculation description, including measured count, eligible count and descriptive-sample/causality caveat. Public positioning diagnoses have no such facts. A valid post citation cannot authorize a factual task claim.

At least two original proposals remain mandatory; facts cannot replace the production work. Original creator and business executions, public positioning strategy, priorities, effort, dependencies and measured diagnoses remain in the positive controls. No score rubric or audience-preference fact has been invented.

## Executed verification

- Before the fix, the unmodified external `REVIEW_339c8a9_probe.py` accepted and rendered all three review assertions with one recording-only analysis call each.
- Initial actual-generator regression: **12 failed**, all because unsupported instructions were delivered instead of rejected. A subsequent typed-contract positive control failed before the typed branches existed. Four additional typed comparative/predicate controls reproduced additional acceptance and were then closed.
- Final focused task + product strategy tests: **66 passed**. This includes 16 unsupported instructions tested as both legacy strings and typed creative proposals, typed-fact field/reference rejection, and six original positive production directions.
- Full worker suite: **1101 passed, 12 skipped, 22 warnings**, 298.72 seconds. The warnings are Python multiprocessing/fork-in-multithreaded-process deprecations. This was the integration working tree, including concurrent sibling acquisition tests; it is not a claim that those sibling changes belong to this commit. Log: `/home/asheshkaji/.hermes/cache/scratch/alm-h1-worker-suite-final.log`.
- Re-ran each original external probe case by splitting its loop via AST without editing the original file: all three withheld the report. Its one-response stub exhausts on the existing correction attempt, so the external probe reports `format_correction_failed`. The committed controls provide both bounded responses and establish `structured_output_invalid`, nonretryable, after two rejected offline analysis responses.
- Regenerated **three synthetic reports** (creator, business, public) and **32 rejected task controls** through the actual generator. Fixtures are under `worker/tests/fixtures/product-strategy-v4/`; old v3 and live receipts remain unchanged. `manifest.json` pins contract versions, source-byte digests and artifact digests. These are authored synthetic forms, not provider outputs or launch qualification.

Reproduce fixtures into a NEW directory:

```sh
cd worker
PYTHONPATH=.:tests .venv/bin/python tests/build_strategy_v4_fixtures.py NEW_DIRECTORY
.venv/bin/python -m pytest tests/test_strategy_task_contract.py tests/test_product_strategy.py -q
```

## Residual semantic boundary

The typed measured-fact branch is deterministic. The creative-proposal branch remains open natural language with a bounded, conservative English lexical check: it is **not a universal entailment checker**. Novel paraphrases, implicit claims, obfuscation or other languages can evade lexical coverage; ordinary creative wording using restricted terms may be rejected. Passing that check or citing a post does not prove the text's truth. Do not advertise an unsupported-claim rate of zero or claim general factual qualification. Independent review and eventual authorized real-provider editorial qualification remain separate gates. The repair intentionally keeps original strategic production proposals rather than replacing the product with canned or extract-only advice.
