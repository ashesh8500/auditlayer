# Independent final security closure review

## Verdict: PASS — exact-source code gate

WEB-1 and both worker HIGH findings are **closed**. SEC-1 and SEC-2 remain **PASS**. No material open code finding was identified in this bounded closing review. This supersedes the corresponding HOLD findings in `security-review-initial.md`, `security-review-web-final.md`, and `security-review-worker.md` for the source fingerprint below; it does **not** approve deployment or claim live launch acceptance.

Repository: `/home/asheshkaji/projects/alm-launch-20260918`. HEAD and `origin/master`: `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b`. Reviewed the frozen dirty worktree, not a nonexistent final commit. No source/schema edits, function installation, commit, deployment, external provider, or paid-model calls were made. Only this report was authored.

## Prior findings — final disposition

| Prior ID | Final disposition | Evidence and boundary |
|---|---|---|
| WEB-1 / WEB1, MEDIUM | **CLOSED — PASS** | Customer detail retains the authenticated profile, applies `user_id=profile.id`, and rejects a mismatched returned owner before rendering or metadata reads (`web/src/app/(app)/audits/[id]/page.tsx:31–41`). Reader does the same and has no admin exception (`read/page.tsx:18–30`). Executed actual page functions with broad-admin/foreign-row doubles: rejection; owned controls and explicit owner predicates pass. Detail 5 + reader 3 + access-boundary 85 = 93 passing tests. |
| Worker HIGH1, disconnected managed identity / raw checkpoint resurrection | **CLOSED — PASS** | `get_instagram_token` now checks the owner-scoped durable audit/account mapping when credentials are absent, including renamed handles, then uses owner/platform/handle fallback when no account mapping exists (`supabase_client.py:108–147`). Retained managed identity returns reconnect-required, not public. `_start_instagram_fetch` passes audit ID and raises on reconnect/lookup failure; `_checkpoint_cache` neither waits on unresolved lookup nor emits raw cache on exceptional lookup or missing managed fence (`pipeline.py:818–873,1098–1122`). The actual pipeline/gateway claim-before-disconnect regression cannot restore captured research and emits reconnect-required. Genuinely public fallback remains available. |
| Worker HIGH2, initial ready→failed after committed RPC timeout | **CLOSED — PASS** | Initial finalizer reads back the same audit/path and compares immutable prompt/template/bundle/intelligence provenance (`supabase_client.py:431–463,510–544`). Matching committed version returns successfully. Empty, unavailable or conflicting readback produces `ReportFinalizationOutcomeUnknown`; pipeline returns without writing failed (`pipeline.py:550–599`). Actual gateway/pipeline tests simulate commit then `httpx.ReadTimeout`: one version, one finalize call, ready/needs_review retained. Success, no-version, unavailable and conflict controls also pass. No reupload or blind initial RPC replay. |
| SEC-1 / SEC1, HIGH targeted reconnect after disconnect | **CLOSED — PASS, carried forward and rechecked** | Targeted wrapper locks owner then expected connection/owner/exact bigint inside the transaction. All relevant callback and migration bytes match the prior final web PASS. Independent rollback-only SQL repeated preflight→disconnect→stale targeted write: `PIG01`, credentials remain absent. Explicit Add succeeds; stale replaced target rejects without mutating its replacement. Prior two-session lock-order results remain carried-forward evidence, not a fresh concurrency claim. |
| SEC-2 / SEC2, MEDIUM unsafe numeric bigint | **CLOSED — PASS, carried forward and rerun** | OAuth parser and route bytes match prior final web PASS. All 24 parser tests pass, including raw unsafe numeric JSON rejection, exact adjacent decimal strings and bigint maximum. Start/callback suites pass. Unsafe numeric provider identities are deliberately rejected rather than silently rounded; this is fail-closed, not lossless JSON-number support. |

Intentional admin access was preserved, not weakened: `/admin` layout requires `requireAdmin`, `/admin/audits/[id]` embeds the shared artifact API, and `getAuditForViewer` retains server-verified owner/admin authorization. These files and artifact routes match the prior web manifest. Customer page isolation is not a claim that admins lose their deliberate operator API access.

## Sibling-regression inspection

Read the complete remediated token-lookup and initial-finalizer methods, their surrounding reconciliation/exception paths, asynchronous Instagram fetch, checkpoint/progression fence helpers, generation failure/finalization path, and benchmark selection. Reviewed the baseline diffs and existing passing worker boundaries rather than reopening unrelated product scope.

