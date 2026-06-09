-- Instagram OAuth connections for Meta Graph API live metrics.
-- One connection per Instagram account per user.
-- Tokens are server-side only (service-role writes, admin selects).

CREATE TABLE IF NOT EXISTS public.instagram_connections (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    -- Instagram account data
    ig_user_id       BIGINT NOT NULL,           -- Instagram-scoped user ID (numeric)
    ig_username      TEXT NOT NULL,             -- e.g., 'dr.truptikaji'
    -- OAuth tokens
    access_token     TEXT,                      -- Short-lived (kept for reference)
    long_lived_token TEXT NOT NULL,             -- 60-day token (exchanged after OAuth)
    long_lived_expires_at TIMESTAMPTZ NOT NULL,
    -- Account metadata (cached at connection time)
    account_type     TEXT,                      -- 'BUSINESS' or 'CREATOR'
    followers_count  INTEGER DEFAULT 0,
    media_count      INTEGER DEFAULT 0,
    -- Status
    is_active        BOOLEAN NOT NULL DEFAULT true,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_refreshed_at TIMESTAMPTZ,
    
    UNIQUE(user_id, ig_user_id)                 -- One connection per IG account per user
);

-- RLS: users can read their own connections
ALTER TABLE public.instagram_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own connections"
    ON public.instagram_connections FOR SELECT
    USING (user_id = auth.uid());

-- Service role for all writes (done server-side via admin client)
CREATE POLICY "Service role can manage connections"
    ON public.instagram_connections FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for worker lookups (find active token by Instagram username)
CREATE INDEX idx_instagram_connections_username
    ON public.instagram_connections(ig_username)
    WHERE is_active = true;

-- Index for user lookups
CREATE INDEX idx_instagram_connections_user
    ON public.instagram_connections(user_id);
