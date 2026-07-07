-- =============================================================================
-- Migration 001: Create schwab_tokens table
-- Stores OAuth 2.0 tokens for Charles Schwab API per user.
-- Row Level Security (RLS) ensures multi-tenant data isolation.
--
-- Run this migration in your Supabase SQL Editor:
--   https://supabase.com/dashboard → SQL Editor → New Query → Paste & Run
-- =============================================================================

-- 1. Create the table
CREATE TABLE IF NOT EXISTS public.schwab_tokens (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    access_token        TEXT NOT NULL,
    refresh_token       TEXT NOT NULL,
    token_type          TEXT NOT NULL DEFAULT 'Bearer',
    scope               TEXT DEFAULT 'api',
    expires_at          TIMESTAMPTZ NOT NULL,
    refresh_expires_at  TIMESTAMPTZ NOT NULL,
    schwab_account_hash TEXT,
    status              TEXT NOT NULL DEFAULT 'ACTIVE'
                        CHECK (status IN ('ACTIVE', 'NEEDS_REAUTH', 'REVOKED')),
    last_rotation_at    TIMESTAMPTZ,
    rotation_count      INTEGER DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id)
);

-- 2. Add comment for documentation
COMMENT ON TABLE public.schwab_tokens IS 
    'OAuth 2.0 tokens for Charles Schwab API. One record per user. '
    'Access token (30 min) and refresh token (7 days) are rotated automatically.';

-- 3. Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_schwab_tokens_user_id
    ON public.schwab_tokens(user_id);

CREATE INDEX IF NOT EXISTS idx_schwab_tokens_expires_at
    ON public.schwab_tokens(expires_at)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_schwab_tokens_status
    ON public.schwab_tokens(status);

-- 4. Enable Row Level Security
ALTER TABLE public.schwab_tokens ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies

-- Users can only SELECT their own tokens (for client-side status checks)
CREATE POLICY "users_own_tokens_select"
    ON public.schwab_tokens
    FOR SELECT
    TO authenticated
    USING (auth.uid() = user_id);

-- Users can INSERT their own tokens (initial auth flow)
CREATE POLICY "users_own_tokens_insert"
    ON public.schwab_tokens
    FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = user_id);

-- Users can UPDATE their own tokens (manual re-auth)
CREATE POLICY "users_own_tokens_update"
    ON public.schwab_tokens
    FOR UPDATE
    TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can DELETE their own tokens (disconnect Schwab)
CREATE POLICY "users_own_tokens_delete"
    ON public.schwab_tokens
    FOR DELETE
    TO authenticated
    USING (auth.uid() = user_id);

-- NOTE: The cron/rotation service uses SUPABASE_SERVICE_ROLE_KEY,
-- which bypasses RLS entirely. No additional policy needed for server-side ops.

-- 6. Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_schwab_tokens_updated_at
    BEFORE UPDATE ON public.schwab_tokens
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();