- Managed lookup has explicit owner predicates on credentials, audits and accounts, plus Instagram platform filtering; failed reads propagate into fail-closed asynchronous lookup. Stable account linkage handles renamed targets without username-based identity reassignment. Real PostgREST query construction was exercised through `httpx.MockTransport`, including foreign audit/account controls.
- The worker's connected cache/progression writes still require credential lifetime context and the SQL fence. An exceptional or pending metrics future cannot authorize raw cache persistence. Genuine public/non-Instagram checkpoint behavior is preserved by sibling tests.
- Initial reconciliation reuses the existing immutable version helper; regeneration/refinement tests remain green. Unknown is conservative even for empty readback: it is not relabeled a definite failure. Future operator/reaper reconciliation is a separate operational obligation, not proof of automatic exactly-once recovery.
- Benchmark eligibility now applies active + connected + explicit `instagram` family + strictly future expiry before `LIMIT 1` (`benchmark.py:86–113`); expired/reconnect/legacy-family/null-family controls are excluded and no eligible row yields no case. This is fixture/query correctness, not a live connected benchmark.
- Existing worker recovery, bounded active-health, token-refresh fencing, cache freshness and finalization sibling suites remain green. No new material sibling regression was found.

## Verification independently executed

All PostgreSQL execution used the existing disposable `alm-kernel-test-20260918`; each mutation probe was transaction/rollback-only. No migrations or function bodies were installed or altered.

| Check | Observed result |
|---|---|
| Full worker suite, `PYTHONPATH=. /home/asheshkaji/projects/auditlayer/worker/.venv/bin/python`, `pytest.main(["-q","-rs"])` | **709 passed, 11 skipped**, 13.87s. Existing `test_sweeps.py` skips say eligibility moved into atomic PostgreSQL RPC; skips are not passes. |
| Worker subset: remediation, cache fence, Instagram API, signal freshness, report-version finalization, pipeline finalization, recovery, active health, job health | **156 passed**, 2.58s; includes all **13** remediation cases. |
| Python audit hook around both worker runs | Rejects non-loopback `socket.connect`; **EXTERNAL_SOCKET_ATTEMPTS []** on both. Loopback is retained for the existing TCP-reachability test. |
| Exact targeted Vitest: customer detail/reader, access-boundary, OAuth parser, start, callback | **6 files / 145 tests passed**; WEB1/access subset 93, parser 24, start 9, callback 19. |
| Package test invocation (`pnpm test -- <requested files>`) | The package script retains `vitest run src`, so it ran the **full web suite: 69 files / 724 tests passed**, not just the requested subset. The exact subset was subsequently rerun with `pnpm exec vitest run <files>`. |
| `worker/tests/worker_remediation_boundary.sql` | PASS: actual persist/disconnect preserves renamed managed identity, purges captured checkpoint, and service-role initial finalization exposes exact immutable readback and ready state; ROLLBACK. |
| `worker/tests/instagram_worker_fence.sql` | PASS: stale progression/cache/snapshot/token/reconnect rejected, purge retained, reconnect/same-token rotation fenced, refreshed version accepted, TTL/non-sliding reuse/zero preserved, service/anon/authenticated ACL behavior; ROLLBACK. |
| Independent SEC1 ordered SQL probe | PASS: stale targeted reconnect denied after disconnect; explicit Add allowed; replaced target unchanged; ROLLBACK. |
| Fixture readback after SQL | **0** users with `closure-sec1@example.invalid`, `worker-remediation@example.invalid`, or `worker-fence@example.invalid`. |
| Source versus installed `pg_proc.prosrc` | All **9** function bodies from the three launch migrations match after surrounding whitespace trim; every config pins empty search_path. ACLs are owner/service_role only; rotation trigger function owner only. |
| `python3 scripts/check-migrations.py` | `migration contract OK: 65 files, latest=20260918190801`. |
| `python3 supabase/tests/tenant_access_contract_test.py` | `TENANT ACCESS CONTRACT PASSED`; static evidence only, not hosted JWT/storage proof. |
| `git diff --check origin/master` | PASS. |
| Final source rehash versus review-start snapshot | No drift across all 71 changed/new non-document files captured at start, including the excluded generated experience artifact. |

The original failing outcomes were already independently reproduced in the prior reports. This review reran their remediated cases, not old-source RED tests. Expected sanitized negative-OAuth stderr is not a test failure. No execution blocker was encountered.

## Source reconciliation with prior independent reviews

Programmatic comparison against the final web manifest found exactly these changed existing files:

- `web/src/app/(app)/audits/[id]/page.tsx`
- `web/src/app/(app)/audits/[id]/read/page.tsx`
- `web/src/app/(app)/audits/[id]/page.test.tsx`

