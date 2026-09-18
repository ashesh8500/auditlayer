# Final independent web / SQL security review

## Verdict: HOLD — SEC-1 and SEC-2 closed; customer Reports ownership contract incomplete

Reviewed the dirty integration worktree against `origin/master`, with HEAD and origin/master both `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b`. This is a bounded web/SQL review, not release approval. No worker Python source was reviewed or blessed; the independent worker remediation/review remains a separate gate.

One material contract finding remains. It is a pre-existing authorization dependency in a launch-touched customer page, not a new ordinary-user privilege escalation. The mission explicitly requires admin-in-customer-view ownership isolation, so green unit tests alone cannot close it.

## WEB-1 — MEDIUM — Customer report detail and reader retain cross-owner admin access

**References:** `web/src/app/(app)/audits/[id]/page.tsx:31-40,127-149`; `web/src/app/(app)/audits/[id]/read/page.tsx:18-28`; mission acceptance 7 and scope 12.

The report library and new-audit usage now explicitly filter `user_id=profile.id`, including for admins. The report detail route discards the profile returned by `requireProfile()` and selects the requested audit by ID alone. Its new parallel metadata loader's comment that the parent has authorized the audit is not an owner check. The existing `audits_admin_all` authenticated RLS policy uses `is_admin()`, so an admin viewing this customer route can still receive another owner's audit and proceed to metadata. The customer reader separately explicitly permits `profile.role === "admin"` for a foreign owner.

**Executed evidence:** transpiled and executed the actual current detail page in memory, with `requireProfile` returning `{id:"admin-owner",role:"admin"}` and a DB double representing the broad admin policy returning `{id:"foreign-audit",user_id:"other-owner",handle:"FOREIGN_PRIVATE_HANDLE",status:"ready"}`. Result:

```json
{"filters":[["id","foreign-audit"]],"foreignHandleRendered":true,"ownerPredicate":false}
```

The local PostgreSQL catalog independently confirms `audits_admin_all|{authenticated}|is_admin()` and owner SELECT `(auth.uid() = user_id)`. This is an executed application-boundary probe plus actual policy inspection, **not** a hosted JWT/browser exploit test. Ordinary customer RLS bypass was not demonstrated or alleged.

The new `page.test.tsx` covers metadata concurrency and a mocked absent audit, but its "authorization" flag only means `requireProfile` ran; it never supplies a foreign-owned row under admin visibility or asserts a `user_id` predicate.

**Closure needed:** explicitly owner-scope customer detail and reader routes and add foreign-owner admin behavioral tests; retain deliberate founder access behind admin surfaces. The shared report artifact API currently intentionally uses owner/admin authorization (`lib/audit-access.ts`), and `/admin/audits/[id]` embeds that API. Do not blindly remove its admin behavior and break founder tools; explicitly decide/separate customer and operator access where required by the mission. No fix was made in this review.

## SEC-1 closure: PASS

`persist_targeted_instagram_connection` locks the owner profile, then checks and locks expected connection ID + owner + exact bigint inside the persistence transaction. The nested nine-argument call shares those locks. Missing/deleted/replaced/wrong-owner/wrong-identity targets reject with `PIG01`; targeted callback dispatch uses this RPC, not the unrestricted Add path. Callback maps this expected conflict to generic `connection_unavailable` and clears the state cookie, without raw SQL details. Explicit fresh Add keeps the nine-argument API; eight-argument compatibility remains inactive/reconnect-required.

The required PostgreSQL suite was rerun against the already-installed local functions: **8/8 pass**. It covers the original preflight/disconnect/write ordering, both real two-session lock orders, replacement without mutation, owner/exact identity/ID checks, credential rotation and stale worker fence denial, actual anon/authenticated execute denial, and compatibility. No migration was reapplied and no installed function was changed.

## SEC-2 closure: PASS (fail-closed option)

`instagram-oauth.ts:69-77,210-218` validates the authoritative profile ID before returning it for persistence: safe numeric integers only, otherwise exact positive canonical decimal text no larger than signed bigint maximum. Unsafe numeric raw JSON is rejected instead of persisting a rounded identity. Adjacent exact string IDs and the bigint maximum survive unchanged. Start/callback database identity projections use `ig_user_id::text`.

The actual OAuth parser suite reran: **24/24 pass**, including raw JSON `9007199254740993` and `9007199254740992` rejection and exact string controls. Numeric provider IDs above the JS safe range are intentionally unsupported/rejected, not losslessly parsed. No claim is made that live Meta emits this numeric shape, or that live consent was exercised.

## Other reviewed contracts

- **Subjects/history: PASS in reviewed scope.** Customer subject list and detail roots require explicit owner filters. Direct channel/brief reads recheck subject ownership. Nested account/connection health is discarded when owner IDs differ, even under broad visibility. History unions owner-scoped batch audit IDs with audits attached to exact owned account IDs; both audit branches explicitly filter owner; no username-based history inference. IDs dedupe and stable ordering precede display. Pagination continues after short server-capped pages until an empty page, and batch filters are chunked. Behavioral fixtures use a seven-row server cap and cover multiple pages, foreign audit/account links, legacy union, deduplication, and non-ready states. Intelligence preview limits are labeled separately from complete linked audit history. Unlinked legacy accounts are not silently backfilled by this migration; any rollout reconciliation remains separately reviewed/operator-controlled.
- **Reports library/usage: PASS.** Dashboard list and exact usage count and New Audit usage are explicit owner-scoped, including admins. List status filter is applied server-side, pagination has a tie-break ID, counts are not derived from a truncated download. Failed list reads render retry feedback rather than an empty library; usage error disables intake. This does not override WEB-1 on detail/reader routes.
- **Connections: PASS.** Main list and off-page target lookup explicitly filter owner. Invalid/foreign targets do not grant access. Token-free allowlisted fields are the only connection card/health projection; no access token, long-lived token, app secret or credential version is sent to the card. Service-role persistence receives server-derived owner identity, not a submitted owner. Disconnect RPC validates owner under the same lock and generic errors are rendered. AI grants remain a separate navigation destination.
- **OAuth state/return routing: PASS for tested boundary.** Verified user-bound nonce/expiry intent, secure HttpOnly callback-path SameSite=Lax cookie, authentication before exchange, and clearing on callback outcomes. Exact route allowlist never normalizes attacker input into an allowed path. Direct execution rejected ten malicious absolute/protocol-relative/backslash/dot-segment/query/fragment/encoded/control-character paths and retained three local controls. Start route tests also cover hostile returns; callback tests cover malformed/expired/foreign state, cancellation, identity mismatch, persistence conflict and sanitized errors. A safe resource URL is not ownership authorization (see WEB-1). Browser cookie behavior/provider single-use-code semantics were not exercised.
- **SQL continuity and web/fence interaction: PASS in this scope.** All three launch migrations reviewed. Owner-scoped durable bigint identity, normalized managed-only reconciliation, ambiguity/collision rejection, owner-first locking, credential deletion/cache purge with retained history, and same-token version rotation are present. Targeted reconnect and disconnect share ordering with the worker SQL fence. Stale credential writes return null; worker writer requires matching owner/connection/version and owner/account/audit linkage. This reviews the SQL interface only, not whether every worker caller uses it correctly.
- **Grants/RLS: PASS for changed SQL boundary.** No new customer table grant or broad RLS policy was added. All nine installed function bodies from the three migrations exactly match source. Every function pins empty `search_path`; service functions have only owner/service_role execute, and the rotation trigger function only owner execute. Targeted wrapper and worker writer are invokers; continuity privileged writers are definers with service-only ACLs. Actual unprivileged RPC calls were denied. Static tenant/storage checker passes; hosted PostgREST text-cast behavior and real-JWT/storage behavior were not tested here.
- **Error/privacy behavior:** new Subject failures throw generic errors into a retry boundary rather than claiming empty/partial data; client error UI ignores raw Error text. Connections and callback expose allowlisted recovery messages. Existing optional report metadata fallback remains; no comprehensive legacy error-handling approval is implied.

