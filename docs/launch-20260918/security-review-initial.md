# Initial adversarial security review — Instagram continuity

## Verdict: HOLD

Two release-blocking boundary defects remain in the reviewed snapshot: a targeted OAuth callback can restore credentials after a successful disconnect, and the provider-profile parser can silently round a bigint identity before persistence. The second is a pre-existing dependency defect exposed by the new identity-continuity contract, not a newly introduced line in this diff. No cross-tenant disclosure was reproduced.

Reviewed dirty worktree against `origin/master`; both HEAD and origin/master were `0ca79eadc84c89bca31d05dc4fdbb9122bd3439b`. Read mission, kernel-evidence and connections-evidence. No source edits, commits, deployment, live services, real OAuth or customer credentials. Only this report was authored. Local generated fixtures were removed and their absence read back.

The separate `20260918184915_instagram_worker_write_fence.sql` appeared during review and is **not reviewed or approved here**. Repository-wide static scanners enumerated its filename; their success is not a security review of that migration. All six installed function bodies covered by the continuity migration were compared with its source and matched at review end. Reviewed source hashes were unchanged between fingerprinting and the initial final check. Parent then changed only Connections page line 35 styling to `alm-focus inline-flex min-h-11 items-center` for the touch target; the page was reread and its final hash below updated. All other reviewed source hashes remained unchanged. Other lanes changed experience-contract files during the test runs.

## Findings

### SEC-1 — HIGH — Targeted reconnect can undo a completed disconnect

**Paths:** `web/src/app/api/auth/instagram/callback/route.ts:149-175`; `supabase/migrations/20260918182043_instagram_subject_continuity.sql:119-155,191-218`.

The callback checks the original connection ID, owner and Instagram ID with a separate SELECT, then invokes the nine-argument persistence RPC. That RPC receives neither the expected connection ID nor a generation/intent condition. Its profile lock serializes DB mutations but cannot invalidate a preflight already completed outside its transaction. If disconnect commits after the SELECT but before persistence acquires its lock, persistence recreates an active credential row. The user's successful “stored access deleted” response has been undone by the already-in-flight reconnect.

This is a same-owner consent/revocation-ordering defect, **not** an asserted foreign-owner exploit. The existing concurrency test runs simultaneous callbacks and then sequential disconnect/reconnect; it does not test this interleaving.

**Executed reproduction:** real PostgreSQL, separate psql sessions for each request-boundary operation, service_role for both RPCs:

1. Create a disposable owner and persist identity `9007199254740993`; retain returned connection C and account A.
2. Callback preflight SELECT with owner + C + exact identity returns **1**.
3. Another session calls disconnect(owner,C), commits; credentials count is **0**.
4. Resume callback by calling its unchanged nine-argument persist RPC for that same identity.
5. Read back: **new_connection_id=true, same_account_id=true, active_credentials=1**. Exact bigint is retained in PostgreSQL.

This is a deterministic schedule of the real SQL boundary, not a live HTTP/Meta race test. Reproduce with the script below from the repository root:

```sh
python3 - <<'PY'
import subprocess, uuid
cmd = ['docker','exec','-i','alm-kernel-test-20260918','psql','-U','postgres','-X','-qAt','-v','ON_ERROR_STOP=1']
def sql(s):
    r = subprocess.run(cmd, input=s, text=True, capture_output=True, timeout=30)
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()
u = str(uuid.uuid4())
persist = f"select connection_id::text||','||account_id::text from public.persist_instagram_connection('{u}',9007199254740993::bigint,'security_race_fixture','fixture-only',now()+interval '60 days','BUSINESS',1::bigint,1::bigint,'instagram');"
try:
    sql(f"insert into auth.users(id,email) values('{u}','security-race@example.invalid'); insert into public.profiles(id) values('{u}') on conflict do nothing;")
    c,a = sql('set role service_role;' + persist).split(',')
    print('preflight', sql(f"select count(*) from public.instagram_connections where user_id='{u}' and id='{c}' and ig_user_id=9007199254740993;"))
    sql(f"set role service_role; select public.disconnect_instagram_connection('{u}','{c}');")
    print('after disconnect', sql(f"select count(*) from public.instagram_connections where user_id='{u}';"))
    c2,a2 = sql('set role service_role;' + persist).split(',')
    print('new credential', c2 != c, 'same account', a2 == a)
    print('active', sql(f"select count(*) from public.instagram_connections where user_id='{u}' and is_active;"))
finally:
    sql(f"delete from auth.users where id='{u}';")
    print('fixtures remaining', sql(f"select count(*) from auth.users where id='{u}';"))
PY
```

**Minimum closure:** targeted persistence must validate the expected connection identity/existence inside the same transaction and owner lock as its write, rejecting a deleted/replaced target. Preserve the existing nine-argument compatibility API if necessary via a separate targeted wrapper. Add a deterministic disconnect-between-preflight-and-write regression test. Do not “fix” by denying a genuinely fresh, explicitly initiated reconnect after disconnect.

