# Locked decisions

1. Subject is the parent; channels are children; reports are outputs.
2. Living Brief is editable and versioned; model changes are proposed diffs requiring confirmation for identity, vision, goals, and constraints.
3. Canonical state lives in Supabase. Subject-scoped Hermes homes are rebuildable working state and never outrank the ledger.
4. Evidence freshness is per item/source; reuse never renews the original observation time.
5. Observable scores remain separate from strategic perspective. Brief context may change weights, thresholds, and action priority, not facts.
6. Production reports use DeepSeek V4 Flash only through `alm-report`, with no tools, memory, delegation, or fallback provider.
7. Single-channel reports use one bounded analysis call. Multi-channel reports fan out only across genuinely independent channels and fan in through one bounded synthesis.
8. Deterministic code controls retries, deadlines, cache keys, schemas, scoring, rendering, persistence, and customer status.
9. Customer progress is a separate allowlisted API/read model with Preparing, Analyzing, Finalizing, Delayed, and terminal states.
10. Implementation uses three isolated ALM specialist profiles/worktrees and one independent release gate. This fan-out is for engineering, never production report generation.
11. Hermes remains pinned during this mission; no framework upgrade is combined with the release.
12. Existing immutable reports and account history remain accessible through additive migration and compatibility reads.
