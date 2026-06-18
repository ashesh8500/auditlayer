# Admin Features: Trial Links, Account Types, & User Management

**Date:** 2026-06-18  
**Author:** Ashesh Kaji  
**Status:** Exhaustive plan — for implementation

---

## Overview

Three related features delivered as a single deployable increment:

1. **Model migration** — Switch default Hermes model from `deepseek-v4-pro` to `deepseek-v4-flash` (50% faster, 68% cheaper)
2. **Trial links with gifted audits** — Narin sends links that grant N free audits on signup
3. **Admin user management** — Upgrade/downgrade any user's plan, adjust gifted audits, with full audit trail

---

## Feature 1: Model Migration (deepseek-v4-pro → deepseek-v4-flash)

### Speed & Cost Comparison

| Metric | deepseek-v4-pro (current) | deepseek-v4-flash | Δ |
|---|---|---|---|
| Speed | 64 tok/s | 96 tok/s | +50% |
| Latency (p50) | 1.29s | 0.75s | −42% |
| Input $/M tok | $0.435 | $0.14 | −68% |
| Output $/M tok | $0.87 | $0.28 | −68% |
| Intelligence Index | 44 (#3/92) | 40 (#8/92) | −9% |

**Decision:** The ~9% intelligence drop is acceptable for structured report generation. The speed and cost gains are dramatic.

### Files to change

| File | Change |
|---|---|
| `worker/auditlayer_worker/config.py:104` | Default `deepseek-v4-pro` → `deepseek-v4-flash` |
| `worker/auditlayer_worker/config.py:120-121` | Price defaults: `0.27`→`0.14`, `1.10`→`0.28` |
| `web/src/app/admin/settings/page.tsx:26` | Default in settings page |
| `supabase/migrations/0001_init.sql:92` | Default in `app_settings` table |
| `worker/infra/systemd/auditlayer.env.example:10` | Example env |
| `docs/production-portal.md:121` | Doc reference |
| `docs/data-sources-and-billing.md` | Cost estimates (multiple lines) |
| `docs/deployment.md:196` | Model reference |
| `scripts/e2e-smoke.py:38` | Test default |
| `tests/test_*.py` (3 files) | Test defaults |

### DB deployment

```
UPDATE app_settings SET hermes_model = 'deepseek-v4-flash' WHERE id = 1;
```

This takes effect on the worker's next poll cycle (it reads `app_settings` at startup and on each claim).

### Worker pricing update

Update `price_in_per_mtok` from `0.27` to `0.14` and `price_out_per_mtok` from `1.10` to `0.28` in both `config.py` and any env files on Hetzner.

---

## Feature 2: Trial Links with Gifted Audits

### User story

Narin wants to send a DM to a potential client: "Here's a link — sign up and you get 3 free audits to try it out." The link encodes the number of gifted audits, and the signup flow auto-grants them.

### Architecture

```
Narin creates trial link in admin panel
         ↓
    POST /api/admin/trial-links
         ↓
    INSERT trial_links (audits_granted, created_by, ...)
         ↓
    Returns: https://auditlayermedia.com/try/<token>
         ↓
    Recipient clicks link → /try/<token> landing page
         ↓
    "Sign up to claim your N free audits" + magic link
         ↓
    On signup: handle_new_user() trigger + webhook
         ↓
    UPSERT profiles: account_type = 'trial', gifted_audits = N
         ↓
    Redirect to dashboard — user sees gifted audit count
         ↓
    Audits consume gifted_audits first, then plan limits
```

### Schema: `trial_links`

```sql
CREATE TABLE public.trial_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT NOT NULL UNIQUE,
  audits_granted INT NOT NULL DEFAULT 3 CHECK (audits_granted >= 1 AND audits_granted <= 50),
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  label TEXT,                           -- "Sent to Hemal Patel via DM"
  max_uses INT,                         -- NULL = unlimited
  used_count INT NOT NULL DEFAULT 0,
  expires_at TIMESTAMPTZ,               -- NULL = never
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Schema: `profiles` additions

```sql
ALTER TABLE public.profiles ADD COLUMN account_type TEXT NOT NULL DEFAULT 'standard'
  CHECK (account_type IN ('standard', 'trial', 'comp'));
ALTER TABLE public.profiles ADD COLUMN gifted_audits INT NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN trial_link_id UUID
  REFERENCES public.trial_links(id) ON DELETE SET NULL;
```

**`account_type` values:**
- `standard` — regular signup, follows plan + Stripe
- `trial` — signed up via trial link, has gifted_audits, plan = 'free'
- `comp` — manually set by admin, unlimited or specific gifted count (internal, partners)

### Audit consumption logic

When a user creates an audit, consumption order:
1. If `gifted_audits > 0`: decrement `gifted_audits` by 1, audit costs 0 gifted audit
2. If `gifted_audits = 0`: fall through to normal plan limits

Change in `createAudit()` server action — after intake validation, before plan-limit check:

```typescript
// Gifted audits consumed first
if (profile.gifted_audits > 0) {
  await admin.from("profiles").update({ 
    gifted_audits: profile.gifted_audits - 1 
  }).eq("id", profile.id);
  // Skip plan-limit check — gifted audit covers it
} else {
  // Normal plan-limit check
  if (usage >= limit) return limitReachedError;
}
```

### Trial link landing page: `/try/[token]`

A public page that:
1. Validates the token (not revoked, within max_uses, not expired)
2. Shows a branded landing: "You've been invited to try AuditLayerMedia — N free audits"
3. Calls-to-action: "Sign up with email" (magic link) or "Sign in" (if they have an account, link auto-grants)
4. On successful auth redirect, the callback handler checks for a `trial_token` in the session/cookie and applies the grant

### Token validation endpoint: `GET /api/trial/[token]`

Returns `{ valid: true, audits_granted: 3 }` or `{ valid: false, reason: "expired" }` — for the landing page to render appropriate messaging.

### Grant on signup flow

1. Visit `/try/<token>` → cookie `alm_trial_token=<token>` set (7 day expiry)
2. Sign up via magic link
3. Auth callback (`/auth/callback`) checks for `alm_trial_token` cookie
4. If valid trial link: increment `trial_links.used_count`, set `profiles.account_type = 'trial'`, `profiles.gifted_audits = trial_links.audits_granted`, `profiles.trial_link_id = trial_links.id`
5. Write `admin_actions` log entry: "Trial signup via link <token>: granted N audits"

---

## Feature 3: Admin User Management Panel

### New admin pages

| Route | Purpose |
|---|---|
| `/admin/users` | User list with search, filters (account_type, plan) |
| `/admin/users/[id]` | Single user detail: plan, gifted audits, audit usage, action history |
| `/admin/trials` | Trial links management — create, list, revoke |
| `/admin/trials/new` | Create trial link form |

### User detail page (`/admin/users/[id]`)

Sections:
- **Profile info** — email, name, joined date, onboarding status
- **Account status** — plan, account_type, subscription_status, Stripe customer ID
- **Gifted audits** — remaining count with adjust (+/-) control
- **Plan management** — dropdown: free/starter/pro/enterprise + "Apply" button
- **Audit usage** — count of audits by status, list of recent audits
- **Action history** — chronological log of admin actions on this user

### Server actions needed

| Action | File | Purpose |
|---|---|---|
| `updateUserPlan` | `lib/actions/admin.ts` | Change plan (free/starter/pro/enterprise) |
| `adjustGiftedAudits` | `lib/actions/admin.ts` | Add/remove gifted audits |
| `setAccountType` | `lib/actions/admin.ts` | Change account_type (standard/trial/comp) |
| `createTrialLink` | `lib/actions/admin.ts` | Generate a new trial link |
| `revokeTrialLink` | `lib/actions/admin.ts` | Revoke a trial link |
| `listTrialLinks` | Server component | Read trial links for admin view |

### Schema: `admin_actions`

```sql
CREATE TABLE public.admin_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID NOT NULL REFERENCES public.profiles(id),
  target_user_id UUID REFERENCES public.profiles(id),
  action TEXT NOT NULL,             -- 'plan_change', 'gifted_adjust', 'trial_create', 'trial_revoke', 'account_type_change'
  detail JSONB NOT NULL DEFAULT '{}',  -- {from: "free", to: "starter", reason: "..."}
  created_at TIMESTAMPTZ DEFAULT now()
);
```

### Admin audit trail in the console

The `/admin/users/[id]` page shows a chronological feed:

```
2026-06-18 14:22 · Ashesh Kaji changed plan: free → starter
2026-06-18 14:21 · Ashesh Kaji added 3 gifted audits (total: 3)
2026-06-17 09:15 · Narin Fazlalipour created trial link "DM to Hemal" (3 audits, token: abc123)
```

### Admin nav update

Add to `layout.tsx` sidebar:
- Users (new)
- Trials (new)
- Audits (existing)
- Settings (existing)

---

## Feature 4: Instagram Connectivity — What Remains

### Current state (fully built)

✅ Facebook JS SDK OAuth flow (`FB.login()` → `POST /api/auth/instagram/connect`)  
✅ Token storage in `instagram_connections` table  
✅ Worker fetches live IG data before generation (`instagram_api.py` → `pipeline.py`)  
✅ Prompt injection of live metrics (`build_worker_prompt()` with `ig_metrics`)  
✅ `InstagramConnect` component on dashboard  

### What you still need to do

1. **Meta App Review** — The `instagram_basic` scope works without review for testers. For production (non-tester users), you need App Review approval. Without it, non-tester users see an error when connecting. Start the review at https://developers.facebook.com/apps/1919113942129447/app-review/

2. **Add Instagram Testers** — For Narin to test: Meta App Dashboard → Roles → Instagram Testers → add her Instagram username. She must accept the invitation in her IG app settings.

3. **Verify production env vars on Vercel:**
   - `FACEBOOK_APP_ID=1919113942129447` ✅ (already hardcoded in `instagram-oauth-url.ts`)
   - `FACEBOOK_APP_SECRET=<secret>` — verify it's set and correct
   - Verify the OAuth redirect URI is configured in Meta App: `https://auditlayermedia.com/api/auth/instagram/callback`