The only additional `web/src` file is `audits/[id]/read/page.test.tsx`. Every other file in the prior full web/migration manifest is byte-identical, including SEC1/SEC2 implementations, admin/API authorization and all 65 migration files.

Against the independent worker HOLD manifest, only `pipeline.py` and `supabase_client.py` changed. The newly changed benchmark implementation was absent from that prior manifest and was inspected here. Every entry in `worker-remediation.md`'s eight-file snapshot matches, including the benchmark and two new regression files. Worker loop, observability, Instagram API and fence migration bytes carry forward unchanged from their earlier independent review. Newly added tests are identified by the final manifest, not assumed to have existed in the old review.

## Separate launch/operational blockers and limitations

These are **not additional code HOLD findings** and are not cleared by this PASS:

1. Live Meta consent/reconnect and connected-account acceptance, hosted PostgREST casts/real JWT RLS/private storage, external research/model configuration and live quality/performance benchmarks remain release acceptance gates. No live provider or customer credential was used here.
2. Schema must precede the worker rollout; drain old privileged direct-writing workers. This review did not deploy or verify production schema/binary parity.
3. Hard wall-clock model cancellation remains explicitly deferred. Active health expiry is observation, not cancellation or authorization for blind mid-finalization restart. Unknown finalizations require the established reconciliation/operational policy.
4. Parent owns build/typecheck, browser/E2E and deployment decisions. Fingerprinting E2E/config/scripts below does not claim they were independently browser-executed or security-audited. Prior concurrency evidence is carried forward because source/installed bodies match; this closure used rollback-only probes rather than the fixture-committing concurrency runner.

## Exact-source fingerprint

The manifest includes **all changed/new implementation, migration, test, E2E and source configuration/script files** relative to the pinned baseline, excluding docs and generated `web/artifacts/experience-contract.json`. Build output, caches and test reports are not source approval. Unchanged source remains anchored by baseline plus the prior full web/migration manifest; this is a bounded closure, not a fresh full audit of legacy code.

Canonical manifest: **70 files**, SHA-256 **`2fcf249e9610fb60db40c51fb59e815b38c3b4883e2e4329f4edada9acc63a88`**. Digest is over the sorted lines below, each `sha256`, two spaces, repository-relative path, LF; no code fences. Any implementation/migration byte change invalidates this exact-source PASS until reviewed.

