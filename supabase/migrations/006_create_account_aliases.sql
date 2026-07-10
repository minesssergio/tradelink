-- Migración 006: Alias de cuentas por usuario
-- Antes los nombres de cuenta vivían hardcodeados en el frontend (expuestos en
-- el bundle JS público) y luego en localStorage (por navegador, frágil). Esta
-- tabla los hace privados por usuario (RLS) y persistentes entre navegadores.
-- Nota: el alias es del USUARIO, no de la cuenta — dos usuarios que compartan
-- una cuenta Schwab pueden nombrarla distinto sin pisarse.

CREATE TABLE IF NOT EXISTS public.user_account_aliases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    account_hash TEXT NOT NULL,
    alias TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(user_id, account_hash)
);

ALTER TABLE public.user_account_aliases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_own_aliases_select ON public.user_account_aliases;
CREATE POLICY users_own_aliases_select ON public.user_account_aliases
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_aliases_insert ON public.user_account_aliases;
CREATE POLICY users_own_aliases_insert ON public.user_account_aliases
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_aliases_update ON public.user_account_aliases;
CREATE POLICY users_own_aliases_update ON public.user_account_aliases
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS users_own_aliases_delete ON public.user_account_aliases;
CREATE POLICY users_own_aliases_delete ON public.user_account_aliases
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_account_aliases_user ON public.user_account_aliases(user_id);

DROP TRIGGER IF EXISTS set_timestamp_account_aliases ON public.user_account_aliases;
CREATE TRIGGER set_timestamp_account_aliases
BEFORE UPDATE ON public.user_account_aliases
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
