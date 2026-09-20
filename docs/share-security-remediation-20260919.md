# Share security remediation — 2026-09-19

## Outcome and scope

Implemented in the dirty `alm-report-mobile-20260919` worktree, without commit, deployment, live DDL, real email, production API calls, credential reads, tester reset, or shared Next build. Existing cache/brand/report presentation work is preserved. The owner audit detail page and generated database types were **not edited by this lane**.

Reverified F1/F4 and W12/W13/W14/W17. Initial executable regression run failed all four cases: global `verified_at` bypass, malformed expiry allowed, forged literal `verified` cookie, and absent authoritative session lookup. Disposable Postgres also reproduces the old anonymous token enumeration, authenticated foreign-audit insert, and owner zero-row revoke before applying the new migration.

## Security behavior

- Anonymous roles cannot read share metadata. Authenticated owners/admins can select only the explicit public owner DTO columns; code hashes, expiry, attempt/send counters and sessions are private.
- Direct authenticated inserts must target an owned (or admin-authorized), ready audit with an artifact. Browser roles cannot change mode/recipient or verification state; they can set only `revoked_at`, and cannot clear it.
- Existing foreign-audit links from non-admin creators are quarantined by revocation. Valid existing public/email links retain their modes; no restricted link becomes public. Legacy code hashes are cleared. The old `verified_at` remains historical telemetry, never visitor authorization.
- New share capabilities use 32 random bytes. Existing 8-character tokens remain compatible. Existing unsigned cookies are rejected.
- Email sessions use 32 random bytes in an HttpOnly, SameSite=Lax, root-path cookie (Secure in production). Only SHA-256 hashes are persisted. DB sessions bind the exact share row and normalized recipient, expire within 24 hours or the link expiry, and recheck revocation, recipient, readiness and artifact presence on every use. No new session-signing secret is needed.
- Challenge persistence, send reservation and successful one-time consumption are locked/atomic service-role-only RPCs. Limits: one attempted send per 60 seconds, five per link's one-hour window (anchored at the first reservation after the previous window expires), five verification attempts per challenge, ten-minute active code expiry. Failed delivery reservations count toward limits. Provider acceptance is followed by a checked activation; unactivated challenges cannot verify. Expired/resend races cannot activate a superseded code. Concurrent successful guesses consume exactly once.
- Resend receives actual authenticated raw-fetch requests with a ten-second timeout. No raw code, token, recipient or provider response body is logged or returned. Missing config/provider/DB failures fail closed. Wrong recipient send responses are generic, with conditional UI copy; recipient identity is no longer passed to the unauthenticated client.
- Owner revoke now checks affected row and independent readback before reporting success, scopes both link/audit IDs, and bumps the existing reports resource revision. Creation has readiness/artifact checks, checked insert, safe runtime projection and invalidation.
- Report HTML presentation remains intact. Responses use private/no-store and no-referrer; landing page is dynamic, noindex/nofollow and no-referrer.
- Verification code stage remains mounted during pending/error/retry/resend. Clipboard operations have success/error live status and selectable fallback. Expired links are inactive, not active. Long URLs/emails wrap and icon targets are at least 44px.

## Exact lane files

New:
- `supabase/migrations/20260919204112_share_security.sql`
- `supabase/tests/share_security_integration_test.py`
- `web/src/lib/share-security.ts`
- `web/src/lib/share-link-public.ts`
- `web/src/lib/share-security.test.ts`
- `web/src/lib/actions/shares.test.ts`
- `web/src/app/s/[token]/verify/route.test.ts`
- `web/src/app/s/[token]/share-report-view.test.tsx`
- `web/src/components/share-links.browser.test.ts`
- `docs/share-security-remediation-20260919.md`

Modified (preserving preexisting changes where present):
- `web/src/lib/access-boundary.ts`
- `web/src/lib/access-boundary.test.ts`
- `web/src/lib/share-access.ts`
- `web/src/lib/actions/shares.ts`
- `web/src/app/s/[token]/verify/route.ts`
- `web/src/app/s/[token]/share-report-view.tsx`
- `web/src/app/s/[token]/page.tsx`
- `web/src/app/api/share/[token]/report/route.ts` (only no-store/no-referrer added to preexisting presentation work)
- `web/src/components/share-links.tsx`

## Verification

Commands, run from `web/` unless specified:

```sh
pnpm exec vitest run src/lib/access-boundary.test.ts src/lib/share-security.test.ts \
  src/lib/actions/shares.test.ts 'src/app/s/[token]/verify/route.test.ts' \
  'src/app/s/[token]/share-report-view.test.tsx' src/components/share-links.browser.test.ts
pnpm exec tsc --noEmit --incremental false
# repository root:
python3 supabase/tests/share_security_integration_test.py
python3 scripts/check-migrations.py
```

