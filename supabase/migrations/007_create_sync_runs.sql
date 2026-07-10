-- Migración 007: Registro de ejecuciones de sync (observabilidad)
-- Log inmutable de cada corrida del ETL por usuario. Sin esto, los resultados
-- del cron se pierden al responder la request y un sync fallando días seguidos
-- pasa desapercibido hasta que Schwab exige re-autorización (refresh token
-- muere a los 7 días sin uso). El banner de salud del frontend lee esta tabla.

CREATE TABLE IF NOT EXISTS public.sync_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source TEXT NOT NULL CHECK (source IN ('cron', 'manual', 'cli')),
    success BOOLEAN NOT NULL,
    accounts_processed INTEGER NOT NULL DEFAULT 0,
    transactions_processed INTEGER NOT NULL DEFAULT 0,
    orders_processed INTEGER NOT NULL DEFAULT 0,
    snapshots_processed INTEGER NOT NULL DEFAULT 0,
    error TEXT,
    duration_ms INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

-- Solo lectura para el usuario dueño; las escrituras las hace el backend con service_role.
DROP POLICY IF EXISTS users_own_sync_runs_select ON public.sync_runs;
CREATE POLICY users_own_sync_runs_select ON public.sync_runs
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_sync_runs_user_created ON public.sync_runs(user_id, created_at DESC);