### SEC-2 — MEDIUM — Numeric provider bigint silently becomes a different durable identity

**Paths:** `web/src/lib/instagram-oauth.ts:54-66,183-207`; consumers `web/src/app/api/auth/instagram/callback/route.ts:157-167`; identity matching `supabase/migrations/20260918182043_instagram_subject_continuity.sql:125-139`.

The new start/callback DB reads correctly request `ig_user_id::text`. However, the actual provider response still passes through `response.json()`, allows `profile.user_id` to be a number, then calls `String(profile.user_id)`. This is too late to preserve an unsafe integer. Running the actual transpiled production OAuth function with fake HTTP Responses gave:

```text
providerRawId: 9007199254740993     persistedIgUserId: "9007199254740992" exact: false
providerRawId: "9007199254740993"   persistedIgUserId: "9007199254740993" exact: true
```

This can reject a valid targeted reconnect as identity_mismatch, persist a wrong identity on Add Instagram, and make neighboring provider identities collide in same-owner identity matching. It does not bypass owner scoping. Numeric `/me` output was an adversarial supported-input fixture, **not observed from live Meta in this review**. String-valued provider IDs work correctly.

**Executed reproduction:** from `web/`, transpile the actual module in memory and inject Responses; no source changes or network:

```sh
node - <<'JS'
const fs = require('fs'), ts = require('typescript'), vm = require('vm');
const url = {}, oauth = {};
const compile = p => ts.transpileModule(fs.readFileSync(p,'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
vm.runInNewContext(compile('src/lib/instagram-oauth-url.ts'), {exports:url,URLSearchParams,Date});
vm.runInNewContext(compile('src/lib/instagram-oauth.ts'), {exports:oauth,require:()=>url,URLSearchParams,AbortSignal,console,fetch,Number});
(async () => {
  for (const rawId of ['9007199254740993','"9007199254740993"']) {
    const responses = [
      new Response(JSON.stringify({access_token:'fixture-short',user_id:'9007199254740993',permissions:[...url.INSTAGRAM_OAUTH_PERMISSIONS]})),
      new Response(JSON.stringify({access_token:'fixture-long',expires_in:3600})),
      new Response('{"user_id":'+rawId+',"username":"fixture_bigint","account_type":"BUSINESS"}')
    ];
    const r = await oauth.completeInstagramOAuth('fixture-code', {appId:'fixture',appSecret:'fixture',redirectUri:'https://example.invalid/callback',fetchImpl:async()=>responses.shift()});
    console.log({providerRawId:rawId,persistedIgUserId:r.igUserId,exact:r.igUserId==='9007199254740993'});
  }
})();
JS
```

**Minimum closure:** preserve identity as exact decimal text through provider parsing, or reject unsafe numeric profile IDs before persistence. Validate positive canonical identity text within the supported bigint range. Regression cases must include raw JSON numeric unsafe IDs, not just a JS object with an already-rounded number, plus exact string IDs and adjacent IDs. This does not require changing all metric-number handling.

## Boundaries that passed / limitations

- **State and CSRF:** start uses a cryptographic 32-byte nonce, owner-bound structured state, HttpOnly + Secure + SameSite=Lax callback-path cookie and ten-minute max age. Callback authenticates using `getUser`, validates state before provider exchange, and clears the cookie on success/error paths. Direct execution rejected foreign owner, wrong nonce, expired/overlong expiry and malformed target. Cancellation and expiry route tests passed. Cookie JSON is not signed or server-consumed; this review did not establish a cookie-injection attacker or replay exploit and does not elevate that alone into a finding. Actual browser cookie semantics and provider single-use-code behavior were not exercised.
- **Return URL:** exact path allowlist rejected protocol-relative, absolute, backslash, dot-segment and query-bearing attacker inputs. Valid local subject/audit paths remained local. Allowlisting a resource path is not ownership authorization; destination routes must continue to check ownership.
- **Target checks:** start and callback use explicit owner+connection filters; callback rejects a different identity. DB reads use text casts. Race and provider parsing exceptions are SEC-1/2 above.
- **Grants:** installed SECURITY DEFINER functions pin empty search_path and explicitly revoke PUBLIC/anon/authenticated execution, granting only service_role. Actual anon/authenticated attempts to invoke persistence were denied. Accounts has only authenticated SELECT in this local scaffold; the new durable identity is not customer-writable via an ordinary table UPDATE. No new table/RLS relaxation in this migration. Hosted PostgREST/real-JWT behavior remains unverified.
- **Tenant isolation:** real SQL suite rejects foreign disconnect, foreign account classification and corrupt cross-owner channel linkage. Same Instagram ID under two owners yields distinct durable account IDs. Connections list, off-page target and callback queries explicitly owner-filter even in customer admin views; browser card projection contains no token fields. This is scoped evidence, not a blanket claim about every legacy endpoint.
- **Username ambiguity:** runtime suite passed normalized managed-channel relink, observed-channel isolation, ambiguous-match rollback, different-identity same-handle rejection and rename-collision rollback. SQL does not pick an unrelated earliest Subject. The unsafe legacy backfill is not called by this migration; do not invoke it as rollout repair.
- **Retained/purged data:** runtime suite proved credential deletion and reusable account/audit/progression metric-cache purge while retaining account/channel/audit/progression IDs, report versions, share links, briefs and batches. Report-derived history retention is explicit in the new UI. Stable identity survives renamed reconnect. This is not full account deletion. An in-flight worker's later writes are outside this migration's protection; the independent worker-fence lane requires final integration review.
- **Disconnect action:** authenticated owner is server-derived, not form-derived; connection UUID is untrusted input passed to the owner-checking RPC. Errors are generic. Native Server Action request-origin protections were not exercised by these unit tests; no manual cross-origin HTTP test is claimed.