4. **Worker restart after IG code changes** — The worker on Hetzner needs to be running code that includes `instagram_api.py`. Since Syncthing syncs code changes, restart the worker: `systemctl --user restart auditlayer-worker`

5. **Test end-to-end** — Narin connects her IG account, then runs a Pulse audit on her own handle. Verify the report includes real follower count and engagement metrics (not the "login-walled" fallback text).

---

## Implementation Plan

### Phase 1: Model migration (quick — ~5 files, no deployment dependencies)

1. Change default in `worker/auditlayer_worker/config.py`
2. Update price defaults
3. Update web admin default
4. Update Supabase migration default
5. Update docs and test files
6. Update `app_settings` row in live DB
7. Restart worker on Hetzner

### Phase 2: Schema migration (~3 new SQL migrations)

1. `0011_account_types.sql` — `profiles.account_type`, `profiles.gifted_audits`, `profiles.trial_link_id`
2. `0012_trial_links.sql` — `trial_links` table, RLS, indexes
3. `0013_admin_actions.sql` — `admin_actions` table, indexes

### Phase 3: Server actions & API routes

1. Extend `lib/actions/admin.ts` — `updateUserPlan`, `adjustGiftedAudits`, `setAccountType`, `createTrialLink`, `revokeTrialLink`
2. Create `lib/actions/trials.ts` — `grantTrialOnSignup(token, userId)`
3. Create `app/api/trial/[token]/route.ts` — GET: validate token
4. Update `app/auth/callback/route.ts` — check `alm_trial_token` cookie, call `grantTrialOnSignup`
5. Update `lib/actions/audits.ts` — gifted audit consumption logic
6. Update `lib/domain.ts` — add `account_type` type, gifted audit-aware limit function

