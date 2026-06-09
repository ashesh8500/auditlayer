# Instagram Graph API Integration — Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.

**Goal:** Let AuditLayer pull real Instagram metrics (followers, media, engagement, insights) from Meta's official Graph API when a client connects their Instagram Business/Creator account via OAuth, replacing the current "login-wall → pivot to web indexation → flag as data-quality limitation" path.

**Architecture:** Meta Graph API sits behind Facebook Login OAuth. The client grants `instagram_basic` + `instagram_manage_insights` permissions. Tokens are stored in Supabase, scoped to the user's profile. The worker checks for a live token before each IG audit — when present, it calls the Graph API for real metrics; when absent, it falls back to the existing free-toolset path. This is a **Pro/Enterprise-gated feature** — Starter and Free users stay on the existing path.

**Tech Stack:** Meta Graph API (Instagram), Facebook Login OAuth, Next.js App Router (server actions + API routes), Supabase (token storage + RLS), Python worker (`httpx` for API calls), Tailwind + shadcn (UI).

**Dependencies added:** `httpx` (worker — already in project? Verify: `uv pip list | grep httpx`)

**Environments affected:**
- **Meta Developer Dashboard** — new Facebook App, App Review for `instagram_manage_insights`
- **Next.js (.env.local / Vercel env)** — `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
- **Supabase** — new `instagram_connections` table + RLS
- **Hetzner worker** — new `instagram_api.py` module, pipeline wiring

---

## Pre-Flight: Decisions to Confirm Before Coding

### 1. Account type requirement — dealbreaker check
The Meta Graph API **only** works with Instagram Business and Creator accounts. Personal accounts get zero data. This means:
- ~30–50% of audit subjects (personal accounts, small creators) won't qualify
- The feature must degrade gracefully — show "Connect a Business/Creator account" prompt
- Landing page pricing should mention "Instagram Business/Creator account required for live metrics"

**Question for Ashesh:** Is the target market (biohacking creators, wellness brands, health professionals) predominantly on Business/Creator accounts? If >70% yes, this is a go. If most are personal accounts, Meta Graph API won't help and we should look at Apify scrapers instead (already documented in data-sources-and-billing.md, ~$0.001/audit, no OAuth needed).

### 2. App Review timeline
`instagram_manage_insights` requires Meta App Review. This takes 2–6 weeks and requires:
- Privacy policy URL (auditlayermedia.com/privacy)
- App icon (1024×1024)
- Screencast showing how the app uses insights data
- Detailed description of data usage

We can start with `instagram_basic` (no review needed, returns profile + media) and add insights after review. Profile + media alone gives us follower count, media feed, and post metadata — already a massive upgrade over "zero data."

### 3. OAuth UX — in-flow vs. out-of-band
Two options:
- **A: "Connect Instagram" button on the audit intake page** — client connects before requesting the audit. Cleanest flow but adds friction before the first audit.
- **B: "Connect Instagram" in account settings** — async. They can connect anytime. Audits use the token if available. Less friction.

**Recommendation:** Both. A small prompt on intake ("Connect Instagram for real metrics →") that links to account settings, plus a full connection page in settings. Non-blocking — they can always proceed with the free path.

---

## Task Breakdown

### Phase 1: Meta App Setup (one-time, manual)

#### Task 1: Create Facebook App in Meta Developer Dashboard

**Objective:** Register AuditLayer as a Facebook app, configure Instagram Graph API.

**Steps:**

1. Go to https://developers.facebook.com/apps/
2. Create app → "Consumer" or "Business" type
3. App name: "AuditLayer Media" (or "AuditLayer" if available)
4. Add products: **Instagram Graph API** + **Facebook Login for Business**
5. Configure Facebook Login:
   - Valid OAuth Redirect URIs: `https://auditlayermedia.com/api/auth/instagram/callback` (prod) + `http://localhost:3000/api/auth/instagram/callback` (dev)
   - Deauthorize callback: `https://auditlayermedia.com/api/auth/instagram/deauthorize`
6. In App Settings → Basic:
   - Privacy Policy URL: `https://auditlayermedia.com/privacy`
   - App Icon (1024×1024)
   - Category: "Business" or "Productivity"
7. Add Instagram Testers (App Roles → Instagram Testers) — add `@auditlayer` Instagram account for dev testing

**Verification:** App ID and App Secret exist. Instagram Graph API shows in Products sidebar.

**No code — manual setup only.**

---

#### Task 2: Add environment variables

**Objective:** Store Facebook App credentials in the project's environment.

