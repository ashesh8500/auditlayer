# Commercial review closure — 2026-09-19

## Result and scope

Both reproduced blockers are fixed and exercised against the actual Python entry point and actual PostgreSQL RPC. No provider calls, production writes, shared/local-parent Supabase access, build, commit, or deployment. Prices, plan limits, and report eligibility did not change. The pre-existing dirty worktree and peer ownership surfaces were preserved.

### B1: provider period pairs

`scripts/reconcile-existing-stripe-windows.py` now chooses one source for **both** boundaries: use the item if either item key exists; otherwise use the legacy subscription. A partial/null item pair fails validation and requires normal reconciliation. It cannot borrow the other boundary from legacy data. The existing opt-in apply and exact readback remain.

New `scripts/tests/test_reconcile_existing_stripe_windows.py` imports the actual script and calls `main()` with only network transport replaced. Both missing-start and missing-end item fixtures return exit 1, review count 1, and **zero RPC writes**. Complete item pairs override conflicting legacy pairs; absent item pairs use complete legacy pairs; default read-only mode never writes.

### B2: profile authority, not isolated subscription streams

The service-role-only `reconcile_stripe_subscription` now retains the locked profile as the commercial authority:

- Preserve existing same-subscription duplicate/stale/equal-time/start-sensitive checks and manual/complimentary precedence.
- Compare against the **maximum applied Stripe event timestamp for the profile across subscriptions**, under the profile lock. A previously unseen subscription cannot bypass ordering through an empty receipt stream. Equal-time cross-subscription changes are rejected rather than tie-broken into a commercial transition.
- A noncurrent subscription lifecycle event cannot revoke or relink the profile, even when its cancellation has a later timestamp. Rejections perform zero profile **and receipt** writes.
- Deliberate replacement requires `checkout.session.completed`, an explicit matching owner ID, the already-linked matching customer, active/trialing paid provider facts, a valid non-regressing provider period, and an event timestamp not preceding the new period start. A previously applied/retired subscription cannot be re-adopted.
- This authorization uses the existing webhook trust boundary: signature verification, completed Checkout owner/client-reference resolution, and provider subscription retrieval before the service-role RPC. The RPC does not authenticate raw provider payloads itself; browser roles cannot execute it. No new caller assertion or unsigned browser hint was added.
- An active legacy subscriber missing its start must first complete the guarded exact-window backfill. A canceled/free legacy subscriber may adopt without an old start, because it has no paid authority to revoke and cannot use the active-only backfill. Current-subscription cancellation remains permitted. Subsequent new checkout after cancellation is permitted.

Ambiguous ownership, regressing periods, stale/equal-time checkout events, and non-Checkout replacement requests deliberately require review; they do not silently switch authority. Do not fabricate timestamps, clear linkage, or delete receipts to bypass this rule. Resolve anomalous provider state through an explicitly reviewed reconciliation/change, not a guessed plan grant. Rejected commands currently surface as the webhook's bounded outcome response (existing HTTP behavior); provider retries are not an automatic review queue.

## Migration placement: protected before activation, not only afterward

Production has **none** of the new commercial migrations applied (parent-provided context). Therefore the still-unshipped `20260919204027_commercial_intake_allowance.sql` now contains the guard itself. The corrected authority is installed at stage one, **before any backfill or stage-two gate**. Historical production-applied migrations were not edited.

The parent's local Supabase already applied the previous 71-file chain. A canonical CLI-created additive migration, `20260919214119_commercial_subscription_authority_guard.sql`, installs the same guarded RPC there without resetting data or replaying/editing migration history. This lane did not touch that stack. Its owner can review pending migrations and run `npx --no-install supabase migration up --local` when the corrective migration is the intended pending change.

The new SQL probe asserts that the stage-one and additive RPC definitions/grants are byte-identical. Fresh canonical replay also runs the real authority tests immediately after stage one and before stage two. Merely appending a fix after an unsafe activation is **not** the rollout design.

### Explicit staged operator commands (not executed against any live target)

From the repository root, after verifying the target, migration history, prerequisite historical migrations, and a protected libpq service named `auditlayer-commercial-release`:

```sh
# Stage one: use this corrected candidate, NOT an earlier copied SQL file.
psql 'service=auditlayer-commercial-release' -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/migrations/20260919204027_commercial_intake_allowance.sql
# Verify actual installed authority before acknowledging stage one or backfill.
psql 'service=auditlayer-commercial-release' -XAt -v ON_ERROR_STOP=1 -c \
  "select position('commercial_subscription_authority_guard_v1' in pg_get_functiondef('public.reconcile_stripe_subscription(text,text,bigint,text,text,uuid,text,text,bigint,bigint,text)'::regprocedure)) > 0 as guarded;"
# Must print t. Record targeted DDL only after readback, on the SAME verified project.
npx --no-install supabase migration repair 20260919204027 --status applied --linked

# Protected environment holds the required Supabase/Stripe keys and mapped prices.
# First read-only review; only explicitly authorized apply afterward.
python3 scripts/reconcile-existing-stripe-windows.py
python3 scripts/reconcile-existing-stripe-windows.py --apply
python3 scripts/reconcile-existing-stripe-windows.py

# Only after all review cases resolved; gate refuses unreconciled paid windows.
psql 'service=auditlayer-commercial-release' -X -v ON_ERROR_STOP=1 --single-transaction \
  -f supabase/migrations/20260919204116_commercial_allowance_brief_gate.sql
npx --no-install supabase migration repair 20260919204116 --status applied --linked
```

