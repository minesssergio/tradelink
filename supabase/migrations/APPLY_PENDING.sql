-- ============================================================================
-- APPLY_PENDING.sql — Aplica de una sola vez las migraciones 003+004+005
-- ============================================================================
-- Uso: pega este archivo completo en Supabase Dashboard → SQL Editor → Run.
-- Es SEGURO ejecutarlo más de una vez (usa IF NOT EXISTS / DROP...CREATE) por
-- si ya aplicaste alguna de las tres a mano anteriormente.
--
-- Después de correr esto, dale "Sync" en la app (o Settings → Force Sync) para
-- que las tablas de orders y balance_snapshots empiecen a llenarse.
-- ============================================================================

-- ── 003: Journal Notes ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.journal_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note_date DATE NOT NULL DEFAULT CURRENT_DATE,
    title TEXT NOT NULL DEFAULT '',
    content TEXT NOT NULL DEFAULT '',
    mood TEXT CHECK (mood IN ('confident', 'neutral', 'anxious', 'frustrated', 'disciplined') OR mood IS NULL),
    tags TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_notes_select ON public.journal_notes;
CREATE POLICY users_own_notes_select ON public.journal_notes
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_notes_insert ON public.journal_notes;
CREATE POLICY users_own_notes_insert ON public.journal_notes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_notes_update ON public.journal_notes;
CREATE POLICY users_own_notes_update ON public.journal_notes
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_notes_delete ON public.journal_notes;
CREATE POLICY users_own_notes_delete ON public.journal_notes
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_journal_notes_user_date ON public.journal_notes(user_id, note_date DESC);

DROP TRIGGER IF EXISTS set_timestamp_journal_notes ON public.journal_notes;
CREATE TRIGGER set_timestamp_journal_notes
BEFORE UPDATE ON public.journal_notes
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- ── 004: Schwab Orders (segundo data stream) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schwab_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    order_id TEXT NOT NULL,
    entered_time TIMESTAMPTZ NOT NULL,
    close_time TIMESTAMPTZ,
    status TEXT NOT NULL,
    order_type TEXT,
    duration TEXT,
    symbol TEXT,
    instruction TEXT,
    position_effect TEXT,
    quantity NUMERIC,
    filled_quantity NUMERIC,
    price NUMERIC,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_hash, order_id)
);

ALTER TABLE public.schwab_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_orders_select ON public.schwab_orders;
CREATE POLICY users_own_orders_select ON public.schwab_orders
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_schwab_orders_account_time ON public.schwab_orders(account_hash, entered_time DESC);

DROP TRIGGER IF EXISTS set_timestamp_schwab_orders ON public.schwab_orders;
CREATE TRIGGER set_timestamp_schwab_orders
BEFORE UPDATE ON public.schwab_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- ── 005: Balance Snapshots (crecimiento a largo plazo) ──────────────────────
CREATE TABLE IF NOT EXISTS public.schwab_balance_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    snapshot_date DATE NOT NULL,
    net_liq NUMERIC,
    cash NUMERIC,
    available_funds NUMERIC,
    positions_value NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_hash, snapshot_date)
);

ALTER TABLE public.schwab_balance_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_snapshots_select ON public.schwab_balance_snapshots;
CREATE POLICY users_own_snapshots_select ON public.schwab_balance_snapshots
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_balance_snapshots_account_date ON public.schwab_balance_snapshots(account_hash, snapshot_date DESC);

DROP TRIGGER IF EXISTS set_timestamp_balance_snapshots ON public.schwab_balance_snapshots;
CREATE TRIGGER set_timestamp_balance_snapshots
BEFORE UPDATE ON public.schwab_balance_snapshots
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

-- ============================================================================
-- Verificación rápida (opcional): debe devolver 3 filas.
-- ============================================================================
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public'
--   AND table_name IN ('journal_notes', 'schwab_orders', 'schwab_balance_snapshots');
