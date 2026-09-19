# Login PKCE recovery hotfix

Incident: 2026-09-19 14:17 UTC. Production `/auth/callback` logged `PKCE code verifier not found in storage`; the user's screenshot showed the generic auth error.

## Reproduction

- Actual installed `@supabase/ssr` / auth-js regression: a revoked previous session triggers automatic refresh/cleanup, clearing an independently created PKCE verifier. Reproduced RED on middleware callback and passive refresh paths; fresh sign-in also attempted an unwanted old-token refresh.
- Live Google start on canonical host creates the verifier cookie. Live start on `www.auditlayermedia.com` leaves no verifier cookie on the canonical callback host. No Google credentials, consent, or successful Google round trip used in these probes.

## Fix scope

- Isolate an explicit fresh Google sign-in from old session initialization.
- Isolate callback exchange from old session initialization; keep cookie names for obsolete-chunk cleanup and newly written session for trial redemption.
- Skip passive middleware authentication on callback; it authenticates through the real provider code exchange itself.
- Preserve pending PKCE verifier during passive session cleanup while still removing revoked session cookies and enforcing protected-route authentication.
- Normalize the exact public www alias before initiating host-bound login.

No changes to billing, models, workers, database, customer roles, or password security. No authentication bypass: missing/invalid provider exchange remains denied.

## Verification before release

- Observed RED→GREEN with actual installed SDK and stubbed HTTP transport, not a mocked auth client.
- 8 new focused tests: revoked-session sign-in/callback, callback middleware bypass, passive cleanup, www canonicalization, unauthenticated protected-route denial, missing verifier denial, obsolete cookie chunks.
- 732 full web tests passed; production build + typecheck passed; lint zero errors / 13 pre-existing warnings.
- 15 production-mode browser tests passed against local server3030, including signed-in Subjects/Connections/Reports.
- Independent security review passed 13 additional offline security cases; all six reviewed file hashes retained through closure.
- Review found Next compiled but did not register root `web/proxy.ts` beside a `src/app` tree. Moved it byte-identically to `web/src/proxy.ts`, rebuilt, restarted, and repeated all 732 tests and 15 browser checks.
- Independent closure PASS: native Next `loadNodeMiddleware()` loads the handler, `getMiddleware()` returns the protected-route matcher, and actual production HTTP returns `307 /login?next=%2Fsettings%2Fconnections`.
- Review artifacts: `login-security-review-20260919.md` and `login-security-closure-20260919.md`.
- Pre-release rollback deployment: `https://web-igmjc8kas-ashesh8500s-projects.vercel.app` (`dpl_W9yHUy36reSxZztDGMYV72X3Te5x`), inspected Ready with both production domain aliases. No schema or worker change to reverse.
- Live Google consent completion requires the user's existing Google session/secure sign-in; do not describe SDK fixtures or a generated tester magic link as proof of that round trip.