## Verification actually run

| Check | Observed result |
|---|---|
| Targeted Vitest: start/callback, OAuth parser/URL, disconnect, Connections page/card | 7 files, 48 tests passed |
| `instagram_subject_continuity_test.sql` in local PG17 container | Five behavioral blocks passed; transaction rolled back |
| `instagram_subject_concurrency_test.py` | 2 tests passed, including 8 concurrent service-role callback sessions and unprivileged denial |
| SEC-1 request-boundary SQL schedule | Reproduced deleted access being restored; fixture removal verified |
| SEC-2 actual OAuth helper with fake Responses | Reproduced numeric bigint corruption; string control passed |
| Direct state / return-path helper probes | Unsafe returns fell back to Connections; invalid state rejected |
| Installed function source comparison | All six continuity function bodies matched reviewed migration |
| `python3 scripts/check-migrations.py` | migration contract OK: 64 files, latest=20260918184915; static only |
| `python3 supabase/tests/tenant_access_contract_test.py` | TENANT ACCESS CONTRACT PASSED; static only |
| Correct full web command `pnpm test` | 67 files passed / 1 failed; 700 tests passed / 1 failed (701); experience-contract zero-violations assertion remained red |
| `git diff --check` | Passed |

An earlier overbroad `pnpm exec vitest run` incorrectly collected four Playwright suites and also saw three experience-contract failures; those collection errors are a reviewer command error, not product regressions. The correct package command excludes e2e. Concurrent integration edits reduced the experience-contract failures between runs; rerun the full suite on the final frozen integration commit. No live/browser verification was performed, and no successful production release is implied.

## Reviewed source fingerprints (SHA-256)

These identify the initial review, not any later remediation or new worker migration.

- `supabase/migrations/20260918182043_instagram_subject_continuity.sql`
  `11490fa19047b730e5cc521eb0187d7ff9654818cafcd4086d24ba14ece045f6`
- `web/src/app/api/auth/instagram/start/route.ts`
  `3ab6f672176b9c48f4bc403c7de8c8a115025151ac5de39791af94798d46c9f0`
- `web/src/app/api/auth/instagram/callback/route.ts`
  `7a2a12e3276c6460970d7e2a212f44ec3c89b48ca335e71b1960788f4e729224`
- `web/src/lib/instagram-oauth-url.ts`
  `08ce7ea3b29b31fc6f871ea0f2eaa96a7f983ee5cad848846aa9ccb0b5be53b4`
- `web/src/lib/instagram-oauth.ts`
  `edb7db4d3e769b3069b150c78b8085fd0a1b8999c17cf2590c8f287161db36af`
- `web/src/lib/instagram-oauth-config.ts`
  `efc6e0bf7fc48b8c2c699d5536bea572c4881969257d24e135dc411e1b9d2ae7`
- `web/src/lib/actions/instagram.ts`
  `5fa5e7f500355235ad0eae0d051343a7bd6e421fc2a599ba6a8eedd38f4788bc`
- `web/src/app/(app)/settings/connections/page.tsx`
  `c3c6267b358fff3cdde2eb53e05e17b59d5c6e1d3434f06f9bf83d5d31031d46`
- `web/src/lib/instagram-connection-public.ts`
  `4e66bd83d29044714db72897afe99f81a23e596c1adaf62e43e1543135aa4f94`
- `web/src/components/instagram-connect.tsx`
  `3a5923b26d527e3185cf9bd60505b845fbe86f7caf4b416d210a35a8767187ff`
- `web/src/app/privacy/page.tsx`
  `a0bd9bbaeb29504bf7c1c146c021c6964b5ef7457a975c290a4bb625fdaa58c3`
- `web/src/app/data-deletion/page.tsx`
  `703ead5c6642e95e16901d24d0bac157c336d76eca680cce0ce7876bb45a03ef`
- `web/src/lib/auth.ts`
  `c30364dee61a7b498c756187297d0641a9351156958dc8f15a749ff08566a602`
- `web/src/lib/intelligence/subject-reads.ts`
  `decff4f4a27df9696ef0cf3c8ed7a53243e9be50b9763601e874fbdb555695bf`
- `web/src/lib/intelligence/subjects.ts`
  `44a79931e76f7188c0b5acc7df1fd5ccca5a7c833e516b0c473599140e2225e1`