### Phase 4: Admin UI

1. `app/admin/users/page.tsx` — user list with search/filter
2. `app/admin/users/[id]/page.tsx` — user detail with plan management
3. `app/admin/users/[id]/user-actions.tsx` — client components for form actions
4. `app/admin/trials/page.tsx` — trial links list
5. `app/admin/trials/new/page.tsx` — create trial link form
6. Update `app/admin/layout.tsx` — add Users and Trials nav items

### Phase 5: Trial landing page

1. `app/try/[token]/page.tsx` — public landing with signup CTA
2. Component styling consistent with brand (teal accent, Inter, light theme)

### Phase 6: Verify & deploy

1. Local build: `cd web && npx next build`
2. DB migrations via Supabase SQL editor
3. Vercel deploy: `cd web && npx vercel deploy --prod`
4. Worker restart on Hetzner
5. Smoke test: create trial link → sign up → verify gifted audits → run audit → verify consumption

---

## Verification Checklist

### Model migration
- [ ] `app_settings.hermes_model = 'deepseek-v4-flash'` in live DB
- [ ] Worker picks up new model (check next audit's `model` column)
- [ ] Report generation time decreased (compare audit metrics before/after)
- [ ] Report quality maintained (spot-check a generated report)

### Trial links
- [ ] Admin can create trial link at `/admin/trials/new`
- [ ] Link shows correct audits_granted count
- [ ] `/try/<token>` renders branded landing page
- [ ] Invalid/expired/revoked token shows appropriate message
- [ ] Signup via trial link grants correct gifted_audits
- [ ] `profiles.account_type = 'trial'` set correctly
- [ ] `trial_links.used_count` increments

### Gifted audit consumption
- [ ] Gifted audits consumed before plan limits
- [ ] `gifted_audits` decrements on each audit
- [ ] At 0 gifted, falls through to normal plan limits
- [ ] Plan limit error shows correctly when both are exhausted

### Admin user management
- [ ] User list loads all profiles with search
- [ ] Plan change works and shows in action log
- [ ] Gifted audit adjustment works and shows in action log
- [ ] `admin_actions` row written for every action
- [ ] Non-admin cannot access admin routes

### Instagram (existing — status check)
- [ ] `FACEBOOK_APP_SECRET` set on Vercel
- [ ] Meta App OAuth redirect configured
- [ ] Instagram tester added for Narin
- [ ] End-to-end: connect → audit → live metrics in report
