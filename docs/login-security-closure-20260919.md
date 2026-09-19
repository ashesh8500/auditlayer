# ALM login proxy-registration closure — PASS

Scope: close only the proxy-registration HOLD in `/tmp/alm-login-security-review.md`; not a new whole security audit or deployment approval.

Worktree: `/home/asheshkaji/projects/alm-login-20260919`
HEAD: `7f39a6dbe120fd66b11163ec3dc986ed84a5be1f` with reviewed uncommitted changes and staged proxy rename.
Final production build ID: `UL8_EIEiN6G0DCxEP3I0O`.

## Exact-source continuity

All six original reviewed SHA-256 values match the final source, verified both before and after the runtime probes (6/6):

```text
fa21d2267c5c88aee6091fbe3b6e1b48de9b7f69fd26e4579c445bb0e2a48e59  web/src/app/auth/callback/route.ts
9db879da4f707b768beffb34ec9fc1a117a3ed93f8f18f890ca18327469342c0  web/src/app/auth/callback/route.test.ts
f0243e48ca92b16b947ff4230853f31518d353dd002aeac19d78f2a51e044651  web/src/app/login/actions.ts
bad0ae4ad2c5e50e337ae8ed2c83a67d35f3f4ef21eb2e3389ca26d027effd8d  web/src/lib/supabase/middleware.ts
85fbe6c1aa7de792a620c03f55d61052a55490dd22fbb36a4eb3a3a7d84fca41  web/src/lib/supabase/server.ts
ab6b0644eedeaf72937577d1e017bc150379882a0097e7454cd4a9bedcbe7edd  web/src/lib/supabase/server.test.ts
```

`web/src/proxy.ts` is byte-identical to `git show HEAD:web/proxy.ts`:
`a6980d59826b6cca6f20362f2f8b9c528b929bf45dae8c8a5708722e56c6d7e3`.
Git status confirms `R web/proxy.ts -> web/src/proxy.ts`.

## Native Next registration — PASS

Read back rebuilt `.next/server/functions-config-manifest.json`: `functions['/_middleware']` now exists with `runtime: nodejs` and the configured matcher excluding API/static/image assets.

Executed the actual installed Next 16.2.10 `NextNodeServer.prototype.loadNodeMiddleware` and `getMiddleware`, using a prototype-backed context with `dev:false`, final `.next` distDir, `minimalMode:false`, and the actual middleware manifest path. No replacement loader/matcher was used.

```text
NEXT_MINIMAL enabled: false
Native loadNodeMiddleware exports: [ 'default', 'handler' ]
Native getMiddleware: {"page":"/","matchType":"function","protectedMatches":true}
```

The native matcher was invoked on `/settings/connections`; assertions required both a loaded module and matching middleware. Process exit: 0.

## Real local production HTTP guard — PASS

No-cookie GET (no redirect following):
`curl --max-time 10 --silent --show-error --dump-header - --output /dev/null http://127.0.0.1:3030/settings/connections`

Read-back response:

```text
HTTP/1.1 307 Temporary Redirect
location: /login?next=%2Fsettings%2Fconnections
Date: Sat, 19 Sep 2026 14:37:03 GMT
```

The `next` parameter is the proxy guard's redirect, distinct from the DAL's bare `/login`. This proves actual production HTTP reaches the registered guard rather than merely proving the handler can be imported.

Server identity was read from the listening socket and `/proc`:
- PID `4158248`, `next-server (v16.2.10)`.
- Working directory `/home/asheshkaji/projects/alm-login-20260919/web`.
- Start time `2026-09-19 14:36:47 UTC`.
- Final BUILD_ID file modification time `2026-09-19T14:35:53.673519+00:00`, preceding server startup.
- Final BUILD_ID read-back remained `UL8_EIEiN6G0DCxEP3I0O`.

## Conclusion and limits

PASS: the sole prior proxy-registration HOLD is closed against the rebuilt final source. The prior six-file security review retains exact hash continuity; the only proxy source change is its byte-identical convention-path move.

No application edits, deployments, provider calls, or database writes were performed by this closure. Full unit/build/typecheck and browser suites were not rerun here; parent owns their final results. No claim is made about deployed Vercel runtime or live OAuth completion. Port 3030 was initially not listening during the parent's restart; it was available for the successful probe. No remaining blocker within this bounded closure.

Created only this closure report. Report read-back is performed after writing before returning the verdict.