```text
11490fa19047b730e5cc521eb0187d7ff9654818cafcd4086d24ba14ece045f6  supabase/migrations/20260918182043_instagram_subject_continuity.sql
9b0b5c8987a7e5c85dafbf3437ca642abe7a5a94f41daeda9239a38085c4b6c7  supabase/migrations/20260918184915_instagram_worker_write_fence.sql
2da52717e6f11eb9b5bf84a554e2fdc5cc512b3c98235d57788296a29e930acf  supabase/migrations/20260918190801_instagram_targeted_reconnect_guard.sql
aea9a98ab0c702c997549e317a9e70fca781d6dea9b0db865bc3ac42baa2106e  supabase/tests/instagram_subject_concurrency_test.py
0abf956f4454d15453c83157c435b995415c022c6fb3e3f45141cbe9a552d055  supabase/tests/instagram_subject_continuity_test.sql
c4ad56afa05d8427a0d15b0ec5402ccc4c118a1e67b49725f36a129b47941125  supabase/tests/instagram_targeted_reconnect_test.py
411d524964266ec5d8f6ca2f997078a99d5bb28f9829af2fc55ba9209eb09748  web/e2e/connections.spec.ts
69c574fb59017764f18598b88532ef9c801f384e563ac431c60b1996a8cad9a6  web/e2e/preview-login.spec.ts
d29be83a2b9ea4a0402b646a9dc9766e52eebfa87bd28bccfddc6999b5aa65ad  web/playwright.config.ts
486d79a1a4b9676c157605c65ba29c02eb3083be38422e10c9b4d57b473266ce  web/scripts/qa-launch-connections.mjs
8e1a8f4f4ef8cee20c614c066ce7d7e978e59affcbdba70ff9eeefa40123ebfe  web/src/app/(app)/accounts/[id]/page.tsx
e639413f2e38389bb528e021d376cf60c36470cb17eccff2be48a86ada59a3db  web/src/app/(app)/accounts/page.tsx
e0acb61ae3799b263fec0e452dce9e8778f0ba2012f4356a5a196d3cce401b18  web/src/app/(app)/audits/[id]/page.test.tsx
ac4610d2a04b497759c99e264a0cba9f4cdfdb991792842f0f5897490dbda56d  web/src/app/(app)/audits/[id]/page.tsx
151ba5902584fa2b606b55e99b2112f5771532496b306324633845a37f45725b  web/src/app/(app)/audits/[id]/read/page.test.tsx
a9c0f2aa73d145a1d7d152149ecac50ec3349cbe032b59019e8347be04d4a395  web/src/app/(app)/audits/[id]/read/page.tsx
70d8acfeac5d64ddf32afab313bb68c34f554a10736786269d540c409c1517dc  web/src/app/(app)/audits/new/page.tsx
4d07e730d3323f4e06dc59b711452887dab1fd90adc7396e39e70e5555117f52  web/src/app/(app)/audits/new/page.usage.test.tsx
bc7cec96ac844ed840e2ec2139e00b13502f3b2373c6b3caf2fd125539031788  web/src/app/(app)/dashboard/page.behavior.test.tsx
02756958e8b449b0264c83dcd550c56031734ad7ab03aafbccb33142ba4fd9d9  web/src/app/(app)/dashboard/page.tsx
5d429ac4eb37b7f06902626aee7a6605ad1de6dafa804ae4d30a48003963a024  web/src/app/(app)/settings/connections/page.behavior.test.tsx
4a759f64a59734394a96892c91d90ebcb2fa3676a0129ce707e548eceeb66a8a  web/src/app/(app)/settings/connections/page.tsx
6465c167288b7472bb3b6ed8babae86fd0cbf7d195a4b3eb6e838a4798d24c50  web/src/app/(app)/subjects/error.tsx
be097b4788e97263fac77467ab58a9f501734f586ec2c0df23c7314ca83edd4b  web/src/app/(app)/subjects/loading.tsx
b8c4821e41e2d6613f36f0b13ba7b1391e34fb7a4435663db044b0bacb441292  web/src/app/(app)/subjects/page.tsx
5aad41e22e0cc573da2a40f11f0b3670569d77386383a1a8c3146fe97cd745bd  web/src/app/(app)/subjects/subjects-page.test.tsx
fbe27cfed061d69d82e9517d2741fa604d648ab04ab8ec3b3cb36750120a9665  web/src/app/api/auth/instagram/callback/route.test.ts
509d0c1a7badedb672cfe910a4cfc25d70eacb6f591e75c7fbdf85d125cd3dd9  web/src/app/api/auth/instagram/callback/route.ts
d4e53cb5e35db10477e02d937eb7b69cc1643cc3137d247600bb25baa733a4a5  web/src/app/api/auth/instagram/start/route.test.ts
3ab6f672176b9c48f4bc403c7de8c8a115025151ac5de39791af94798d46c9f0  web/src/app/api/auth/instagram/start/route.ts
703ead5c6642e95e16901d24d0bac157c336d76eca680cce0ce7876bb45a03ef  web/src/app/data-deletion/page.tsx
a0bd9bbaeb29504bf7c1c146c021c6964b5ef7457a975c290a4bb625fdaa58c3  web/src/app/privacy/page.tsx
aba29492867df3b8833fec3d273cf95b649fae0800b11106e0bce77ce2311f61  web/src/app/support/page.tsx
a5e8ba3680e5d9610a14c902fd463cea29fde03839c39b1b13d27356a26fb3b6  web/src/components/app-header.tsx
1a5de130c54e43efddf5177897be390d6abd9e58adc051c9b18d74ea8993dbb6  web/src/components/connections-navigation.test.tsx
1bfc1699bd77d158aa34ac6ab3f4bfd08f64da16aaa22688e8898b05c4fa4ae3  web/src/components/instagram-connect.behavior.test.tsx
18014eba204194a3805602b0d0bf779fff936510146186ba28dfeabe6692ca43  web/src/components/instagram-connect.tsx
bd659b35eac5fe42568e9926c5dc10bd7c454bdd08332269666d0e0ab5a03694  web/src/components/intelligence/intelligence-wizard.tsx
c88dc0131ad87c39dc335d3ad4fc94041d6cb123a2d6bc7477390b9735526a5c  web/src/components/intelligence/subject-home.test.tsx
35a2cfa6f4118ca7f9f69efa3f0cb6eda478ba507f1bed77a335964fdb2f3dba  web/src/components/intelligence/subject-home.tsx
1ec3b2ec89ea9edda3e323fea7f09e174774544019a8fda901322d99c3354ed0  web/src/lib/actions/instagram.test.ts
5fa5e7f500355235ad0eae0d051343a7bd6e421fc2a599ba6a8eedd38f4788bc  web/src/lib/actions/instagram.ts
6ee15c6f11722cd7e40f1605e0df2eca172a78ecb13553a1381badbdd89441af  web/src/lib/experience-contract.test.ts
f82b88308ed01dac7a060c141555001cc2ef369b11751976fe860347fdbb6428  web/src/lib/experience-contract.ts
5ae260263bf4d491bdc679c9fcafa46e9d8a05494cc15e320084d8db950ea73d  web/src/lib/instagram-connection-public.test.ts
08ce7ea3b29b31fc6f871ea0f2eaa96a7f983ee5cad848846aa9ccb0b5be53b4  web/src/lib/instagram-oauth-url.ts
2f566a59a354db3bc7234c9262b5ccdf0c65d2689a667c174d8a99b489111939  web/src/lib/instagram-oauth.test.ts
25355970bfd897a2be199b811765de9c014e7c68427ffd271eddd2bd242567d9  web/src/lib/instagram-oauth.ts
287a3a3c8d174a3fb8532f719a844f01ea0e1dabc9cda352d82e232717525967  web/src/lib/instagram-trust-surfaces.test.ts
43b048b35b1dc018eca7bac29a0eb1b106c3236ce3bdc8afda415f600578096a  web/src/lib/intelligence/subject-history.behavior.test.ts
d732938b0b02b8932dc3d3e144f8997dc47d0ad030f1e831062ac8ac4a28cf04  web/src/lib/intelligence/subject-owner-scope.behavior.test.ts
decff4f4a27df9696ef0cf3c8ed7a53243e9be50b9763601e874fbdb555695bf  web/src/lib/intelligence/subject-reads.ts
44a79931e76f7188c0b5acc7df1fd5ccca5a7c833e516b0c473599140e2225e1  web/src/lib/intelligence/subjects.ts
313e06a61ddbc758faa7cbbc5f7701f45d6e24a0cb41621ecca9368c160af52f  web/src/lib/intelligence/types.ts
55f208aaf6425a733368e1b817214a2f1770ae4083d6e4c2f3029180fa26163e  worker/auditlayer_worker/benchmark.py
7c2bbc5030453e38e636fcdc17b83c6e9881ca6b88aedbd81b30662cbeee5a50  worker/auditlayer_worker/instagram_api.py
95146ce5a01b5781b0b0590f2e3595028c4c6e178eaa9dc8876fe7ed0de49b50  worker/auditlayer_worker/observability.py
494b1f3a8ce77d76ed74f5f6ddf41e0eded97cbe7d59a5c676ec3e27877d431c  worker/auditlayer_worker/pipeline.py
18ad461f3b7b9fd8f043b7c732b60b562d4f6f1ad2c9d548e1371db312308c02  worker/auditlayer_worker/supabase_client.py
32698ec8d058c7c50b2a250cf83350f065a48b6202dfcb695de2c380793418b2  worker/auditlayer_worker/worker.py
0941736e9749b6bc12090c5a62933ee43f3b07ebed1ab4a9db37b48d727610e0  worker/tests/instagram_worker_fence.sql
ca2b0e639cfc6b43604a1ea07211fe4ea84f0d9677642074460377a9012257ea  worker/tests/instagram_worker_fence_concurrency.py
2337e2aa14bcf84958541b9d55d5bfc3f7a9eb426fc49641050a0882a5841db5  worker/tests/test_instagram_api.py
5513189ad9b87d4cc496b8ee070f7ee4f69bf79e51a52a67af366be021e4e600  worker/tests/test_signal_freshness.py
79766afbb1a1360052141f85eeb1c1208b13a66d58951fd19a0f35d298a50624  worker/tests/test_worker_active_health.py
35b6dfd9f3122e59def5c9099b5f41f708df94b3c21933abec743bc577d6e3ec  worker/tests/test_worker_cache_fence.py
ab36b242cd8a8e88d5eb8ee594dabe5dea0d9873d56459cac90ef24a919c9d78  worker/tests/test_worker_job_health.py
f8cd545f2720bd36b4720f954aa601eac9fc2aa1ef358d8f6c3916e303ac71c3  worker/tests/test_worker_recovery.py
8791539fd6eea931ec00227e65fedc8d3f40762f3f680666cf6a2581ca4b9e0b  worker/tests/test_worker_remediation.py
ed95d712fa68030ddedd1ad17e5ab4b6408faed025515ec5dfbb485630b5ae63  worker/tests/worker_remediation_boundary.sql
```
