# Lifecycle contract closure — 2026-09-19

## Scope and changes

Only the lifecycle checker, manifest, canonical generated artifact, focused tests, and this handoff were changed. No application/worker/migration changes, production calls, paid calls, builds, or commits.

- Reproduced the stale contract failure before changes: **8 failures / 3 UNKNOWN**; the existing real-repository test failed with the same diagnostics.
- Repointed dashboard filter and active-status consumers to `web/src/components/reports-library.tsx`, restoring explicit coverage of `draft` and all seven canonical states.
- Removed the consumer entry for the genuinely deleted `web/src/lib/actions/audits.ts`; no wildcard exclusion or missing-file exemption was added. Consumer count now matches the actual manifest exactly rather than a historical minimum.
- Repointed event-phase vocabulary to the application-owned `AuditEventPhase` in `web/src/lib/domain.ts`. Regenerated Supabase schema types remain unmodified; worker and architecture vocabulary checks remain intact.
- Admin manual-report status writes are extracted from `20260919204034_admin_transactional_controls.sql`, reached via a checked delegation from `admin.ts`. Both manual-finalization and founder-transition RPC call anchors are required. Existing founder matrix/RPC entries remain checked independently.
- Progress route now checks its import, audit-owned status input, and projected response fields, then inspects `projectCustomerStatus`'s implementation in `client-status.ts`. Audit states and customer phases remain separately validated. Actual phase returns/assignments and the phase map are inspected, not just types. The route no longer pretends to emit storage-progress states `succeeded`/`failed`; that separate storage vocabulary remains validated independently.
- Declared delegates appear in the deterministic artifact, and missing delegates fail UNKNOWN with their exact path. This remains a bounded static vocabulary/delegation check, not a TypeScript semantic proof or runtime transaction verification.

## Verification

- New mutation test first failed because the manifest did not inspect the moved reports-library authority.
- Positive copied-source baseline passes; isolated mutations fail for filter vocabulary drift, event-phase drift, unsafe delegated phase output, unsafe route output, substituted audit input, wrong admin RPC, and SQL status-write drift. Deleting the delegated implementation fails UNKNOWN.
- `python3 scripts/check_audit_lifecycle_contract.py --output scripts/artifacts/alm-lifecycle-contract.json`:
  `PASSED: assertions=65 sources=25 states=7 producers=9 consumers=13 separate_vocabularies=13 provider_calls=0`.
- `python3 scripts/tests/test_check_audit_lifecycle_contract.py`: **131 assertions passed**, including existing failure fixtures, repeated byte-determinism, and exact equality with the regenerated checked-in canonical artifact. No historical release-evidence artifacts were rewritten.
- All six `scripts/tests/test_*.py` entrypoints exited 0: release evidence (215 assertions), report provenance (56), capability preflight (138), lifecycle, worker drain (7 tests), worker release (4 tests). Lifecycle was rerun after adding canonical-artifact equality.
- Scoped `git diff --check` passed.

No outstanding blocker within this lane. These results establish static/local contract consistency only, not production lifecycle execution.