## Verification actually rerun

| Command/check | Observed result |
|---|---|
| `ALM_TEST_PSQL='docker exec -i alm-kernel-test-20260918 psql -U postgres' python3 supabase/tests/instagram_targeted_reconnect_test.py` | 8 passed, no skips |
| Same local PSQL env, `python3 supabase/tests/instagram_subject_concurrency_test.py` | 2 passed, including eight concurrent callback sessions |
| `docker exec -i alm-kernel-test-20260918 psql -U postgres -X -v ON_ERROR_STOP=1 < supabase/tests/instagram_subject_continuity_test.sql` | Five PASS notices; transaction ROLLBACK |
| `pnpm test` in web | 68 files / 719 tests passed; includes callback 19, start 9, parser 24, history 21 |
| `python3 scripts/check-migrations.py` | migration contract OK: 65 files, latest=20260918190801 |
| `python3 supabase/tests/tenant_access_contract_test.py` | TENANT ACCESS CONTRACT PASSED; static only |
| Source versus installed `pg_proc.prosrc` comparison | All nine launch function bodies identical; config/ACL inspected |
| Actual return-path helper in memory | Ten hostile inputs rejected; three allowed controls retained |
| Actual report detail in-memory admin/foreign-row probe | WEB-1 reproduced |
| Local fixture cleanup query after targeted suite | Zero `sec1@example.invalid` / `sec1-other@example.invalid` users |
| Initial `git diff --check` | Passed |
| Full source manifest rehash at review end | No changes across 248 web/src files + 65 SQL migrations |

Expected sanitized stderr occurred in negative OAuth unit tests. One combined final terminal status/hash command was rejected by the runtime gateway safety filter before execution; the equivalent source verification completed via Python without shell execution. This did not block tests or source verification. The initial batched evidence read was output-truncated; missing remediation text was recovered from its saved output.

No production, real OAuth/provider calls, deployment, commit, worker-source edits, source changes, or SQL-function installation occurred. Only this report was created in the repository. Parent owns build/typecheck and browser/release gates; they are not inferred from these results. Parent build-generated changes (`web/.next/**`, `web/next-env.d.ts`, `web/tsconfig.tsbuildinfo`, generated `web/artifacts/**`, test reports/caches) are excluded from the security source fingerprint and are not blessed by this review. E2E/scripts/config changes outside web/src are not independently approved here.

## Exact source fingerprint

Scope: **every file under `web/src` (248, including tests) plus every `supabase/migrations/*.sql` (65)**, total **313**. This is a full source-state fingerprint, not a claim that all unchanged legacy code received a new full audit. All changed/new web/src code and the three launch migrations were the review focus. SQL tests were read/run as evidence but are not migration source. The three launch migration names are `20260918182043_instagram_subject_continuity.sql`, `20260918184915_instagram_worker_write_fence.sql`, and `20260918190801_instagram_targeted_reconnect_guard.sql`.

Canonical manifest digest: `25dfe7cd558b2852be2c172c005cc99a10c3e90174b9d95f0108900b3f2438dd` (SHA-256 of the following sorted lines, each `digest`, two spaces, repository-relative path, LF; excludes code fences). Re-review changed security-relevant source after any fix; this HOLD applies to precisely these bytes.

