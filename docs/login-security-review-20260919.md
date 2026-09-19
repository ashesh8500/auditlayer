# ALM PKCE hotfix independent review — HOLD

## Exact scope
Worktree: `/home/asheshkaji/projects/alm-login-20260919`; base/HEAD `7f39a6dbe120fd66b11163ec3dc986ed84a5be1f`. Reviewed frozen uncommitted six-file change. No application source edits, deployment, real provider requests, credentials, or database mutations performed. Offline fetch/admin doubles were used. Parent-created documentation appeared during review; six source hashes remained identical at completion.

## Blocking finding — HIGH correctness: compiled proxy is not registered in the local production server

The proxy artifact **does exist and contains the correct hotfix**. This finding does NOT infer lack of wiring from an empty Edge manifest alone, nor from the localhost Host-header request alone.

Production build ID: `9zk9xFAJWNzt7kFWuDv-M`.

Evidence:
1. `web/.next/server/functions-config-manifest.json` has no `functions['/_middleware']` entry. The Edge middleware manifest also has no `/` entry.
2. Installed Next.js 16.2.10 `web/node_modules/next/dist/server/next-server.js:1065-1073` loads `.next/server/middleware.js` in production **only when the functions config contains `/_middleware`** (unless dev). `getMiddleware`, lines 996 onward, falls back to this loader when Edge middleware is absent.
3. Executed those actual installed native methods against the existing production build, with `{dev:false, distDir:path.resolve('.next')}`. Output:
   ```text
   NEXT_MINIMAL enabled: false
   Native loadNodeMiddleware: undefined
   Native getMiddleware: undefined
   Compiled module exports: [ 'default', 'handler' ]
   Compiled config: undefined
   ```
4. Separately executed the actual compiled `middleware.js.handler` to distinguish correct handler code from missing registration:
   ```text
   Built handler alias 308 https://auditlayermedia.com/login?next=%2Fsettings
   Built handler callback 200 1
   ```
5. Local production HTTP `GET /login?next=%2Fsettings` on port 3030, with Host and X-Forwarded-Host set to `www.auditlayermedia.com` and X-Forwarded-Proto https, returns **200**, not 308. Host rewriting alone could make this ambiguous; native loader evidence above removes that ambiguity about registration.

Relevant source configuration: `web/proxy.ts:10-20` is at the web root, whereas app routes are under `web/src/app`. Installed Next build discovery (`next/dist/build/index.js:613-634`) scans the parent of appDir/pagesDir for convention files. This is a likely reason the artifact can exist while the production loader registration is absent; the reviewer did not move files or rebuild.

Impact: the newly added exact-www canonicalization and passive-refresh protections are not active in this `next start` build. Existing root placement predates this patch, but this hotfix relies on it to close the independently reproduced alias-cookie incident. A green unit test calling `updateSession` and a compiled source-map match do not close that integration gap. No claim is made that DAL authorization itself is bypassed, or that Vercel's separate adapter necessarily has identical behavior.

Release gate: register the proxy at the convention location appropriate to `src/app`, rebuild, and prove that native `getMiddleware()` returns a matcher and production HTTP reaches the guard; alternatively provide equivalent concrete Vercel adapter registration/runtime evidence. Re-review any source expansion and hash the revised source. Do not treat the present six-file state as deploy-ready solely because the handler compiles.

## Auth/security behavior verified — no material finding in the changed helper/handler logic

- Fresh Google initiation uses `createClient({freshSignIn:true})`; ordinary clients retain prior behavior.
- Callback hides old session values from SDK initialization, retains cookie names for obsolete chunk cleanup, and keeps the SDK jar request-local. It does not treat a verifier as authorization.
- Real installed SDK succeeds on a fresh PKCE exchange with a revoked old session and does not request refresh first.
- Missing verifier fails without a provider exchange or session cookie. Invalid code and mismatched verifier, represented by deterministic auth-endpoint rejections, fail without a session cookie or trial redemption.
- Callback trial `getUser()` sends the **fresh access token** and redeems against **fresh-user**, not the old session. A rejected getUser does not redeem. All admin operations were mocked.
- Token-hash/magic-link success still populates a fresh session and fresh-user trial redemption without old-session refresh.
- No callback credentials fail closed despite an old session cookie.
- Successful replacement removes obsolete `.0`/`.1` session chunks and removes the verifier. Request-local state prevents accidental old-session fallback.
- Direct middleware tests deny verifier-only requests at all six protected prefixes: dashboard/admin/audits/subjects/accounts/settings.
- Exact www alias normalization preserves path/query and forces canonical https/no port. Canonical host, preview host, and a www suffix-lookalike are not redirected by that guard.
- Passive refresh retains in-flight verifier while still clearing revoked session cookies. Explicit sign-out behavior was not changed.

## Executed regression verification

1. `pnpm exec vitest run src/app/auth/callback/route.test.ts src/lib/supabase/server.test.ts`: **8/8 passed**. Expected revoked-refresh AuthApiError appears on stderr in its test.
2. Independent extra test harness outside the repo: `pnpm exec vitest run --config /tmp/alm-review-vitest.config.mts`: **13/13 passed**, covering rejected code/verifier, fresh trial identity, denied getUser, magic link, missing callback credentials, exact alias boundaries, and all protected prefixes.
3. Full `pnpm test`: **71 files, 732/732 tests passed**; log `/tmp/alm-login-review-tests.log`.
4. `git diff --check`: passed. Six hashes unchanged across the review.
5. Production native loader + built-handler probes: results above.

The independent harness initially required fixing its /tmp module resolution and Next headers mock; final run is green. These were harness setup errors, not application findings. Build/typecheck and 15 browser tests were reported green by parent, not independently rerun here. Google consent, real Supabase validation, production Vercel runtime, and real trial DB redemption were not exercised. Invalid/mismatched auth responses are explicit test doubles, not invented provider observations.

## Frozen source SHA-256

```text
fa21d2267c5c88aee6091fbe3b6e1b48de9b7f69fd26e4579c445bb0e2a48e59  web/src/app/auth/callback/route.ts
9db879da4f707b768beffb34ec9fc1a117a3ed93f8f18f890ca18327469342c0  web/src/app/auth/callback/route.test.ts
f0243e48ca92b16b947ff4230853f31518d353dd002aeac19d78f2a51e044651  web/src/app/login/actions.ts
bad0ae4ad2c5e50e337ae8ed2c83a67d35f3f4ef21eb2e3389ca26d027effd8d  web/src/lib/supabase/middleware.ts
85fbe6c1aa7de792a620c03f55d61052a55490dd22fbb36a4eb3a3a7d84fca41  web/src/lib/supabase/server.ts
ab6b0644eedeaf72937577d1e017bc150379882a0097e7454cd4a9bedcbe7edd  web/src/lib/supabase/server.test.ts
```

Files created by reviewer: this report, `/tmp/alm-review-extra.test.ts`, `/tmp/alm-review-vitest.config.mts`, `/tmp/alm-login-review-tests.log`. Application source modified: none.
