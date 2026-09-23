# Standard report research integrity — prompt v1.13

Bounded worker fix; no alternate renderer, source injection, deployment, or live model calls.

- Instagram profile/owner paths take precedence over title brand matches (including dotted-handle collisions and owner-scoped story URLs). Global post routes still require subject attribution. Metric extraction rechecks identity.
- Managed search rows retain their bounded title/description and carry `public_search_index`, enabling existing snapshot metrics and source citations.
- The production generator explicitly marks unconnected evidence as index-only on both initial and correction render paths. Content Consistency, Audience Fit, Engagement Health, and Growth Readiness are deterministically N/A; aggregate scoring is withheld. Canonical dimension labels/counts are checked before withholding.
- Both model prompts prohibit extrapolating present cadence, format proportions, engagement/audience measurements, or achievable growth forecasts from snippets. Deterministic section notes distinguish strategy/audience/milestone hypotheses from measurements. Specific proposed creative executions remain model-generated.
- Creative cards render supplied distinct tuples only, without cyclic padding or invented cards. Compact correction requests ten distinct ideas with hooks/examples inside the existing 1,200-word / 6,000-token bounds. Offline mock data supplies distinct test concepts instead of relying on renderer duplication.
- CTA links to current Extended pricing instead of hardcoding a commercial price. Embedded installation pins `ddgs==9.16.0`; lock regenerated.

All 15 Standard sections, provider/model restrictions, research deadlines, token ceilings, and retry counts remain unchanged.

## Offline verification

Strict RED→GREEN regressions exercised identity rejection, provenance, creative cardinality/deduplication, correction contract, score withholding, score-label bypass, and CTA. Existing connected-metric, template, runtime, and prompt-version regressions remain in the focused suite.

Setup: `cd worker && uv sync --extra embedded`. The full worker suite also needs the checked-in web dependencies for cross-language parser tests: `cd web && pnpm install --frozen-lockfile --ignore-scripts` (no web source/lock changes).

Results: focused regressions **118 passed**; full worker suite **865 passed, 12 skipped, 3 warnings**. Skips: one optional embedded-Hermes import test (`psutil` unavailable in this worktree), eleven legacy sweep tests superseded by the atomic Postgres RPC. Warnings: Python 3.13 multi-threaded `fork()` deprecations in workspace execution tests. `uv lock --check` and a non-network `ddgs` 9.16.0 import smoke test passed.

## Remaining boundaries

Search snippets may be stale, incomplete, or textually misattributed; attribution checks are not direct ownership verification. Current search evidence has no validated representative-sample contract, so index-only generation conservatively withholds the affected scores even when a snippet mentions dates. Connected metrics retain their existing behavior. Numeric score withholding is deterministic; arbitrary narrative factual accuracy still requires live-output review, rather than a brand-specific regex filter. Semantic near-duplicate ideas are not detected (exact duplicate tuples are removed). No live-generation or production-release claim is made by these offline tests.