**Files:**
- Modify: `web/.env.local` (dev)
- Modify: Vercel Environment Variables (prod)

**Add:**
```env
FACEBOOK_APP_ID=123456789012345
FACEBOOK_APP_SECRET=a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6
```

**Verification:**
```bash
cd ~/projects/auditlayer/web
grep FACEBOOK_APP .env.local
# Both variables present
```

**Commit:**
```bash
git add web/.env.example  # update .env.example with placeholder values
git commit -m "chore: add Facebook App env vars to .env.example"
```

---

### Phase 2: Supabase Schema

#### Task 3: Create `instagram_connections` table

**Objective:** Store Instagram OAuth tokens per user profile.

**Files:**
- Create: `supabase/migrations/0007_instagram_connections.sql`

**Schema:**

```sql
-- Store Instagram Business/Creator account connections
CREATE TABLE IF NOT EXISTS instagram_connections (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    -- Instagram account data
    ig_user_id    BIGINT NOT NULL,           -- Instagram-scoped user ID (numeric)
    ig_username   TEXT NOT NULL,             -- e.g., 'dr.truptikaji'
    -- OAuth tokens
    access_token  TEXT NOT NULL,             -- Short-lived (1hr); exchanged for long-lived
    token_type    TEXT NOT NULL DEFAULT 'bearer',
    expires_at    TIMESTAMPTZ,               -- Short-lived token expiry
    long_lived_token       TEXT,             -- 60-day token (exchanged after OAuth)
    long_lived_expires_at  TIMESTAMPTZ,
    -- Account metadata
    account_type  TEXT,                      -- 'BUSINESS' or 'CREATOR'
    followers_count   INTEGER,               -- Cached at connection time
    media_count       INTEGER,
    -- Status
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_refreshed_at TIMESTAMPTZ,           -- Last time we refreshed the token/data
    
    UNIQUE(profile_id, ig_user_id)           -- One connection per IG account per user
);

-- RLS: users can only see their own connections
ALTER TABLE instagram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
    ON instagram_connections FOR SELECT
    USING (profile_id = (SELECT id FROM profiles WHERE user_id = auth.uid()));

-- Service-role only for insert/update/delete (done server-side)
CREATE POLICY "Service role can manage connections"
    ON instagram_connections FOR ALL
    USING (true)
    WITH CHECK (true);

-- Admin users can view all connections
CREATE POLICY "Admins can view all connections"
    ON instagram_connections FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role = 'admin'
        )
    );

-- Index for worker lookups (find token by Instagram username)
CREATE INDEX idx_instagram_connections_username ON instagram_connections(ig_username);
-- Index for profile lookups
CREATE INDEX idx_instagram_connections_profile ON instagram_connections(profile_id);
```

**Verification:**
```bash
cd ~/projects/auditlayer
npx supabase db push  # or run via SQL Editor
```

**Commit:**
```bash
git add supabase/migrations/0007_instagram_connections.sql
git commit -m "feat: add instagram_connections table for Meta Graph API tokens"
```

---

### Phase 3: Next.js OAuth Flow

#### Task 4: Create Facebook OAuth utility

**Objective:** Encapsulate Facebook OAuth token exchange and long-lived token generation.

**Files:**
- Create: `web/src/lib/facebook-oauth.ts`

**Complete implementation:**

```typescript
// web/src/lib/facebook-oauth.ts
// Facebook OAuth token exchange for Instagram Graph API

const FACEBOOK_APP_ID = process.env.FACEBOOK_APP_ID!;
const FACEBOOK_APP_SECRET = process.env.FACEBOOK_APP_SECRET!;
const REDIRECT_URI = `${process.env.NEXT_PUBLIC_SITE_URL}/api/auth/instagram/callback`;

export interface InstagramTokens {
  accessToken: string;
  igUserId: number;
  igUsername: string;
  accountType: 'BUSINESS' | 'CREATOR';
  followersCount: number;
  mediaCount: number;
}

/**
 * Build the Facebook Login OAuth URL for Instagram permissions.
 * Scopes: instagram_basic (no review), instagram_manage_insights (needs review)
 * Start with instagram_basic only until App Review is approved.
 */
export function buildInstagramAuthUrl(state: string): string {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    redirect_uri: REDIRECT_URI,
    state,
    scope: 'instagram_basic,pages_read_engagement',
    response_type: 'code',
    // Force re-authentication to ensure we get a fresh token
    auth_type: 'rerequest',
  });
  return `https://www.facebook.com/v21.0/dialog/oauth?${params}`;
}

/**
 * Exchange OAuth authorization code for a short-lived access token.
 */