```text
3926213d82f26148212f663963c34dc70e1fb24ee29a18250a3938fe365fb2d5  supabase/migrations/0001_init.sql
d3bef23ab33e68a9d47635589ddf97d40f80567969ea80a15dcec71bd388abb0  supabase/migrations/0002_rls.sql
7a23b6e99d26ba126d7e070cabaa0323a5d60315dfde45ab0ae8b4ec957de268  supabase/migrations/0003_storage.sql
64a20f20eac84ff4409e48d9d72ac6b1966a4cf1f17865f458b04548ef27e695  supabase/migrations/0004_harden_profiles.sql
c3b64c9c88afa99a6c40fb2a558b76fdd6c026b019637ecd0e62bf406b229519  supabase/migrations/0005_realtime.sql
86b83bb00b434dbab6c297c0a392372a15f78442fe04b022a20c33c36ac6a2ed  supabase/migrations/0006_share_links.sql
8eeec75e7955a6b7e313465432b7a1d375d2d96b4615f9855c198844a5ff5151  supabase/migrations/0007_instagram_connections.sql
af50a4759d50b12e0f22d22942d578ba0bc3ac3e03d35a3dcd2a49a73f037446  supabase/migrations/0008_retry_tracking.sql
1f7ce5924cd1890698eb273b1b9425bc99221574b07982e655ad4b005c65f3e6  supabase/migrations/0009_research_cache.sql
f9bb53c242fc1413c16e74ec783dcad5cb27571b10a81ce8741f6b825d6ff494  supabase/migrations/0010_report_type.sql
ca0075b6d16d59f15f5b9837b2dae5df0fc4b422699d6e8e6320f85ff542270f  supabase/migrations/0011_account_types.sql
d6f6df9d20e06c6c3d83549362d1041d2cd219d3dbd63691a77bd517e9864a87  supabase/migrations/0012_trial_links.sql
389ae44ead0b6c6ddd12fa667bc9563be1e9be86c854b7564f7b0aa12e6dfc69  supabase/migrations/0013_admin_actions.sql
4c9fbe6f83b43b28e7c7a83ba834061a009ab289e26ee1fe43f53122471d530d  supabase/migrations/0016_claim_rpc.sql
a622fb8b20db30db35c5652ba0ca58d8ed837cf095d7b7ec1d4bec6417da2c9a  supabase/migrations/0017_prompt_version.sql
b20835c70f292dc1c90270be73090ad8f4e323ec786da483cc074f9e577dc5e4  supabase/migrations/0018_stale_running_reaper.sql
b092bcc6ae2228c7fb9f4ae23ce45332097bdda5e5f342024f7e9e9284cb9372  supabase/migrations/0019_wellness_benchmarks.sql
749ed7e231175149f98860727ceabe7c3ca6017658c4a532118d1f09a462f739  supabase/migrations/0020_peer_graph.sql
c50c7ee63b57d6f619feefc00c6598937ba922681654d92daa8e015e58a42683  supabase/migrations/0021_benchmarks_rls_rpc.sql
447a6c001a62dc291528c80a7af234eb090b9796664f4b8ad404e979373ba3ec  supabase/migrations/0022_commercial_entitlements.sql
914c0553828127505a24850017a932d4fae3b1c09545242a55208849a2483c6a  supabase/migrations/0023_deepseek_worker_runtime.sql
5414520da42c2cc24a2f3a866e76f41c27176d2be1ffa3ec235994e7e6d45dd2  supabase/migrations/0024_worker_token_cap.sql
302d21b19390a6795261ad9dced14e62d45dcf45ecb7f5da45ea28da91809b80  supabase/migrations/0025_async_pdf_queue.sql
04ca87e0e27e7b6e05e1a76bf348aa4f87ed00d31713e9acbaee9a6d1488aff5  supabase/migrations/0026_account_ownership.sql
f3f58724db51ba030401ae4b2732311ae9a94d220a62dd0fcdefc1ceb09c5158  supabase/migrations/0027_research_cache.sql
5e9b74c293590781a44bdbf0176a93c5a8fa270af00b8580e2fa77a60a422da0  supabase/migrations/20260719010921_secure_instagram_connections_and_report_urls.sql
4b844519e294ae96f9d2c880eb6e409649735c95e2ec2433ba972695eff665e2  supabase/migrations/20260719011616_atomic_pdf_and_retry_claims.sql
d27f764e10c92a2f0efc0f399c851dc3a0adfe38252ea26fe0ad4b9af5ea9113  supabase/migrations/20260719014323_harden_pdf_attempt_lifecycle.sql
ba41eacd1cbd71b18b9cd7fc63de70798f80cd00750447fe0e29a18b080ed86d  supabase/migrations/20260719154512_retire_pdf_feature.sql
a4def1f14ef01d7096ce3f2c66c8ef42d97fca2a0a289d31924cdcd35b0ebf14  supabase/migrations/20260720171000_account_ownership_status.sql
ed6df71679d74f369d4bb999d42c084c3a1dc16ffa4ccabe839681f147ffac53  supabase/migrations/20260720172000_audit_report_versions.sql
e6e677b118c96d778ecb4839b41641904886f81bd9e22df5fd646b09e83dd632  supabase/migrations/20260720173000_atomic_connection_and_report_finalization.sql
05ac898f8020cb7ff73581c303253d9bfb675baf6791b6bf41e744a900978ab8  supabase/migrations/20260720173100_fix_instagram_rpc_id_type.sql
75a7648bde74ac77d49375c21bc8142dc8ee02f4fdf1e4b2703d91fa93c079f6  supabase/migrations/20260720173200_fix_instagram_rpc_account_columns.sql
4f37a77795587661cbb2b42a0a490c245536b9d66a851fdbdb76e5450b7da4b0  supabase/migrations/20260721170127_alm_operator_control_plane.sql
2368f3838137bae5539a90ea9ff655bcc7a66fc63e2aa83f561b3a0d433651d0  supabase/migrations/20260721193000_operator_security_hardening.sql
08114ecda02f5808593a143b92e3abae696d5784ac91f99e95e4c847a6013426  supabase/migrations/20260723020611_alm_intelligence_kernel.sql
9b0e8167c8ba499ce4aec83e888c3a0993d4f5b3c27e9a990055362d3b233f0c  supabase/migrations/20260723120000_report_generation_runtime_metrics.sql
c66e4232dfee26995a4e125b63d0130e88c549f963657c9ef43ceda97155c187  supabase/migrations/20260730200000_alm_schema_bugfixes.sql
a24cd1df42997de7e4f5d196ec296c0eda5e96fa4d44db82dd9d68a0db491f4a  supabase/migrations/20260730201000_alm_intelligence_ai_storage.sql
d5e78c3cf2ba972ec016ff8bbce35bbbc3cdbc5ddc47550311c7f36c2dc813f3  supabase/migrations/20260731010000_alm_record_scores_change_fields.sql
b32f1784030ebf0eaa701c6ab2a2fa517c2943168df493f3b483081f8156bbf4  supabase/migrations/20260807000000_recommendation_outcome_ledger.sql
fe4e666d0e34cba8968f44002cf4274eafd1f97a57644ca447948b4aa1106939  supabase/migrations/20260807120000_living_brief_proposal_semantics.sql
ca009d2c61917d8dfcd2c1dd74a14887dda328f0aa580687a6a1a57b46ddf30c  supabase/migrations/20260807130000_founder_audit_transition.sql
acc1a9e167c62bbd9e6003c6d4a6e237f3e29c57f29313b9057f682dced64ae7  supabase/migrations/20260807140000_stripe_subscription_reconciliation.sql
148ec319f62fdc530c0354c23097c72010897e71bf2762fd36440fe7e47d4c45  supabase/migrations/20260807150000_decision_vocabulary_modified.sql
66975135daee7dd16a4368fd17e27ccbe2db76bffaf496653baaedef6209c0ea  supabase/migrations/20260807160000_peer_validity_evidence.sql
4fe78431021329baf8f1b56483f141662168bcc87b8e1c7232ac61cf45e06812  supabase/migrations/20260807170000_report_intelligence_provenance.sql
b28bdeb8536d407af20b290e8a762428ed4d8c651b4b328b5ef8bd09a6241526  supabase/migrations/20260807180000_drop_ambiguous_context_resolution_overload.sql
31a54115dabd1a810fc4f8105a545dcc8d3187ced81085a81790928c1f1acba8  supabase/migrations/20260807233734_atomic_entitled_audit_batches.sql
9378b02e375ed574119d63c125f5985aa019894fbc475817f674073c8cc42c14  supabase/migrations/20260808001443_rolling_batch_idempotency.sql
0edb7f3c1d588b16ae1edef540c2a0f5c253a1ef08acf6cad1a2f8f5b327fe81  supabase/migrations/20260808004102_retry_lookup_before_entitlement.sql
c4ba146afa18f60f0a3837d6ca166cddc940c2f0331cfe6a9ea342364fe5ee11  supabase/migrations/20260808010305_lock_compatibility_batch_rpcs.sql
227e592f06ba47eb6b09c71afdd22b96d1c335d4aab099c39c29518515ad31a3  supabase/migrations/20260808011216_preserve_compatibility_batch_errors.sql
963d126f9fbf5fbb8fc0be34ef55835c45e104f52e8521a0a645a0abbfd0b39a  supabase/migrations/20260808012343_lock_record_decision_ownership.sql
7cd4180db2698248ebbade5699bef5be81b4a25cec97ef4bf0568d66fe99be74  supabase/migrations/20260808013907_compare_decision_retry_notes.sql
2a3c8d0c1ffa45f8bc0d57aa03d10e740a7a4f1fa0b74bc0329923239a627366  supabase/migrations/20260809183000_operator_discussion_serialization.sql
1e9df018a11df0563366fa1b9649d7c4e6ca4587615a9b7722e6e0e256065e73  supabase/migrations/20260810153500_report_regeneration_finalization.sql
b3d785a38bd36142c227c07f0a080172aa4dd74a31d1e749fc357e03db09d2fe  supabase/migrations/20260810165000_regeneration_finalization_reconciliation.sql
1ceb6bc1c01b071066a7616bb6720efd0ea967fa124ff5d3a10b02995d39d06d  supabase/migrations/20260827203000_instagram_connection_graph_family.sql
c2a8b057eddc71d631f1518b030b4605a31a3951b4bc2b7b471c1659269c4500  supabase/migrations/20260827205927_instagram_connection_lifecycle.sql
f83d8118c19fbd4d71de3bf6dfb06e3edac78e8c404ab2a830a8865ad4713a27  supabase/migrations/20260907180000_instagram_rolling_upgrade.sql
11490fa19047b730e5cc521eb0187d7ff9654818cafcd4086d24ba14ece045f6  supabase/migrations/20260918182043_instagram_subject_continuity.sql
9b0b5c8987a7e5c85dafbf3437ca642abe7a5a94f41daeda9239a38085c4b6c7  supabase/migrations/20260918184915_instagram_worker_write_fence.sql
2da52717e6f11eb9b5bf84a554e2fdc5cc512b3c98235d57788296a29e930acf  supabase/migrations/20260918190801_instagram_targeted_reconnect_guard.sql
8e1a8f4f4ef8cee20c614c066ce7d7e978e59affcbdba70ff9eeefa40123ebfe  web/src/app/(app)/accounts/[id]/page.tsx
e639413f2e38389bb528e021d376cf60c36470cb17eccff2be48a86ada59a3db  web/src/app/(app)/accounts/page.tsx
50a6cc5c262468d381d6fd9f09b75017af79effac92618360e66d5fa369e6a0f  web/src/app/(app)/audits/[id]/page.test.tsx
0216bb549b1e48f36e2fae350f7fe3813e8d2f6b1efaee9c8a444c20a0d502d5  web/src/app/(app)/audits/[id]/page.tsx
804a47575961c9482f32989b1ae7ac44b93011e916689cdd96e7f63e5a27ee07  web/src/app/(app)/audits/[id]/read/page.tsx
cf1781e7f4921a264fb006e46a7b83972ff9817a0c65bf052b6442266c02cd75  web/src/app/(app)/audits/new/loading.tsx
70d8acfeac5d64ddf32afab313bb68c34f554a10736786269d540c409c1517dc  web/src/app/(app)/audits/new/page.tsx
4d07e730d3323f4e06dc59b711452887dab1fd90adc7396e39e70e5555117f52  web/src/app/(app)/audits/new/page.usage.test.tsx
8e2ec7fb597f2bf54cd12d50bc768b9cce305ce3e11b5e788e77a352535c421e  web/src/app/(app)/dashboard/loading.tsx
bc7cec96ac844ed840e2ec2139e00b13502f3b2373c6b3caf2fd125539031788  web/src/app/(app)/dashboard/page.behavior.test.tsx
02756958e8b449b0264c83dcd550c56031734ad7ab03aafbccb33142ba4fd9d9  web/src/app/(app)/dashboard/page.tsx
2d98d40efd3d43097866950596a75bf4bc684882c8cd997f1993e7ccafd9490e  web/src/app/(app)/layout.tsx
2aeebd6be6a3ac25b9e94de18c2c41d2bc5bb1b08aa5372fd991568b6401f1a5  web/src/app/(app)/loading.tsx
b7974aa605895862b0a4220509b61697cecde385b8316811f8c0a8156c0f8533  web/src/app/(app)/preview-setup/page.tsx
8d0eef8dd7974e46d1a42d45b34962d9320a82650e29e013b399a19144b9719e  web/src/app/(app)/preview-setup/preview-setup-form.tsx
57fe69548ac715f5acef7ced9cf879296b1db8ad6d6c2e279d2f5143451f6589  web/src/app/(app)/settings/ai-connections/actions.ts
d1e25ae2e6aee7c1550e570f83d1b86803e0bbff838aa2920e6ebd1d8f8c534b  web/src/app/(app)/settings/ai-connections/page.tsx
5d429ac4eb37b7f06902626aee7a6605ad1de6dafa804ae4d30a48003963a024  web/src/app/(app)/settings/connections/page.behavior.test.tsx
4a759f64a59734394a96892c91d90ebcb2fa3676a0129ce707e548eceeb66a8a  web/src/app/(app)/settings/connections/page.tsx
4fb9725d24e360ab62ace098fd6a234d342a2acd1dbdb0f78025fa542f14f7d7  web/src/app/(app)/subjects/[id]/loading.tsx
b41881abede12c94fcb179fd2a847737fadb10bffed3d82247a4767450a3db60  web/src/app/(app)/subjects/[id]/page.tsx
6465c167288b7472bb3b6ed8babae86fd0cbf7d195a4b3eb6e838a4798d24c50  web/src/app/(app)/subjects/error.tsx
be097b4788e97263fac77467ab58a9f501734f586ec2c0df23c7314ca83edd4b  web/src/app/(app)/subjects/loading.tsx
b8c4821e41e2d6613f36f0b13ba7b1391e34fb7a4435663db044b0bacb441292  web/src/app/(app)/subjects/page.tsx
5aad41e22e0cc573da2a40f11f0b3670569d77386383a1a8c3146fe97cd745bd  web/src/app/(app)/subjects/subjects-page.test.tsx
7a8a9622b4d384a45b586b779c11c94f9f01806ab530133041a504de49474a84  web/src/app/.well-known/oauth-protected-resource/mcp/route.ts
2be1fe59a395bf7a1c30cfe1b6eaa12a1af4a129b671c9059333af64201e7211  web/src/app/admin/audits/[id]/audit-actions.tsx
d073b3e7df1d23c99a632bf760d2fce58a3e2a64ff48164978c197bb4865824d  web/src/app/admin/audits/[id]/operator-panel.tsx
535b6304ef3f7bbdf41546e751a3b5adeff4ff76706b1930a8fe41479fd0c521  web/src/app/admin/audits/[id]/page.tsx
cab6cd7546e03589b279d3166536d0dec98a180dcc365546b68bf4cae5df0711  web/src/app/admin/benchmarks/benchmark-page-client.tsx
3ade129ab8be788cb8bb918f59c247f4f5f47cc06736851d0a80949ba9cfc7fd  web/src/app/admin/benchmarks/page.tsx
4d2854b5b33e6622193b9d5ac03318c168179d1794c99bafc0060cc941e9694d  web/src/app/admin/cost-dashboard.tsx
2c00dadd42d0de7f70bca0ae8784c4e675a5eb82bd56a8853eeb3934348371cf  web/src/app/admin/layout.tsx
114d0933a033396cf23d62de473d9bfd12c04160cff115e6ad5d630436160a60  web/src/app/admin/onboarding-select.tsx
00167af1f2828914ef19031844e31e45b58ac6d3e8174c61d9c1d0e68e906ce8  web/src/app/admin/page.tsx
e90c23fd8b48cfaef7fdf2351cbd752efb803d539573017dc9d4e78f75357ca9  web/src/app/admin/settings/page.tsx
f7d83dd4c0268c4440259ffd5e5ec64f7f1cb775c58e81e27cabe5048ba48f70  web/src/app/admin/settings/settings-form.tsx
0d39b0573427bd7cc3e488cd46cbc78b1128a59f8a26e0dcd779636eb2abe8a6  web/src/app/admin/trials/new/create-trial-form.tsx
f9ec71a9eb9143bd570068407e11654a62c865551ee9dbfb884b17f7a6320e41  web/src/app/admin/trials/new/page.tsx
32d32e00904bf328451c474536e67deecf3913e99373f9814c6f42c470b5d82e  web/src/app/admin/trials/page.tsx
848decf62a2882893e7e94cc444fa385e82db90f1e46b6d9ee2f55a1779de7f8  web/src/app/admin/trials/revoke-button.tsx
7a5cf19dde4b93640d18c6cef27a0cc8fd638024a91c8d37f6fd4a07a03b0ff3  web/src/app/admin/users/[id]/page.tsx
91702415b51cc22bb4d928c5283f1766c66a5b6655275589b19fa26122b14726  web/src/app/admin/users/[id]/user-forms.tsx
c826a01bda123fb1c416587e2cab71219c8f12d40c8d6aa7d667297173a9c86a  web/src/app/admin/users/page.tsx
36368b7c1ed9cd07cd5479ed3c8a60dfaf97626e1cc25331528d9cfa26a88828  web/src/app/api/admin/benchmarks/route.ts
4ab839f425a339e3f6821bdf69d06e81aae09eb74c4ce01f2e44527b461ebc1d  web/src/app/api/audits/[id]/live/route.ts
45e3a9536a8e2d83f21252e1efe71f051f503bec0af74c10e11bdcd2b960c962  web/src/app/api/audits/[id]/progress/route.ts
4c14fce7c4bef99efa80a3d7a4405f8b37cc403d34807548e7734d7bd70bd5a5  web/src/app/api/audits/[id]/read/route.ts
98a494f59672ab52659776d4214b9a478523548e759f695b155f4247c208d339  web/src/app/api/audits/[id]/report/route.ts
fbe27cfed061d69d82e9517d2741fa604d648ab04ab8ec3b3cb36750120a9665  web/src/app/api/auth/instagram/callback/route.test.ts
509d0c1a7badedb672cfe910a4cfc25d70eacb6f591e75c7fbdf85d125cd3dd9  web/src/app/api/auth/instagram/callback/route.ts
d4e53cb5e35db10477e02d937eb7b69cc1643cc3137d247600bb25baa733a4a5  web/src/app/api/auth/instagram/start/route.test.ts
3ab6f672176b9c48f4bc403c7de8c8a115025151ac5de39791af94798d46c9f0  web/src/app/api/auth/instagram/start/route.ts
aa4df25a848ccebca159c2003e4fc67c0d9fa3b08a9b116b61fbfa905fd3af3a  web/src/app/api/auth/preview-login/route.ts
317c7a19b7621b162fef6e73217d765395624a4b67b5cac0eb929d1ca0cf4b60  web/src/app/api/health/route.ts
2628c777ec42511e1009dd0d4f0ed303765390c333526c0b7cff1ae072cb0251  web/src/app/api/sentry/webhook/route.test.ts
9ab743e40e9b4d9054a5160971593cc190c2c823ea1ec161164993f18a8f4442  web/src/app/api/sentry/webhook/route.ts
a0f2f7fdf7bab2f1d93150eb9da4263b5b2fab0e2a8f52d72b489c80af7fcb18  web/src/app/api/share/[token]/report/route.ts
1e93fc1ec89fccffd8ef5f8322f850e16a9cb8bd224bda12165b8e435c9a95ff  web/src/app/api/trial/[token]/route.ts
7f9ec4039dbad1ad2b3ff71ef92e85da24fac0e3bd23148afdd96a985ac8bb26  web/src/app/api/webhooks/stripe/route.test.ts
aa4b02cb0f7ff1b253585838a52b69bb633df03bc4558a1ee2df174f40077a37  web/src/app/api/webhooks/stripe/route.ts
ce0660e2425b66623cced8673a76de3b361a61bb43c1e1482aa8a2ecdbcd7699  web/src/app/apple-icon.png
baf0aea6ef7766b2be0bb491944bda094eb9e4fb5f696dad5cbe0555956d17a3  web/src/app/auth/callback/route.ts
703ead5c6642e95e16901d24d0bac157c336d76eca680cce0ce7876bb45a03ef  web/src/app/data-deletion/page.tsx
bcab3ea4fdf7e0e90c0af587b2cedb979a87b1b3736e9cc84b149411ac08f506  web/src/app/enterprise/page.tsx
2b8ad2d33455a8f736fc3a8ebf8f0bdea8848ad4c0db48a2833bd0f9cd775932  web/src/app/favicon.ico
49a63522aa5b63ee332421804d375241137f2146eb4831620bfef32e995c755a  web/src/app/global-error.tsx
07ec5abde4f9d504c0a8d6bc4419fe0f211130c07568ddbb3c1019e1a4e3db34  web/src/app/globals.css
0c19901857358ec53e959e6766111ce3e17a559e0dd13e587cc2da4ef17d1d12  web/src/app/icon.png
a927d0aced3b4f35080f5b022b3740aa4ae6ef41b1912f0e45cc44f4e084d5be  web/src/app/layout.tsx
c00c20df39067d92b8f684b808f573860806c058bd43293c6152ef1430e9d2a2  web/src/app/login/actions.ts
f70bb751b67810a868f778975829951469a08b8507c3b04c1ca66f3b9b8f316b  web/src/app/login/login-form.tsx
c14b9b607b62a7ddef2361fae40339cd9d63677a4a47ea66a75ecf472099363e  web/src/app/login/page.tsx
917db36205069dcd46d382e82974d90fb5131e7560694b009a61f467f026ad6e  web/src/app/login/password-login-form.tsx
485c938dba438a6bb1baf3bcba91c2f9bf0dbe301c0359bf4395433630d8891d  web/src/app/login/password-login.test.ts
4e951946c5ffa2e2e91167bcc7827bf1a248e45902aa1d4e3ad4023de283afc6  web/src/app/mcp/route.ts
04ce42b4dca6b4cee402054dfe6d73bf5280c1004993b6e3ecb9df37e2699187  web/src/app/oauth/consent/actions.ts
fd5a514fefc9b98acc1b1f2fdb521a92f03b5b5b7a6e5b89849f77dfc897135d  web/src/app/oauth/consent/page.tsx
63cd10bcaef0de3ebd8ada92e0ac0950d45bf74a4c3011e7468a9a58be25aaf0  web/src/app/opengraph-image.png
7787027784c3f6106d7b91c279f4d284143b8b87b2060f7cd17076e6d00cd63b  web/src/app/page.tsx
a0bd9bbaeb29504bf7c1c146c021c6964b5ef7457a975c290a4bb625fdaa58c3  web/src/app/privacy/page.tsx
58e54aa558bbaf86f1d1756dcb7bc42e31237a2036c62008eb6d459a02dcb6bd  web/src/app/s/[token]/page.tsx
160b4cb1cc655be3b3f4ad6087ad025704e7fa122d6993e3b39e5d70b35d3953  web/src/app/s/[token]/share-report-view.tsx
89d9430e58825ae0d7aa16640a2c40ac3cd9cf96107b88c2fdae53ebbc4d4bda  web/src/app/s/[token]/verify/route.ts
2716b55c1e0d5bb3b6ed482ae98ca49397247ee49739677b5beba7cdd1578e5d  web/src/app/sample/page.tsx
f21c80516647cec8979be192304eb76c8d92f16d6b11d749ad57f1a0da11a917  web/src/app/support/actions.ts
aba29492867df3b8833fec3d273cf95b649fae0800b11106e0bce77ce2311f61  web/src/app/support/page.tsx
8e5dfa6b293d5a207a7568e195938029c16fb8a912d0f0673020fcd176f8e8c3  web/src/app/support/support-form.tsx
c4b6fe4a99b5f40f538118e1d4c0505992b6e30d57287afa66a6baa988508319  web/src/app/try/[token]/page.tsx
63cd10bcaef0de3ebd8ada92e0ac0950d45bf74a4c3011e7468a9a58be25aaf0  web/src/app/twitter-image.png
ba0bc8f1ca341f147e9b10740ea1c43729bdcc548a3fa7bee879f4952e487db3  web/src/components/admin-run-health.test.tsx
9a7e38c42aaa052f2c522f5ffc5525da5648d8335b8de9086f3576ead0dbeb9c  web/src/components/admin-run-health.tsx
040c55687e4accb87201317a5fe393d3e0138e3d4b2c15fe8d485d10980d225e  web/src/components/alm-skeleton.tsx
a5e8ba3680e5d9610a14c902fd463cea29fde03839c39b1b13d27356a26fb3b6  web/src/components/app-header.tsx
32a9fd5430730ca90c9920ca5f47e486714ab6f4c5f85599915a76080ecdbef4  web/src/components/brand.tsx
1a5de130c54e43efddf5177897be390d6abd9e58adc051c9b18d74ea8993dbb6  web/src/components/connections-navigation.test.tsx
73934f1232ee9edc7f6f205d9f106d9b3325fc63da8b9761434ce08b48206d71  web/src/components/immersive-report.tsx
1bfc1699bd77d158aa34ac6ab3f4bfd08f64da16aaa22688e8898b05c4fa4ae3  web/src/components/instagram-connect.behavior.test.tsx
a82ce1d4da88ebb92c9ac6b91913304644c3a665f60611a483c5a6b9ced978c3  web/src/components/instagram-connect.test.tsx
18014eba204194a3805602b0d0bf779fff936510146186ba28dfeabe6692ca43  web/src/components/instagram-connect.tsx
e74c9957926cba28890fe80251423f2f7b603b5649041f74c0db8d1143c64a3b  web/src/components/intelligence/customer-wait-state.tsx
bd659b35eac5fe42568e9926c5dc10bd7c454bdd08332269666d0e0ab5a03694  web/src/components/intelligence/intelligence-wizard.tsx
5dc367c52a4e28453a30404040a089c2031b0cb8b7da1cef9e2884edb03809c6  web/src/components/intelligence/living-brief-editor.tsx
fedbed40a419b3f83e9bec3ad181fcfdd27cf573ccfb23bc915e7d5939b4b17b  web/src/components/intelligence/living-brief-view.tsx
3e03e287b9649af22dc8903a3d7300495fbf69507b6d3d1432dd30af9cf56d8d  web/src/components/intelligence/recommendation-decisions.test.tsx
c88dc0131ad87c39dc335d3ad4fc94041d6cb123a2d6bc7477390b9735526a5c  web/src/components/intelligence/subject-home.test.tsx
35a2cfa6f4118ca7f9f69efa3f0cb6eda478ba507f1bed77a335964fdb2f3dba  web/src/components/intelligence/subject-home.tsx
7da89c6d0a2f49e6961995ab1c6ffa3493da6984785b65c83c0f2c4b8baf2bf8  web/src/components/live-timeline.tsx
b56f46d6528a6aeb663471e1537db0b7d6ed39aef5fa66b8d6fbccaec2694e00  web/src/components/navigation-progress.tsx
17db33aa62842cca865a173a2b5370909de8d05f625f285b2485c3fc5e33d4d2  web/src/components/public-shell.tsx
619e7f21cfffff514e1a055d21db3a10c95351965cfc6a321f40f982308add96  web/src/components/report-viewer.tsx
fac2209345a3b4e9f313cab1ca22551d6c6f19a8d6f2ecaf7acf6c27ab49c650  web/src/components/sample-report-preview.tsx
81737dcff327490db513aee8a7afb1481f56893d4ea23b5a6f308f670ce20c9a  web/src/components/share-links.tsx
5bdf26e3e9d81135a26f612b89a4b0d1b6c1dc8b016c5e83e8c54fd4bbdc54a9  web/src/components/status-badge.tsx
fb3ed188ea8219076ad35b208bf5c682430f17ba3ce0ebe0567fac25e1aea263  web/src/components/testimonial-carousel.tsx
6aec369d8b5a8332118628f407bf3e4a71fee8c9574b8363aef47912fff0c5b6  web/src/components/ui/badge.tsx
cfde66a87d63b7d4a1f8ae23a2c0f4f1983918b3bd287b86f6cd051edc9793d1  web/src/components/ui/button.tsx
a41b4d3d618416128d0093af2575048a2de8ef25c0926bcea4f19a24a59de476  web/src/components/ui/card.tsx
814b28f453dc713c89d0633800218f9767df27bbdeba6fc6d3a5bcf10c541b8d  web/src/components/ui/experience-banner.tsx
661a5a9fd4710eee4c5b51add2cc14f26028a1d510ba927e0776d66613c135ed  web/src/components/ui/experience-state.test.tsx
176087799f060f0786221452586e8c6fbdc64b0c559304842917f3924843a516  web/src/components/ui/experience-state.tsx
efde6eec0b74e5da0c1bb13c2b4d513472f1041e523185ec23e5a1a692e9c6e4  web/src/components/ui/input.tsx
963de64e777fec49d377e421eefd7a5feb070cd69af52eb9bc55d077f5d8872d  web/src/components/ui/label.tsx
4465d2c0603aa41e1962c27167d6d259f087416ad1b5f0216a6fed2f8a181443  web/src/components/ui/led.tsx
f34fc11b60aeb56c7ef27d954b625622b38356a0799bd2ae56d6453d3769eeac  web/src/components/ui/page-header.tsx
468936b96c32762cf4eeeebd86c67dd48537950e8daf062220609aafe4b235c6  web/src/components/ui/textarea.tsx
3331b8ab286bd815419c8a796491727969ac227e8c51c55d8fb5ecca97fd902d  web/src/components/whimsical-shapes.tsx
f9e03772147f7d1053dbc772d75586c5361039f2c50c01e8074be1a3e4f08acf  web/src/instrumentation-client.ts
f719fead4e861a94b5a065525e0e02b1ee7b7f5a3d5b8d72b46e47fed32e8c1e  web/src/instrumentation.ts
16584a3da2c8b0429f9746ff9f3011664fdc86fd58f141d19f1f9a1431be4351  web/src/lib/access-boundary.test.ts
27042caa030944a810dc2a4da4cc9b20a9875183f820cda5a20f8f835a020729  web/src/lib/access-boundary.ts
43cbe168ae345017bfd29e85bdff5ae4314bddbf14ee36c739eb015ee11efbb6  web/src/lib/account-ownership.test.ts
07dec80e9320125a341a41e4a7c8abd9111a5b127724385d93688920a50b3c75  web/src/lib/account-ownership.ts
67bdeeba71e760eec5bcbb1950d0fe5988d16c1f58f2cd33b27ca0a01f17d8cb  web/src/lib/account-progress.test.ts
141d248171954ad0b72c42e33f1a7a21938de883a7240b0909839b66e7ca96af  web/src/lib/account-progress.ts
6a4fb77fbe520924db2b8dddc853f19d0d88a4a6549336091f8f8f955cb76246  web/src/lib/actions/admin.ts
0daf5d7e897c9ce0dd263145fdeb9a7b105feb8fc09386be9e7eec62d6b80330  web/src/lib/actions/audits.ts
200a3bdfbe2c8411339e9cd546f9b9a0811b017eb5d43c65a7dd169720ad27ba  web/src/lib/actions/billing.test.ts
b36f4dda21f72ce372105bf37a53e759141731b467d92763bbdb72783805e04f  web/src/lib/actions/billing.ts
1ec3b2ec89ea9edda3e323fea7f09e174774544019a8fda901322d99c3354ed0  web/src/lib/actions/instagram.test.ts
5fa5e7f500355235ad0eae0d051343a7bd6e421fc2a599ba6a8eedd38f4788bc  web/src/lib/actions/instagram.ts
fc277e4848119325967de730446158b413f2b2ab8b2a9289eec24a10e80cd201  web/src/lib/actions/intelligence-owner-scope.behavior.test.ts
555a1cd1c517a1a87e0fc1b61335f7e05722f33be73dcdf58224ca7a537861d8  web/src/lib/actions/intelligence-ownership.test.ts
263ca8bea501fa16a4b03b3ea03d3ab9045e4b4a7576b3d7290724f05a2d2fad  web/src/lib/actions/intelligence.ts
170982f6bb8cf0ddba229e33d375e0d74c2aae166f64f840b83fdccb089e54e7  web/src/lib/actions/operator.ts
a39f7460e7e771c888b314d8d3b19ced0636ab4b79173bff32080a7b1d4af4b2  web/src/lib/actions/preview-tester.ts
1ad6dc385f98ada584026d709c7a92162cd39ef31f9669c29498475b5030e74c  web/src/lib/actions/refinements.ts
3302ac57d772d15387996dcc5341b35dc362b9802a5f5692d2c257c9ad31af43  web/src/lib/actions/shares.ts
309aad230df34102893abf880e648fbf46fba2a6ffe59c5b87e69ba1243f90b9  web/src/lib/admin-audit-transitions.test.ts
13c2b17af6604d9347f86d206f7252d3cac3f6db394fbdaa787e8c6ab28f93dc  web/src/lib/admin-audit-transitions.ts
fbead44a1971dd06390f0d22b86a769a831532a7faa082b462253ce2b3760a44  web/src/lib/admin-review.test.ts
b826b143d0f4c35ebae7a73b211589835689cd77be6cc7f2fdce8ff29fb17e2e  web/src/lib/admin-review.ts
8fd1cadad3877c4aa4c037ff36d7e565f19dfb5469c72080a1a21f7776cc8a89  web/src/lib/admin-run-health.test.ts
4802e36efa3e2f04f0e999bc192feee5092596c94581fe482328c595d1915d04  web/src/lib/admin-run-health.ts
53b75c9a8a9db8f23f81487cfc96c35ce6ff2e42cbcc38caf17dc185a7720a35  web/src/lib/audit-access.ts
c30364dee61a7b498c756187297d0641a9351156958dc8f15a749ff08566a602  web/src/lib/auth.ts
75628280a03ffde551118534eeb3fc5eab9220d499ccdd877ced4b2d5ccebe4d  web/src/lib/auth/magic-link-email.ts
b462fc741a548fa410ad8c455984b25d69e4852797cd971b9f33a7a12ed5e73f  web/src/lib/auth/preview-login.ts
6159c9c8c2436b1984a6553e0c3e8f3f2c3ad0efc00344ab4f4f6ded282f47b6  web/src/lib/auth/preview-seed.test.ts
82b5383a0099b2b66179d22b2b70cae0bec34883d2b7122267a37b4a80ea969d  web/src/lib/auth/preview-seed.ts
e3749927ff730acc0d6133621c884169aba7a43583751b7e4ce47d2cbce0f069  web/src/lib/billing-portal.test.ts
6ee603f843caa5884645f6172050f9554e70fe5ea7fbfdcee04a14be840b6b1c  web/src/lib/billing-portal.ts
8b85ff8a094d16fe5f0644f3b6e0c0d776cd878963fbe917dfa70fa4ca162dbc  web/src/lib/brand-positioning.test.ts
853cb1497a89173470f2f2f068648b344871e363b73d30eb1c93e0bab17eb41c  web/src/lib/brand-positioning.ts
c9f668e574c73da50f65b0bf97b5b310d208012e216e336339eae7d8ab12bc9a  web/src/lib/checkout-intent.test.ts
b3f9515436cec79619e0034db53c153c54361e0b40da9cc41efc138c246ca2c4  web/src/lib/checkout-intent.ts
ab36ad27f0307859c7871a7544208ea96f1e61d976c8860c2743c764a5d04cda  web/src/lib/domain.ts
9cf26a5ad2d6c1137d32aba03fc7b3a3f7819dae448d40119d1e1a8c33e059b3  web/src/lib/env.test.ts
b681bd481fafe9e79edc95e706208658622bc2d602549935010f47d073fc9e9c  web/src/lib/env.ts
6ee15c6f11722cd7e40f1605e0df2eca172a78ecb13553a1381badbdd89441af  web/src/lib/experience-contract.test.ts
f82b88308ed01dac7a060c141555001cc2ef369b11751976fe860347fdbb6428  web/src/lib/experience-contract.ts
4c3457c252a6fa1c1dba7791473bf202ac5eaad637fd92be8cca59023c413345  web/src/lib/instagram-app-review-runbook.test.ts
664943405a666d04008bb5ac3717665956db968ca4dd395cd1654d4f706c4383  web/src/lib/instagram-connection-family-migration.test.ts
b7a39d85a6baa355e4a63c2fb22e5c725cbc47031db500983fcb6e7ce2c7d211  web/src/lib/instagram-connection-lifecycle-migration.test.ts
5ae260263bf4d491bdc679c9fcafa46e9d8a05494cc15e320084d8db950ea73d  web/src/lib/instagram-connection-public.test.ts
4e66bd83d29044714db72897afe99f81a23e596c1adaf62e43e1543135aa4f94  web/src/lib/instagram-connection-public.ts
efc6e0bf7fc48b8c2c699d5536bea572c4881969257d24e135dc411e1b9d2ae7  web/src/lib/instagram-oauth-config.ts
ea92b578e11fae1e3cc5e940e4158aef185586981bc03645202630ba1f2d8cd4  web/src/lib/instagram-oauth-url.test.ts
08ce7ea3b29b31fc6f871ea0f2eaa96a7f983ee5cad848846aa9ccb0b5be53b4  web/src/lib/instagram-oauth-url.ts
2f566a59a354db3bc7234c9262b5ccdf0c65d2689a667c174d8a99b489111939  web/src/lib/instagram-oauth.test.ts
25355970bfd897a2be199b811765de9c014e7c68427ffd271eddd2bd242567d9  web/src/lib/instagram-oauth.ts
287a3a3c8d174a3fb8532f719a844f01ea0e1dabc9cda352d82e232717525967  web/src/lib/instagram-trust-surfaces.test.ts
f3a1dae3f0e12c53a998a32e165d8e8502503e06f037b6dbee44737a74c58097  web/src/lib/intelligence/api.test.ts
caaf51a1155348d705eb9c5f0064652fa8f65694daae3dc740f10ae5d05f4043  web/src/lib/intelligence/api.ts
82cddda7a8af24f05bbfb2f25895a77df707bcd35083883c4997ddf8e28196d8  web/src/lib/intelligence/atomic-batch-migration.test.ts
ae3b970bfa1ba9953b66f42df1878b3cc2963a256fb466c26f5d3d2d956647c9  web/src/lib/intelligence/batch-idempotency.test.ts
d3d2dec31851cef596643181b502c56f20e1bf45aeb6e8c2975173e3e9a79045  web/src/lib/intelligence/batch-idempotency.ts
10483fb0f39ac6363f7872dc7abe4a2297a8e95578d97382379d5efcd9cad1e3  web/src/lib/intelligence/batch.test.ts
e297669fecade3ed9fd4245a3a480adc6cb3f1cb24c178e027056451d8cd4b79  web/src/lib/intelligence/batch.ts
59fc8a83c0affc4e8b73be6d09a52bb498edd64cdae65de603d0be716dced8ee  web/src/lib/intelligence/brief-project.test.ts
87f42f16a2ed9ba2586a9150aa9b4654c8b8bb9ee03df3873b84c7f4a0c4f147  web/src/lib/intelligence/brief-project.ts
bd2c1a867e76db6738458b39d6535ae1261ba11023ffdc32f3b6a9a1b88befa3  web/src/lib/intelligence/channel-locator.test.ts
106cd3510d3a3e0de1066bda3e9f35baf0d22a1350b09efdedeccfa61136d25b  web/src/lib/intelligence/channel-locator.ts
1c662c6cd349d3df27236e252e9a6f4b74ed53ecc181b2d571806024d4f9d3d4  web/src/lib/intelligence/client-status.test.ts
119243d97374d4612ae1d75d5d26d1c9f88d9c373a1f4ce0457bf7bca4fe8a03  web/src/lib/intelligence/client-status.ts
2b0e2e3752fab30c073891d3dfadd818468a12a6db90a061ebfbda9bbfb1a960  web/src/lib/intelligence/compatibility-batch-migration.test.ts
185888bfc3a3f1794e79a382096645421559b02be45e7f87b3548837f4f5639b  web/src/lib/intelligence/decision-ownership-migration.test.ts
85428603353f201314ee8493f87b6fe8a3d9e30c3c5ca307e80f572b2e825fbc  web/src/lib/intelligence/fixtures.ts
21d78c1671d32cbcf7e2a15852131b1684f2d7c17fb751e51762bc0794a5c6a9  web/src/lib/intelligence/index.ts
53a2e3cf61e17a4e6ca32335dff91385ebadbd5411fb5266bc0e96938ed132f3  web/src/lib/intelligence/progress-step-state.test.ts
8d06161307b04a31c679baed1ba907e7c398b82e0f5603883ef85bc65c76b829  web/src/lib/intelligence/progress-step-state.ts
061e88957481eed959944d9129429191ed3b2d7bb0382bd0d8e63e71680bd581  web/src/lib/intelligence/recommendation-decisions.test.ts
770747220ac75d56ea44e7027c97ad1f5112895af061c816fe11f5bf4da73358  web/src/lib/intelligence/retry-lookup-migration.test.ts
e8d2102017d1e14c3080a7e2fd102b850ce8b29ecbc6216e8faea08472da7471  web/src/lib/intelligence/rolling-batch-migration.test.ts
43b048b35b1dc018eca7bac29a0eb1b106c3236ce3bdc8afda415f600578096a  web/src/lib/intelligence/subject-history.behavior.test.ts
d732938b0b02b8932dc3d3e144f8997dc47d0ad030f1e831062ac8ac4a28cf04  web/src/lib/intelligence/subject-owner-scope.behavior.test.ts
decff4f4a27df9696ef0cf3c8ed7a53243e9be50b9763601e874fbdb555695bf  web/src/lib/intelligence/subject-reads.ts
44a79931e76f7188c0b5acc7df1fd5ccca5a7c833e516b0c473599140e2225e1  web/src/lib/intelligence/subjects.ts
313e06a61ddbc758faa7cbbc5f7701f45d6e24a0cb41621ecca9368c160af52f  web/src/lib/intelligence/types.ts
a7bf781713448aafa4c1bdf06c30fe86fbd63abb90d79b4fb1a7a4aeba928ac0  web/src/lib/intelligence/user-stories.test.ts
caadeb3841548318ecafd079eb759e9aaefd6e2287a880f9030c8b21912fd8cd  web/src/lib/mcp/__tests__/auth.test.ts
f21ff0033a7cfb61bd4b2ddd0a49bbb5c575114401e810173f16650d07a7eba6  web/src/lib/mcp/__tests__/authorization.test.ts
9393c5e54fc16d2998f40dd0899d179dff10f9280d0ba9db505ccb87c90978fc  web/src/lib/mcp/__tests__/protocol.test.ts
ed60447e06d90a5a84eda43b6cb5f5f48383c660970cb2ed4e52ec5b8a7bf5f5  web/src/lib/mcp/__tests__/repository.test.ts
bf1ce105d42e86545de5352150116bb1836611ae6b21929cc593d128f2ce6c2e  web/src/lib/mcp/__tests__/service.test.ts
62d647edd938378e2d3780e048e8fd5511a94906bb3519a0b7863c65b3ee1d6b  web/src/lib/mcp/auth.ts
6d9fd158a5cc9cdc615abcc8f7dbdd4e0e188418a2bd16d22e6977031f9dd548  web/src/lib/mcp/authorization.ts
c48a6ccba32c2f028074779bd3efaee5263389bf8a4f2498193e1d14c73f107a  web/src/lib/mcp/protocol.ts
a426eb78e16e47db1af6770a095772895024d764aea02bed042f6134a500f67c  web/src/lib/mcp/report-text.ts
da0d51a39b3a812e1c67b28565e9ab62acef30f000f0f6f4f4d391d5477dbac2  web/src/lib/mcp/repository.ts
4239a4bff070b73ba7e1d2d8aaa97723c8bb19e244f5ef7efea85a40f46fbcc6  web/src/lib/mcp/runtime.ts
1bdc485d9043edcf5c4d584c7a3a4b06269ca7bbeba195cb9f574e0034bf1e9e  web/src/lib/mcp/service.ts
42fa94872293a787db902cfcc9febb35ef729f882cb5dfc8265a5af5033aee2a  web/src/lib/offer-contract.test.ts
92bcf6ac244ef82cbf99df2d76c86528e3f6df1103886cd897ff69071814ca63  web/src/lib/offer-contract.ts
709aeee30d6780f0bbbf67c16c189d22f600fad027d8ab0daf48ac089c6f4d68  web/src/lib/offer-pricing.ts
eb6b65b13a792b14a00608f418a3c3b225c0f06e1b059bd72a1aee58d522b88b  web/src/lib/operator.test.ts
72070a8675edc3682f46bb6508c4d2ea21fc18389dc862fddcc5711d7becb580  web/src/lib/operator.ts
881e10585d262951201dfa2c9b61802cba9b4effd7c26e8eede28c6baa49a6ac  web/src/lib/refinement.ts
04b37eb4e6dfa54eb2b77c050b44ad137e430d85170e94a8c920c2c5528cc2fc  web/src/lib/report-provenance.test.ts
9b4e0882953c2d51fbd1a2f79f9826e81ced3ad32b3f5bcaf8198bc77f745a7e  web/src/lib/report-provenance.ts
c63f773273a8341d8e25ce7941ffd824416f5e84bed354506ae56ec8645142f7  web/src/lib/sentry-config.test.ts
0a402486ebb5ef5986814ecfaf6ce0359c11b6be344389539d67db99c10d8bc7  web/src/lib/sentry-config.ts
169a47daf7b69f0f851d381d9ecf9e7355b2fc31976f0878c3b13b1185e8bc93  web/src/lib/sentry-privacy.test.ts
f7c1db766063957a5525e68ba87b67cbb515b9da6029935470c874836b088236  web/src/lib/sentry-privacy.ts
c5909a78b0598d71d86bc1008b8b1cfaf2c81f4bfd18db16293af2d3f3f93089  web/src/lib/sentry-webhook.ts
09103e206a8966480403e6329367b6bff6819529ec34f5c9bfcf42dffa342717  web/src/lib/sentry.test.ts
862f392f49819b8a4c1ce30301b11c58b88bc6ad5fa1e4fa31fe9baa94ecef83  web/src/lib/sentry.ts
72fe8c3e9725a275398241457714417fa152d79bc998c92b40e26f7e8c9e8d42  web/src/lib/share-access.ts
cc384a43deb01007c0499079103370312be8a2f7e553f877040dceccc940a592  web/src/lib/stripe-reconciliation.test.ts
dc12d05ed3cf9a67de3cd4f42a42097ccac9827687dd1bacb3d14c2a7830e25c  web/src/lib/stripe-reconciliation.ts
f9c1352fbdb5f60786907651120b287126361270621d1d5cef6916ac04cb45be  web/src/lib/stripe.ts
42ad6e68b33564735f3efc94b4b27400ee0b02b6ef848de4e7e7d70cbc39f8c4  web/src/lib/supabase/admin.ts
a6456e79e8a29ef646f032c99face20b96b1fce1a5ba31583022f90877c851d2  web/src/lib/supabase/client.ts
d2c853316e63297c13fd835917c40c533b913b8d1e32e12aae9f06116ba8f612  web/src/lib/supabase/middleware.ts
4bccd0149a1cdebd5c1084c79d1a7335ad51be70ce9bc54bdffa9aadfdb2c056  web/src/lib/supabase/server.ts
1146b3437250526eeb163add0f5baaa596e2f0ad9aff9f707f4f5d02e4f154d8  web/src/lib/supabase/types.ts
7d9e70d8fd4b73631e2c3e4ee73b16630f896bb8e1bf8542b835ae51a6a99f09  web/src/lib/trials.ts
7c8c3dfc0cdd370d44932828eb067ef771c8fe7996693221d5d4b90af6d54f2d  web/src/lib/utils.ts
```
