-- Migración Fase 2: Tablas ETL de Schwab (Accounts, Positions, Transactions)

-- 1. Tabla de Cuentas (Accounts)
CREATE TABLE public.schwab_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    account_number TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, account_hash)
);

-- Enable RLS for schwab_accounts
ALTER TABLE public.schwab_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_accounts_select ON public.schwab_accounts
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 2. Tabla de Posiciones (Positions Snapshot)
CREATE TABLE public.schwab_positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    symbol TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    quantity NUMERIC NOT NULL,
    average_price NUMERIC NOT NULL,
    market_value NUMERIC NOT NULL,
    maintenance_requirement NUMERIC,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_hash, symbol, asset_type)
);

-- Enable RLS for schwab_positions
ALTER TABLE public.schwab_positions ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_positions_select ON public.schwab_positions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- 3. Tabla de Transacciones (Trades History)
CREATE TABLE public.schwab_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    activity_id TEXT NOT NULL,
    time TIMESTAMPTZ NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    symbol TEXT,
    instruction TEXT,
    quantity NUMERIC,
    price NUMERIC,
    amount NUMERIC NOT NULL,
    fees NUMERIC DEFAULT 0,
    raw_data JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(account_hash, activity_id)
);

-- Enable RLS for schwab_transactions
ALTER TABLE public.schwab_transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_transactions_select ON public.schwab_transactions
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_schwab_accounts_user_id ON public.schwab_accounts(user_id);
CREATE INDEX idx_schwab_positions_account_hash ON public.schwab_positions(account_hash);
CREATE INDEX idx_schwab_transactions_account_hash ON public.schwab_transactions(account_hash);
CREATE INDEX idx_schwab_transactions_time ON public.schwab_transactions(time DESC);

-- Triggers for updated_at
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_timestamp_schwab_accounts
BEFORE UPDATE ON public.schwab_accounts
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();

CREATE TRIGGER set_timestamp_schwab_positions
BEFORE UPDATE ON public.schwab_positions
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