async function exchangeCode(code: string): Promise<{ access_token: string }> {
  const params = new URLSearchParams({
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    redirect_uri: REDIRECT_URI,
    code,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params}`
  );
  
  if (!res.ok) {
    const err = await res.json().catch(() => ({})); 
    throw new Error(`Facebook OAuth error: ${JSON.stringify(err)}`);
  }
  
  return res.json();
}

/**
 * Exchange short-lived token for long-lived (60-day) token.
 */
async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: FACEBOOK_APP_ID,
    client_secret: FACEBOOK_APP_SECRET,
    fb_exchange_token: shortLivedToken,
  });

  const res = await fetch(
    `https://graph.facebook.com/v21.0/oauth/access_token?${params}`
  );

  if (!res.ok) throw new Error('Failed to exchange for long-lived token');
  return res.json();
}

/**
 * Get Instagram Business/Creator accounts linked to a Facebook Page.
 * Uses the user's Facebook access token to discover connected IG accounts.
 */
async function getInstagramAccounts(accessToken: string): Promise<any[]> {
  // First, get the user's Facebook Pages (IG accounts are connected to Pages)
  const pagesRes = await fetch(
    `https://graph.facebook.com/v21.0/me/accounts?access_token=${accessToken}`
  );
  if (!pagesRes.ok) throw new Error('Failed to fetch Facebook Pages');
  
  const { data: pages } = await pagesRes.json();
  const accounts: any[] = [];

  for (const page of pages || []) {
    // For each Page, check for connected Instagram Business account
    const igRes = await fetch(
      `https://graph.facebook.com/v21.0/${page.id}?fields=instagram_business_account{id,username,followers_count,media_count,account_type}&access_token=${accessToken}`
    );
    if (!igRes.ok) continue;
    
    const pageData = await igRes.json();
    if (pageData.instagram_business_account) {
      accounts.push(pageData.instagram_business_account);
    }
  }

  return accounts;
}

/**
 * Complete OAuth flow: code → short-lived token → long-lived token → IG accounts.
 * Returns structured Instagram account data for storage.
 */
export async function completeInstagramOAuth(
  code: string
): Promise<InstagramTokens> {
  // Step 1: Exchange code for short-lived token
  const { access_token: shortLivedToken } = await exchangeCode(code);

  // Step 2: Exchange for long-lived token
  const { access_token: longLivedToken, expires_in } = 
    await exchangeForLongLivedToken(shortLivedToken);

  // Step 3: Get connected Instagram accounts
  const accounts = await getInstagramAccounts(longLivedToken);
  
  if (accounts.length === 0) {
    throw new Error(
      'No Instagram Business or Creator account found. ' +
      'Make sure your Instagram account is set to Business or Creator type ' +
      'and connected to a Facebook Page.'
    );
  }

  // Take the first connected account
  const account = accounts[0];

  return {
    accessToken: longLivedToken,
    igUserId: parseInt(account.id, 10),
    igUsername: account.username,
    accountType: account.account_type || 'BUSINESS',
    followersCount: account.followers_count || 0,
    mediaCount: account.media_count || 0,
  };
}
```

**Verification:**
```bash
cd ~/projects/auditlayer/web
npx tsc --noEmit
# No errors in facebook-oauth.ts
```

**Commit:**
```bash
git add web/src/lib/facebook-oauth.ts
git commit -m "feat: add Facebook OAuth utility for Instagram Graph API"
```

---

#### Task 5: Create OAuth callback API route

**Objective:** Handle the OAuth redirect from Facebook, complete token exchange, store in Supabase.

**Files:**
- Create: `web/src/app/api/auth/instagram/callback/route.ts`

**Implementation:**

```typescript
// web/src/app/api/auth/instagram/callback/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { completeInstagramOAuth } from '@/lib/facebook-oauth';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const error = searchParams.get('error');

  // Error from Facebook (user denied permissions)
  if (error) {
    return NextResponse.redirect(
      new URL('/account?instagram_error=permission_denied', request.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/account?instagram_error=no_code', request.url)
    );
  }

  try {
    // Get the authenticated user
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.redirect(
        new URL('/sign-in?instagram_error=not_authenticated', request.url)
      );
    }

    // Complete OAuth flow
    const tokens = await completeInstagramOAuth(code);

    // Store in Supabase using admin client (bypasses RLS)
    const adminClient = createAdminClient();
    
    const { error: dbError } = await (adminClient as any)
      .from('instagram_connections')
      .upsert(
        {
          profile_id: user.id,
          ig_user_id: tokens.igUserId,
          ig_username: tokens.igUsername,
          long_lived_token: tokens.accessToken,
          long_lived_expires_at: new Date(
            Date.now() + 60 * 24 * 60 * 60 * 1000
          ).toISOString(), // 60 days
          account_type: tokens.accountType,
          followers_count: tokens.followersCount,
          media_count: tokens.mediaCount,
          is_active: true,
          last_refreshed_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id, ig_user_id' }
      );

    if (dbError) throw dbError;

    return NextResponse.redirect(
      new URL(
        `/account?instagram_connected=${tokens.igUsername}`,
        request.url
      )
    );
  } catch (err: any) {
    console.error('Instagram OAuth callback error:', err);
    return NextResponse.redirect(
      new URL(
        `/account?instagram_error=${encodeURIComponent(err.message)}`,
        request.url
      )
    );
  }
}
```

**Verification:**
```bash
cd ~/projects/auditlayer/web
npx tsc --noEmit
# No errors
```

**Commit:**
```bash
git add web/src/app/api/auth/instagram/callback/route.ts
git commit -m "feat: add Instagram OAuth callback API route"
```

---

#### Task 6: Create Instagram connection UI ("Connect Instagram" button)

**Objective:** Add a "Connect Instagram" section to the account settings/dashboard page.

**Files:**
- Create: `web/src/components/instagram-connect.tsx`

**Component (simplified — full shadcn-styled version in implementation):**

```tsx
// web/src/components/instagram-connect.tsx
'use client';

