-- Migración Fase 4b: Snapshots diarios de balance (monitoreo de crecimiento a largo plazo)
-- Cada sync guarda/actualiza el snapshot del día por cuenta. Con el tiempo esto
-- construye la curva histórica de Net Liq real (incluye depósitos y valorización,
-- no solo PnL de trades).

CREATE TABLE public.schwab_balance_snapshots (
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
CREATE POLICY users_own_snapshots_select ON public.schwab_balance_snapshots
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_balance_snapshots_account_date ON public.schwab_balance_snapshots(account_hash, snapshot_date DESC);

CREATE TRIGGER set_timestamp_balance_snapshots
BEFORE UPDATE ON public.schwab_balance_snapshots
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
