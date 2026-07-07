-- Migración Fase 3: Journal Notes (notas diarias del trader)

CREATE TABLE public.journal_notes (
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

-- RLS: cada usuario solo ve y gestiona sus propias notas
ALTER TABLE public.journal_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_own_notes_select ON public.journal_notes
    FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY users_own_notes_insert ON public.journal_notes
    FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY users_own_notes_update ON public.journal_notes
    FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY users_own_notes_delete ON public.journal_notes
    FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Índice para listados por fecha
CREATE INDEX idx_journal_notes_user_date ON public.journal_notes(user_id, note_date DESC);

-- Trigger updated_at (reutiliza la función creada en 002)
CREATE TRIGGER set_timestamp_journal_notes
BEFORE UPDATE ON public.journal_notes
FOR EACH ROW
EXECUTE FUNCTION trigger_set_timestamp();