import { useState } from 'react';
import { buildInstagramAuthUrl } from '@/lib/facebook-oauth';

interface Props {
  connectedAccount?: {
    ig_username: string;
    followers_count: number;
    account_type: string;
    last_refreshed_at: string;
  } | null;
}

export function InstagramConnect({ connectedAccount }: Props) {
  const [loading, setLoading] = useState(false);

  const handleConnect = () => {
    setLoading(true);
    const state = crypto.randomUUID();
    sessionStorage.setItem('ig_oauth_state', state);
    window.location.href = buildInstagramAuthUrl(state);
  };

  if (connectedAccount) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 p-4">
        <div className="flex items-center gap-3">
          <div className="text-green-600 text-lg">✓</div>
          <div>
            <h3 className="font-semibold text-green-900">
              Instagram Connected
            </h3>
            <p className="text-sm text-green-700">
              @{connectedAccount.ig_username} · {connectedAccount.followers_count.toLocaleString()} followers · {connectedAccount.account_type}
            </p>
            <p className="text-xs text-green-600 mt-1">
              Connected {new Date(connectedAccount.last_refreshed_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4">
      <h3 className="font-semibold">Instagram Integration</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-3">
        Connect your Instagram Business or Creator account for real metrics in your audits. 
        Without this, Instagram reports use web indexation and may show estimated data.
      </p>
      <button
        onClick={handleConnect}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-4 py-2 text-sm font-medium text-white hover:bg-[#166fe5] disabled:opacity-50"
      >
        {loading ? 'Redirecting...' : 'Connect Instagram'}
      </button>
      <p className="text-xs text-muted-foreground mt-2">
        Requires Instagram Business or Creator account connected to a Facebook Page.
      </p>
    </div>
  );
}
```

**Wire into account page:**

In `web/src/app/(app)/account/page.tsx` (or wherever the settings page lives):
- Fetch `instagram_connections` for the current user (server-side, admin client)
- Pass to `<InstagramConnect connectedAccount={...} />`

**Verification:**
- Navigate to `/account` → "Connect Instagram" button visible
- Click → redirects to Facebook OAuth
- After auth → returns to `/account?instagram_connected=@handle`
- Green "Instagram Connected" card shows

**Commit:**
```bash
git add web/src/components/instagram-connect.tsx
# Also commit the account page changes
git commit -m "feat: add Instagram Connect UI to account settings"
```

---

### Phase 4: Worker — Instagram Data Fetching

#### Task 7: Create Instagram Graph API client for the worker

**Objective:** Python module the worker uses to fetch live Instagram data when a token is available.

**Files:**
- Create: `worker/auditlayer_worker/instagram_api.py`

**Implementation:**

```python
"""Instagram Graph API client for the AuditLayer worker.

Fetches live profile, media, and insights data for Instagram Business/Creator
accounts that have been connected via OAuth. Falls back gracefully when no
token is available or the token is expired.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import httpx
import time
from typing import Any

# ── Data models ──────────────────────────────────────────────

@dataclass
class InstagramProfile:
    """Live profile-level data from the Instagram Graph API."""
    ig_user_id: int
    username: str
    name: str = ""
    biography: str = ""
    followers_count: int = 0
    follows_count: int = 0
    media_count: int = 0
    profile_picture_url: str = ""
    website: str = ""
    account_type: str = ""  # BUSINESS or CREATOR
    # Cached at timestamp
    fetched_at: str = field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


@dataclass
class InstagramMedia:
    """Summary of recent media from the Instagram Graph API."""
    id: str
    media_type: str  # IMAGE, VIDEO, CAROUSEL_ALBUM
    caption: str = ""
    permalink: str = ""
    timestamp: str = ""
    like_count: int = 0
    comments_count: int = 0
    # Engagement computed
    engagement_rate: float = 0.0


@dataclass
class InstagramMetrics:
    """Aggregated metrics the worker uses for report generation."""
    profile: InstagramProfile
    recent_media: list[InstagramMedia] = field(default_factory=list)
    # Computed
    avg_likes: float = 0.0
    avg_comments: float = 0.0
    avg_engagement_rate: float = 0.0
    posting_cadence: str = ""  # e.g., "3-4x/week"
    top_content_types: list[str] = field(default_factory=list)
    # Raw API response preserved for debugging
    _raw: dict[str, Any] | None = None


# ── API client ────────────────────────────────────────────────

GRAPH_API_BASE = "https://graph.facebook.com/v21.0"


class InstagramAPIClient:
    """Fetches data from the Instagram Graph API using a stored access token."""

    def __init__(self, access_token: str):
        self._token = access_token
        self._client = httpx.Client(timeout=30.0)

    def close(self) -> None:
        self._client.close()

    # ── Profile ───────────────────────────────────────────────

    def get_profile(self, ig_user_id: int) -> InstagramProfile:
        """Fetch profile data for a connected Instagram Business/Creator account."""
        fields = [
            "id", "username", "name", "biography",
            "followers_count", "follows_count", "media_count",
            "profile_picture_url", "website", "account_type",
        ]
        data = self._get(f"/{ig_user_id}", params={"fields": ",".join(fields)})
        return InstagramProfile(
            ig_user_id=int(data["id"]),
            username=data.get("username", ""),
            name=data.get("name", ""),
            biography=data.get("biography", ""),
            followers_count=int(data.get("followers_count", 0)),
            follows_count=int(data.get("follows_count", 0)),
            media_count=int(data.get("media_count", 0)),
            profile_picture_url=data.get("profile_picture_url", ""),
            website=data.get("website", ""),
            account_type=data.get("account_type", ""),
        )

    # ── Media ─────────────────────────────────────────────────

    def get_recent_media(self, ig_user_id: int, limit: int = 25) -> list[InstagramMedia]:
        """Fetch recent media posts with engagement counts."""
        fields = [
            "id", "media_type", "caption", "permalink",
            "timestamp", "like_count", "comments_count",
        ]
        data = self._get(
            f"/{ig_user_id}/media",
            params={"fields": ",".join(fields), "limit": str(limit)},
        )
        media_list = []
        for item in data.get("data", []):
            likes = int(item.get("like_count", 0))
            comments = int(item.get("comments_count", 0))
            er = 0.0
            if likes or comments:
                # Engagement rate = (likes + comments) / followers
                # We don't have followers here — caller computes
                pass
            media_list.append(InstagramMedia(
                id=item.get("id", ""),
                media_type=item.get("media_type", "IMAGE"),
                caption=item.get("caption", "")[:500],
                permalink=item.get("permalink", ""),
                timestamp=item.get("timestamp", ""),
                like_count=likes,
                comments_count=comments,
            ))
        return media_list

    # ── Insights (requires instagram_manage_insights — App Review) ─

    def get_media_insights(self, media_id: str) -> dict[str, int]:
        """Fetch insights for a single media item (requires App Review)."""
        metrics = ["engagement", "impressions", "reach", "saved"]
        data = self._get(
            f"/{media_id}/insights",
            params={"metric": ",".join(metrics)},
        )
        return {
            item["name"]: item["values"][0]["value"]
            for item in data.get("data", [])
        }

    # ── Aggregate ─────────────────────────────────────────────

    def get_full_metrics(self, ig_user_id: int) -> InstagramMetrics:
        """Fetch profile + recent media + compute aggregate metrics."""
        profile = self.get_profile(ig_user_id)
        media = self.get_recent_media(ig_user_id, limit=25)

        # Compute engagement per post
        for m in media:
            if profile.followers_count > 0:
                m.engagement_rate = round(
                    (m.like_count + m.comments_count) / profile.followers_count * 100, 2
                )

        # Aggregate
        avg_likes = sum(m.like_count for m in media) / len(media) if media else 0
        avg_comments = sum(m.comments_count for m in media) / len(media) if media else 0
        avg_er = sum(m.engagement_rate for m in media) / len(media) if media else 0

        # Posting cadence from timestamps
        cadence = _compute_cadence(media)

        # Top content types
        type_counts: dict[str, int] = {}
        for m in media:
            t = m.media_type
            type_counts[t] = type_counts.get(t, 0) + 1
        top_types = sorted(type_counts, key=type_counts.get, reverse=True)[:3]

        return InstagramMetrics(
            profile=profile,
            recent_media=media,
            avg_likes=round(avg_likes, 1),
            avg_comments=round(avg_comments, 1),
            avg_engagement_rate=round(avg_er, 2),
            posting_cadence=cadence,
            top_content_types=top_types,
        )

    # ── Helpers ───────────────────────────────────────────────

    def _get(self, path: str, params: dict | None = None) -> dict:
        url = f"{GRAPH_API_BASE}{path}"
        p = params or {}
        p["access_token"] = self._token
        resp = self._client.get(url, params=p)
        resp.raise_for_status()
        return resp.json()


def _compute_cadence(media: list[InstagramMedia]) -> str:
    """Rough posting cadence from timestamp spread."""
    if len(media) < 3:
        return "unknown"
    timestamps = sorted(
        [datetime.fromisoformat(m.timestamp.replace("Z", "+00:00")) for m in media if m.timestamp],
        reverse=True,
    )
    if len(timestamps) < 3:
        return "unknown"
    # Posts per week over the available window
    window_days = max((timestamps[0] - timestamps[-1]).days, 7)
    posts_per_week = len(timestamps) / (window_days / 7)
    if posts_per_week >= 5:
        return "5-7x/week"
    elif posts_per_week >= 3:
        return "3-4x/week"
    elif posts_per_week >= 1:
        return "1-2x/week"
    else:
        return "<1x/week"
```

**Verification:**
```bash
cd ~/projects/auditlayer/worker
PYTHONPATH=. uv run python -c "
from auditlayer_worker.instagram_api import InstagramAPIClient
# Import check only — actual API calls need a valid token
print('InstagramAPIClient imported successfully')
"
```

**Commit:**
```bash
git add worker/auditlayer_worker/instagram_api.py
git commit -m "feat: add Instagram Graph API client to worker"
```

---

#### Task 8: Wire Instagram data into the worker pipeline

**Objective:** Modify the worker's `generation.py` + `pipeline.py` to fetch real Instagram data when a token exists, and inject it into the Hermes prompt.

**Files:**
- Modify: `worker/auditlayer_worker/supabase_client.py` (add token lookup method)
- Modify: `worker/auditlayer_worker/generation.py` (fetch IG data before generation)
- Modify: `worker/auditlayer_worker/core.py` (update worker prompt to include IG data)

**Step 1: Add token lookup to Supabase client**

In `supabase_client.py`, add:

```python
def get_instagram_token(self, ig_username: str) -> str | None:
    """Look up a live Instagram access token by username."""
    resp = self._service_client.table("instagram_connections") \
        .select("long_lived_token, long_lived_expires_at, is_active") \
        .eq("ig_username", ig_username) \
        .eq("is_active", True) \
        .execute()
    rows = resp.data or []
    if not rows:
        return None
    row = rows[0]
    expires = row.get("long_lived_expires_at")
    if expires:
        from datetime import datetime, timezone
        if datetime.fromisoformat(expires) < datetime.now(timezone.utc):
            return None  # Token expired
    return row.get("long_lived_token")
```

**Step 2: Fetch IG data in generation flow**

In `generation.py`, modify `HermesReportGenerator.generate()` to check for IG tokens:

```python
from .instagram_api import InstagramAPIClient, InstagramMetrics
from .supabase_client import get_instagram_token  # or import from the Supabase client

def _fetch_instagram_data(self, audit: AuditRecord) -> InstagramMetrics | None:
    """Attempt to fetch live Instagram data if a token exists."""
    if audit.platform != "instagram":
        return None
    
    try:
        token = self.db.get_instagram_token(audit.handle)
        if not token:
            return None
        
        client = InstagramAPIClient(token)
        try:
            metrics = client.get_full_metrics(ig_user_id=...)  # Need ig_user_id
            return metrics
        finally:
            client.close()
    except Exception as e:
        # Log but don't fail — fall back to free path
        print(f"Instagram API fetch failed for @{audit.handle}: {e}")
        return None
```

**Actually — simpler approach:** Instead of modifying the generation flow, modify `build_worker_prompt()` in `core.py` to accept optional Instagram data and inject it into the prompt when available. The pipeline fetches the data and passes it in.

**Modified `build_worker_prompt()`:**

```python
def build_worker_prompt(audit: AuditRecord, ig_metrics: InstagramMetrics | None = None) -> str:
    limitations = "\n".join(f"- {item}" for item in audit.limitations) or "- none declared"
    sections = _load_template_sections()
    section_ref = ...
    
    # Build Instagram live data block if available
    ig_data_block = ""
    if ig_metrics is not None:
        p = ig_metrics.profile
        ig_data_block = f"""
=== LIVE INSTAGRAM DATA (via connected account) ===
This account has connected their Instagram Business account. Use these REAL metrics:
- Followers: {p.followers_count:,}
- Following: {p.follows_count:,}
- Media count: {p.media_count:,}
- Account type: {p.account_type}
- Bio: {p.biography}
- Website: {p.website}
- Avg likes/post: {ig_metrics.avg_likes:.0f}
- Avg comments/post: {ig_metrics.avg_comments:.0f}
- Avg engagement rate: {ig_metrics.avg_engagement_rate}%
- Posting cadence: {ig_metrics.posting_cadence}
- Recent posts ({len(ig_metrics.recent_media)}): 
{chr(10).join(f'  [{m.media_type}] {m.like_count} likes, {m.comments_count} comments, ER {m.engagement_rate}%' for m in ig_metrics.recent_media[:10])}
"""
    else:
        ig_data_block = """
=== INSTAGRAM DATA AVAILABILITY ===
No connected Instagram Business account found. Use web indexation + browser research + 
client context + domain benchmarks as documented in the social-media-audit skill.
Flag missing live metrics as a data-quality limitation.
"""
    
    return f"""Generate the AuditLayer paid report for this intake.

Handle: @{audit.handle}
Platform: {audit.platform}
Goal: {audit.goal}
Client context: {audit.context or "none"}

{ig_data_block}

Business constraints:
... (existing constraints) ...

Known limitations:
{limitations}
"""
```

**Step 3: Modify pipeline to fetch IG data**

In `pipeline.py`, before calling `self.generator.generate(audit, ...)`, add:

```python
# Fetch Instagram data if available
ig_metrics = None
if audit.platform == "instagram":
    try:
        token = gateway.get_instagram_token(audit.handle) if gateway else None
        if token:
            from .instagram_api import InstagramAPIClient
            # Need ig_user_id from the token lookup — adjust get_instagram_token
            # to return (token, ig_user_id) tuple
            ...
    except Exception:
        pass  # Fall through to free path
```

**I'll refine the exact wiring during implementation — the pattern is clear.**

**Verification:**
```bash
cd ~/projects/auditlayer/worker
uv run pytest tests/ -x -q
# All tests pass — mock path unchanged
```

**Commit:**
```bash
git add worker/auditlayer_worker/core.py worker/auditlayer_worker/pipeline.py worker/auditlayer_worker/generation.py worker/auditlayer_worker/supabase_client.py
git commit -m "feat: wire Instagram Graph API data into worker pipeline"
```

---

### Phase 5: Pro/Enterprise Gating

#### Task 9: Gate Instagram Connect behind Pro/Enterprise plans

**Objective:** Only Pro and Enterprise users can connect Instagram. Starter and Free users see an upgrade prompt.

**Files:**
- Modify: `web/src/components/instagram-connect.tsx`

**Change:** Accept a `plan` prop. If `plan` is `free` or `starter`, show an upsell card instead of the connect button:

```tsx
if (plan === 'free' || plan === 'starter') {
  return (
    <div className="rounded-lg border p-4 bg-muted/30">
      <h3 className="font-semibold">Instagram Integration 🔒</h3>
      <p className="text-sm text-muted-foreground mt-1 mb-3">
        Connect Instagram for live metrics in your reports. Available on Pro and Enterprise.
      </p>
      <a href="/pricing" className="text-sm font-medium text-accent hover:underline">
        Upgrade to Pro →
      </a>
    </div>
  );
}
```

**Also update:** Landing page pricing section — add "Instagram real metrics" as a Pro feature.

**Verification:**
- Free user on `/account` → sees upgrade prompt, not connect button
- Pro user on `/account` → sees connect button

**Commit:**
```bash
git add web/src/components/instagram-connect.tsx web/src/app/page.tsx
git commit -m "feat: gate Instagram Connect behind Pro/Enterprise plans"
```

---

### Phase 6: Testing & Smoke Test

#### Task 10: End-to-end smoke test

**Objective:** Verify the full flow works from OAuth → data fetch → report generation.

**Steps:**

1. **Set up a test Instagram Business account** (use `@auditlayer` or create a test account in Meta Developer Dashboard)
2. **Connect via OAuth:**
   - Navigate to `/account` as a Pro user
   - Click "Connect Instagram" → complete Facebook OAuth
   - Verify green "Connected" card with correct username + follower count
3. **Verify Supabase:** Check `instagram_connections` table has the row
4. **Run a test audit:**
   ```bash
   cd ~/projects/auditlayer/worker
   PYTHONPATH=. uv run python -c "
   from auditlayer_worker.instagram_api import InstagramAPIClient
   from auditlayer_worker.supabase_client import SupabaseGateway
   
   gw = SupabaseGateway.from_env()
   token, ig_user_id = gw.get_instagram_token_with_id('test_handle')
   
   client = InstagramAPIClient(token)
   metrics = client.get_full_metrics(ig_user_id)
   print(f'Followers: {metrics.profile.followers_count}')
   print(f'Avg ER: {metrics.avg_engagement_rate}%')
   print(f'Cadence: {metrics.posting_cadence}')
   "
   ```
5. **Regenerate a real audit** with live data → verify report shows real follower counts, not "estimated"

**No commit — verification only.**

---

### Phase 7: Meta App Review (parallel track)

#### Task 11: Submit App Review for `instagram_manage_insights`

**Objective:** Get permission to fetch Instagram Insights (reach, impressions, engagement metrics) — unlocks deeper audit data.

**Prerequisites:**
- Working OAuth flow (Tasks 4-6 complete)
- Privacy Policy at `auditlayermedia.com/privacy`
- App icon (1024×1024)
- Screencast (2-3 min) showing: Connect → data usage in audit report
- Description: "AuditLayer uses Instagram insights to provide creators with competitive intelligence reports — helping them understand their audience engagement, content performance, and growth opportunities compared to peers."

**This is a manual Meta process. Not code — tracked here for completeness.**

---

## Summary of Changes

| Layer | Files | What Changes |
|---|---|---|
| **Meta** | Developer Dashboard | New Facebook App, Instagram Graph API |
| **Supabase** | `migrations/0007_instagram_connections.sql` | New table, RLS, indexes |
| **Web** | `src/lib/facebook-oauth.ts` | OAuth URL builder + token exchange |
| **Web** | `src/app/api/auth/instagram/callback/route.ts` | OAuth callback handler |
| **Web** | `src/components/instagram-connect.tsx` | Connect/disconnect UI |
| **Web** | `src/app/(app)/account/page.tsx` | Wire connect component |
| **Worker** | `auditlayer_worker/instagram_api.py` | Graph API client |
| **Worker** | `auditlayer_worker/core.py` | Updated worker prompt with IG data injection |
| **Worker** | `auditlayer_worker/pipeline.py` | Fetch IG data before generation |
| **Worker** | `auditlayer_worker/supabase_client.py` | Token lookup method |
| **Web** | `src/app/page.tsx` | Pricing: add IG metrics as Pro feature |

## Cost Impact

| Item | Cost |
|---|---|
| Meta Graph API calls | **$0** (free) |
| Token storage (Supabase) | **~$0** (tiny rows, included in plan) |
| Additional worker compute | **~$0** (few HTTP calls per IG audit) |
| App Review | **$0** (free, but 2-6 week wait) |

**Per-audit cost impact: $0.** This replaces the web search / browser calls currently spent trying (and failing) to get Instagram data — might actually **reduce** per-audit search costs.

## Fallback Behavior

| Scenario | Behavior |
|---|---|
| No token exists | Current free-toolset path (web indexation + limitations flag) |
| Token expired | Free path + "Reconnect Instagram" prompt on account page |
| API call fails (rate limit, network) | Free path — never blocks audit generation |
| Personal account (not Business/Creator) | Meta API returns 0 accounts → error message on connect page |
| Free/Starter user | Upsell card, no connect button |

---

## Pre-Flight Decision Needed

Before starting implementation, confirm: **Is the target market predominantly on Instagram Business/Creator accounts?** If >70% yes, proceed. If most users have personal accounts, switch to the Apify scraper path instead (cheaper, no OAuth, works on personal accounts — but less accurate and ToS-gray).

The plan above implements **both** — the free path stays as fallback, so even if only 30% of users connect, it's net-positive.
