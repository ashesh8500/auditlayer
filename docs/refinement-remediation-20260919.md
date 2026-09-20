# Refinement remediation — 2026-09-19

## Outcome

Implemented tool-free section refinement, exact artifact-derived section validation, serialized leased claims, base-version fencing, idempotent/ambiguous-commit finalization, finite stale recovery without automatic paid-call replay, persisted refinement usage, pinned-brief provenance, and completion observation in the report viewer. Existing report/brand/template v1.9 work is preserved. No inference, production DB access, commits, deployment or full build.

## Parent integration contract

**Owner audit detail page remains parent-owned.** New optional ReportViewer props:

```tsx
<ReportViewer
  auditId={audit.id}
  reportReady={reportReady}
  refinements={safeRefinementRows}
  reportVersion={audit.report_version ?? 0}
  editableSections={editableReportSections(currentStoredHtml)}
/>
```

Import `editableReportSections` from `@/lib/refinement`. Read the current **owner-authorized** storage object server-side; on missing/unreadable file pass `[]` and false readiness (do not fall back to a global list). The parser uses actual versioned artifact headings, so Pulse, Blueprint, changed milestones and historical templates are supported. Duplicate/noncanonical headings fail closed. Optional props default to no edits; legacy version zero omits the `version` query rather than requesting invalid `?version=0`.

The parent must also disable its reader/share controls when the file is missing. Viewer disables download/refinement itself. New status API is owner-scoped even for admins; no private paths, token usage, claim data or other tenants' rows are returned. Its hook polls only pending IDs while visible/online, aborts hidden/unmounted reads, stops terminal/auth-denied, has bounded transient retry/observation limits and explicit refresh recovery. Completion invalidates workspace `reports`, refreshes RSC metadata and keys the iframe to the new immutable version. No terminal background poll.

## Commercial / operations contracts

- Commercial owns `audits.brief_version_id` and authorized selected-brief context pinning at submission. Bridge reads that exact ID constrained to the batch subject; it never reads latest brief at completion. Null legacy pins log `intelligence_brief_unknown` and skip the optional ledger rather than claim a fabricated used brief (the ledger requires a real version). Existing progress detail identity is unchanged; parent now uses audit events rather than subject-latest progress.
- This lane's only migration: `supabase/migrations/20260919204102_refinement_lifecycle.sql`. No historical migration or generated types edited.
- New service-role RPCs to add to operations capability probes: `enqueue_report_refinement(uuid,uuid,integer,text,text)` and `sweep_stale_refinements()`. Existing claim/finalize signatures retained. Refinement row additions: base_report_version, lease_expires_at, tokens_in/out, cost_usd, usage_estimated, usage_status.
- Apply schema before new app/worker code; coordinate worker stop/update/start so old workers do not execute through the newly fenced contract. Live/independent security release review remains parent's gate.

## Lifecycle and accounting

- Claim locks the audit, skips other running sibling refinements, then captures the current base version. Sequential queued edits start from the latest committed report; regeneration/manual replacement races are rejected at finalization.
- Twenty-minute fixed lease; no lease heartbeat extension. Reaper processes at most 100 expired running rows per tick. It reconciles existing source_refinement_id versions to done; otherwise marks failed with explicit no-auto-retry copy. Unknown spend remains NULL, never a false zero. No automatic regeneration after a crash/provider ambiguity.
- Finalization readback is scoped to audit + source_refinement_id with immutable provenance equality. Only the exact same uploaded object is retried, at most once, after confirmed absence. Unknown readback preserves the existing ambiguous-outcome guard. Known noncommit becomes terminal failed rather than stopping the worker. Failure writes cannot overwrite done.
- Found and fixed an additional finalization bug: SELECT INTO with no existing version nulled `v_final_path`, so first refinement could set the audit path to NULL. New function explicitly restores the uploaded path. Idempotent retries return their original version without rewinding a newer audit pointer.
- Successful and validation-rejected model responses retain token usage. Cost uses configured fixed-model token prices and **zero research/data API allowance**, since refinement is tool-free. Usage distinguishes reported vs estimated. Crashes/transport failures with no response retain unknown usage. This is per-refinement accounting, not invented quota or Stripe charges.
- Inference boundary rejects nonempty toolsets before agent construction; generation/correction/refinement stay DeepSeek V4 Flash. Prompt text and core.py are unchanged, so no further prompt/brand version bump is introduced.
- Added section replacement helper decodes heading entities, rejects duplicates and inserts response bytes literally (no regex-backreference interpretation). Existing safe-fragment/exact-heading guards remain.
- No runtime library was deleted: diagnostics and tests still use legacy adapters, and reference absence alone was not sufficient deletion evidence.

## Verification

- **114 worker tests passed** across refinement security/lifecycle/finalization, bundle/account-home isolation, worker health, generation, in-process inference, customer report surface and intelligence provenance. Executed through pytest with `socket.socket.connect` replaced by a network-denial guard; all inference is mocked. Earlier RED runs reproduced tool forwarding, paid-call-before-section-check, lost finalization response, missing lifecycle contract and invalid legacy version request.
- **13 web tests passed** (five new files): actual headings, action ownership/readiness/version fence/readback, owner-scoped status API, mounted hook terminal/hidden/late-result behavior and viewer controls/version-zero compatibility. Supabase and fetch are mocked.
- Targeted ESLint and **whole-web `tsc --noEmit` passed**. No full build.
- Applied/reapplied the additive migration in isolated `postgres:16` container `alm-refinement-test-20260919-2053` with `--network none`, no exposed ports and disposable fixture tables. `refinement_lifecycle_test.sql` passed: same-audit exclusion, base fence, stale terminal recovery, unknown costs, service-only grants, foreign enqueue denial, pointer preservation and idempotent no-rewind. Two real concurrent PostgreSQL transactions produced **one claim / one skip**, one running row. Container stopped/removed and absence verified.
- Migration checker passed (70 files at verification time). Owned-file `git diff --check` passed. Repository-wide diff check reported only another lane's trailing blank line in `web/src/lib/supabase/types.ts`; not edited here.
- SQL fixture is deliberately minimal, **not** proof of full migration-chain/RLS/live provider behavior. Full integration/browser and independent security review remain parent gates.

## Changed / added files

Worker: `generation.py`, `hermes_inprocess.py`, `pipeline.py`, `worker.py`, `supabase_client.py`, `intelligence/bridge.py`, new `refinement_sections.py`; tests for refinement security/lifecycle, finalization, bridge, bundle lineage and job health.

Web: `lib/refinement.ts`, `lib/actions/refinements.ts`, `components/report-viewer.tsx`, new `lib/use-refinement-status.ts`, new `app/api/audits/[id]/refinements/route.ts`, five corresponding test files.

SQL: additive migration above plus `supabase/tests/refinement_fixture.sql` and `refinement_lifecycle_test.sql`. This handoff is the only documentation file added by this lane.