The libpq service target and CLI linked project must be verified to be the same database before any history repair. These are targeted DDL commands plus explicit history acknowledgement, not a recommendation to bulk-push every pending migration. Coordinate intervening sibling migrations and their own prerequisites with their owners. Finish the canonical pending history, including the additive identical guard, before declaring the integrated DB ready.

If any environment already installed the **old** stage-one body, install and read back `20260919214119_commercial_subscription_authority_guard.sql` **before** running backfill or stage two, even if its version sorts later. It is an idempotent function replacement with no dependency on stage two. Apply it transactionally with the same `psql ... --single-transaction -f` pattern, verify `guarded=t`, then acknowledge version `20260919214119` on that same target. Do not run old stage one afterward and overwrite the fix.

The incompatible old no-start RPC signature is still removed by stage one. Retain the original controlled webhook-only transition / bounded webhook retry window. Do not activate the full new web/worker until stage two and sibling DB requirements are ready. This closure makes no hosted webhook/price/customer verification claim.

### Rollback semantics

- DDL failures inside `--single-transaction` leave the previous function intact; do not acknowledge migration history on failure.
- Do **not** roll the RPC back to its vulnerable body. Retain the guard while rolling application code back; coordinate the webhook signature separately. Stop webhook processing/intake if the compatible release cannot operate, rather than restoring unsafe authority.
- The additive guard changes no schema signature or existing rows. It neither repairs historical wrongful revocations nor claims to have searched for them. Any such incident requires separate provider-backed review.
- Backfill is per-profile, not one global transaction. A later review failure does not undo earlier verified repairs. Do not mass-null correct starts or refund/rebill customers as a rollback. Preserve exact provider facts and investigate conflicts.
- Before stage two, leave stage one and corrected starts installed if release is paused. After stage two, do not drop allowance/brief RPCs while callers still depend on them.

## RED / GREEN evidence

- **B1 RED:** actual-script unittest run failed for both partial variants (`0 != 1`); the old script treated them as successful. **GREEN:** all four unittest methods passed; the partial-bound method covers both variants and asserts zero writes.
- **B2 RED:** real PostgreSQL 16 with the original migration chain returned `{applied:true, plan:free, status:canceled}` for an old/different-subscription cancel after a newer Pro grant. The new exact-snapshot regression failed on that result.
- **B2 GREEN:** additive replacement passed old/different cancel (older and newer timestamps), unauthorized updated/created adoption, stale/equal owner/customer/period failures, authorized checkout adoption, duplicate replay, cross-profile-stream stale ordering, current cancel, resubscribe, retired authority refusal, manual/complimentary preservation, legacy/no-receipt handling, and concurrent checkout ordering. Rejected-event assertions compare the **entire profile row plus all receipts** before/after.
- **Additional tracer RED/GREEN:** a canceled/free legacy subscriber without period bounds initially could not re-subscribe. The added real SQL test failed, then passed after allowing deliberate checkout adoption for this no-paid-access case.
- All original commercial intake SQL probes also passed: exact windows, allowance semantics, race/rollback/retry, brief pinning, Stripe reconciliation, backfill, owner scope, and RPC grants.
- Fresh canonical replay: **72 migration files** on the dedicated PostgreSQL 16 database with pgvector. Authority probes passed directly after corrected stage one (before stage two) and after the additive migration. Stage-one/additive function parity is asserted by the probe.
- `python3 scripts/check-migrations.py`: `migration contract OK: 72 files, latest=20260919214119`. `git diff --check`: exit 0.

Re-run (only against an explicitly created disposable DB):

```sh
python3 -m unittest scripts/tests/test_reconcile_existing_stripe_windows.py -v
python3 supabase/tests/commercial_subscription_authority_test.py postgresql://postgres@127.0.0.1:55439/commercial_closure
python3 supabase/tests/commercial_intake_sql_test.py postgresql://postgres@127.0.0.1:55439/commercial_closure
python3 scripts/check-migrations.py
git diff --check
```

Owned container: `alm-commercial-closure-20260919-b2`; isolated loopback port `55439`; database `commercial_closure`. It was removed after final verification; filtered `docker ps -a` readback returned no matching container. The parent stack on `54321/54322` was not queried or changed. Replay log: `/tmp/alm-commercial-closure-canonical.log`. No live secrets were printed. The SQL probe initially had a fixture-name quoting error in one negative case; corrected its synthetic name and reran successfully. No product/runtime exception was hidden.

## Files

- Modified: `scripts/reconcile-existing-stripe-windows.py`.
- Modified **unshipped** stage one: `supabase/migrations/20260919204027_commercial_intake_allowance.sql`.
- Added canonical corrective migration: `supabase/migrations/20260919214119_commercial_subscription_authority_guard.sql`.
- Added tests: `scripts/tests/test_reconcile_existing_stripe_windows.py`, `supabase/tests/commercial_subscription_authority_test.py`.
- Added this handoff. No function signature changes; no generated client type regeneration required.