- Focused suite: **6 files / 122 tests passed**, including real headless Chromium with actual freshly compiled app CSS at 320, 390 and 844px. Long-origin URL/recipient fixtures have no document horizontal overflow; copy/revoke targets meet 44px. Provider/server actions are mocked offline; no network escapes.
- TypeScript: **passed** on the final concurrent snapshot. Earlier unrelated allowance/Stripe type errors disappeared after their owning lane integrated generated types; no edits to those files here.
- Disposable PostgreSQL 16: **11 tests passed**, including actual role grants/RLS, old-hole reproduction, foreign-row quarantine, owner readback, private-column/RPC denial, attempt/send bounds, delivery activation requirement, expired codes/sessions/links, recipient/token binding, artifact readiness and two-session send/consume races. Each run creates a unique `alm-share-security-<uuid>` container with `--network none`, no published port, and destroys only that container. Cleanup verified: no matching container remains. No use of the other lane's `alm-commercial-test` container.
- Migration checker: **PASS, 70 files, latest `20260919204116`** at verification time; our CLI-created timestamp `20260919204112` is unique. Concurrent later migrations are expected; none were rewritten.
- Focused production ESLint: zero errors; the sole remaining unused `_token` parameter warning is preexisting in the canonical cookie-path helper.
- The database test applies exact historical `0006_share_links.sql` + the additive security migration against a minimal supporting auth/profiles/audits fixture, **not the whole application migration chain or a deployed Supabase REST service**. Full-chain replay and independent release review remain parent integration gates.
- No production-mode full app build, deployed QA, actual Resend delivery/inbox receipt, or production RLS state is claimed.

## Migration compatibility and release requirements

Created using canonical `npx --yes supabase migration new share_security` after inspecting CLI help. Only this new migration is edited. Changes add four private counters/timestamps, the RLS-protected `share_sessions` table and two SECURITY INVOKER service-only RPCs; replace share policies/grants; revoke public legacy function execution; and remove the historical updated-at trigger, whose target share table has no `updated_at` column.

**Apply migration before web code**, then verify grants/RPCs before enabling traffic to the new release. Old owner queries using `select('*')` will fail under column grants, so the parent owner-page projection must ship with these changes. Old verification cookies must not be honored during rolling deployment: coordinate the web cutover/maintenance so old instances with the forged-cookie bypass cannot keep serving shares. A DB-only migration does not repair old application authorization code.

Required server-only deployment configuration (names only):
- `RESEND_API_KEY` with email-send permission.
- `SHARE_EMAIL_FROM`, or existing `AUTH_EMAIL_FROM`, set to a Resend-verified sender/domain. No automatic onboarding-domain fallback for this flow.
- Existing Supabase admin URL/service-role configuration (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) for the server-only RPC/read paths; existing public Supabase configuration for owner auth.

Never expose the service-role or Resend key through `NEXT_PUBLIC_*`, client props or logs. Verify delivery-domain configuration separately; the offline tests prove provider request semantics and failure behavior, not deliverability. New email-link creation returns truthful unavailable feedback when email/admin configuration is absent. Restricted links stay restricted.

Rollback is **forward-only security repair**: do not restore public enumeration grants, the foreign insert policy, global verified authorization, or old unsigned-cookie code. Keep the schema and temporarily fail closed on restricted delivery if provider configuration fails. Already downloaded report copies cannot be recalled; previously exposed public capability tokens are not all rotated by this migration (only unauthorized foreign-created links are quarantined). Evaluate broader historical token rotation separately if exposure is confirmed.

## Parent integration snippet (owner audit detail)

Public contract retains `ShareLinkRow` as a type-only alias in `@/lib/actions/shares`, now backed by `ShareLinkPublic`. Exact columns:

```text
id,audit_id,token,mode,email,verified_at,created_by,created_at,expires_at,revoked_at,view_count
```

`verified_at` is optional-to-display historical telemetry, not code material or an authorization grant. No code hash/expiry, send/attempt counters, session hashes or future fields may be serialized. Prefer the exported allowlist and explicit runtime projector:

```tsx
import { SHARE_LINK_PUBLIC_COLUMNS, projectShareLink, type ShareLinkPublic } from '@/lib/share-link-public';

const { data: shares, error: sharesError } = await supabase
  .from('share_links')
  .select(SHARE_LINK_PUBLIC_COLUMNS)
  .eq('audit_id', audit.id)
  .order('created_at', { ascending: false });

// Preserve owner access checks. Show load error rather than a false empty state.
// Do not show share UI until status is ready AND report_path exists.
const publicLinks = (shares ?? []).map(row => projectShareLink(row as ShareLinkPublic));
// <ShareLinks auditId={audit.id} links={publicLinks} />
```

The cast narrows the generated `mode` string union only; `projectShareLink` actually strips fields at runtime. Owner-page edits are exclusively parent-owned.

Generated-types handoff (no generated edits by this lane): add `share_sessions` with `session_hash`, `share_link_id`, `email`, `expires_at`, `created_at`; add share-link `verification_attempts`, `verification_sent_at`, `verification_window_at`, `verification_send_count`; add `share_email_challenge(p_action,p_token,p_email,p_hash,p_session_hash?) -> string` and `share_session_valid(p_token,p_session_hash) -> boolean`. Until regeneration, `share-security.ts` contains the narrow local RPC-only type boundary; all RPC responses remain runtime-checked before authorization.
