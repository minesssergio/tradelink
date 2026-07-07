-- Migración Fase 4a: Órdenes de Schwab (segundo data stream, complementa transactions)
-- Nota: el motor de trades sigue usando transactions (reporta precios de expiración
-- ITM que el endpoint de orders no trae). Orders sirve para auditoría del ciclo de
-- vida de cada orden (working/filled/canceled, precio límite vs ejecución, etc.)

CREATE TABLE public.schwab_orders (
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
CREATE POLICY users_own_orders_select ON public.schwab_orders
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX idx_schwab_orders_account_time ON public.schwab_orders(account_hash, entered_time DESC);

CREATE TRIGGER set_timestamp_schwab_orders
BEFORE UPDATE ON public.schwab_orders
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
