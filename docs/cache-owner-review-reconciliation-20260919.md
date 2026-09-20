# Parent reconciliation — cache and owner-report delta

Independent review: `/tmp/alm-cache-owner-delta-review.md`, batch `deleg_196c93d2`. Verdict accepted as **scoped PASS**, not release approval. The current broader release remains governed by `workspace-release-20260919.md`.

## Parent-verified evidence

Parsed and rehashed all 36 source/test rows recorded by the reviewer. No drift outside the explicitly excluded `web/src/lib/refinement.ts` parser. That parser has changed from reviewed dependency hash `df34e3317836d4fca9e1394de92451cc36cf7e4b8bbe230f4a7bdc8a2b44d888` to `7e65a2be85f57accc1ea66fcf9b9b9ae9cb986269f97b9ca59b344bcf36e30c1`; it was never approved by this reviewer and remains a separate refinement review dependency.

Read actual Vitest JSON artifacts: `/tmp/alm-cache-owner-delta-vitest.json` contains 108 passed, zero failed/pending, 20 file results. `/tmp/alm-cache-owner-independent-vitest.json` contains 15 passed, zero failed/pending, one file. The latter replays 13 copied owner tests with a different immutable version plus two additional probes; do not count it as 15 unique new cases. These are verified test artifacts, not a parent rerun or live Storage/RLS proof.

M1/M2/M3/L1/L2 original repros are closed at these hashes. Do not retain the old three failing cache-review tests as current blockers. Cache budget is a SOFT inactive-query budget: 8 entries / 16 MiB logical UTF-8 total / 4 MiB per inactive entry; observed/in-flight readers are exempt. This is not a hard heap cap, strict LRU, or eight-distinct-report promise.

## Still open

- Final safe-heading parser cross-language review after its implementation settles.
- Combined expanded-product full regression, build, authenticated browser and independent final candidate review.
- Rebuilt production-mode website-title geometry and loaded-content navigation timing/request-budget measurement. Three explicit shell prefetches are verified structurally, not proven to achieve the latency target.
- Parent's subsequent reports-library URL overflow fix is outside this review's listed paths. Its six real Chromium width/status cases and six dashboard tests pass, with typecheck and whitespace check; final rebuilt route QA is still required.

## Documentation precision

The earlier source-sweep note saying progress failed reads always return503 is too broad: event-read errors return503, root-audit DB-read errors return500. This is an evidence wording correction, not a reproduced product defect.

No production changes, deployment, subscription migration, payment, credential changes or release approval result from this review acceptance.
