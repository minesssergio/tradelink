import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Save, AlertTriangle } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface JournalNote {
  id: string;
  note_date: string;
  title: string;
  content: string;
  mood: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

const MOODS = ['confident', 'neutral', 'anxious', 'frustrated', 'disciplined'] as const;

const MOOD_EMOJI: Record<string, string> = {
  confident: '😎',
  neutral: '😐',
  anxious: '😰',
  frustrated: '😤',
  disciplined: '🎯',
};

const emptyDraft = () => ({
  note_date: new Date().toISOString().slice(0, 10),
  title: '',
  content: '',
  mood: null as string | null,
});

export const JournalNotes: React.FC = () => {
  const [notes, setNotes] = useState<JournalNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const loadNotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('journal_notes')
      .select('*')
      .order('note_date', { ascending: false })
      .order('created_at', { ascending: false });

    if (error) {
      // PGRST205 = table not found in schema cache (migration not applied yet)
      if (error.code === 'PGRST205' || error.message.includes('journal_notes')) {
        setTableMissing(true);
      } else {
        setError(error.message);
      }
    } else {
      setNotes((data as JournalNote[]) || []);
      setTableMissing(false);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadNotes();
  }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return notes;
    const q = search.toLowerCase();
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q) || n.note_date.includes(q)
    );
  }, [notes, search]);

  const startNew = () => {
    setDraft(emptyDraft());
    setEditing('new');
  };

  const startEdit = (note: JournalNote) => {
    setDraft({ note_date: note.note_date, title: note.title, content: note.content, mood: note.mood });
    setEditing(note.id);
  };

  const saveDraft = async () => {
    if (!draft.title.trim() && !draft.content.trim()) return;
    setSaving(true);

    if (editing === 'new') {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('journal_notes').insert({
        user_id: userData.user?.id,
        note_date: draft.note_date,
        title: draft.title.trim(),
        content: draft.content,
        mood: draft.mood,
      });
      if (error) setError(error.message);
    } else if (editing) {
      const { error } = await supabase
        .from('journal_notes')
        .update({ note_date: draft.note_date, title: draft.title.trim(), content: draft.content, mood: draft.mood })
        .eq('id', editing);
      if (error) setError(error.message);
    }

    setSaving(false);
    setEditing(null);
    await loadNotes();
  };

  const deleteNote = async (id: string) => {
    if (!window.confirm('Delete this note?')) return;
    const { error } = await supabase.from('journal_notes').delete().eq('id', id);
    if (error) setError(error.message);
    await loadNotes();
  };

  const formatDate = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-gradient">Journal Notes</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Record your thoughts and strategies.</p>
        </div>
        <button className="btn btn-primary" onClick={startNew} disabled={tableMissing}>
          <Plus size={18} /> New Note
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}>
          {error}
        </div>
      )}

      {tableMissing && (
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>One-time setup required</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The <code>journal_notes</code> table doesn't exist yet. Open the Supabase Dashboard → SQL Editor and run
              the migration file <code>supabase/migrations/003_create_journal_notes.sql</code>, then reload this page.
            </p>
          </div>
        </div>
      )}

      {/* Editor */}
      {editing && (
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{editing === 'new' ? 'New Note' : 'Edit Note'}</h3>
            <button className="btn" onClick={() => setEditing(null)} style={{ padding: '0.4rem' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              type="date"
              className="input-glass"
              value={draft.note_date}
              onChange={(e) => setDraft({ ...draft, note_date: e.target.value })}
              style={{ padding: '0.6rem 1rem' }}
            />
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
              {MOODS.map((m) => (
                <button
                  key={m}
                  title={m}
                  onClick={() => setDraft({ ...draft, mood: draft.mood === m ? null : m })}
                  style={{
                    fontSize: '1.2rem',
                    padding: '0.35rem 0.5rem',
                    borderRadius: '8px',
                    border: draft.mood === m ? '1px solid var(--accent, #6366f1)' : '1px solid transparent',
                    background: draft.mood === m ? 'rgba(99, 102, 241, 0.15)' : 'transparent',
                    cursor: 'pointer',
                  }}
                >
                  {MOOD_EMOJI[m]}
                </button>
              ))}
            </div>
          </div>

          <input
            type="text"
            className="input-glass"
            placeholder="Title (e.g. 'SPY puts — patience paid off')"
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
            style={{ padding: '0.6rem 1rem', fontSize: '1rem' }}
          />

          <textarea
            className="input-glass"
            placeholder="What happened today? What did you learn?"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={6}
            style={{ padding: '0.75rem 1rem', resize: 'vertical', fontFamily: 'inherit' }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveDraft} disabled={saving || (!draft.title.trim() && !draft.content.trim())}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save Note'}
            </button>
          </div>
        </div>
      )}

      {/* Notes list */}
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden', minHeight: '40vh' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="input-glass flex items-center" style={{ flex: 1, padding: '0.5rem 1rem', display: 'flex' }}>
            <Search size={16} style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }} />
            <input
              type="text"
              placeholder="Search notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading notes…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p>{notes.length === 0 ? 'No notes yet. Create your first journal entry.' : 'No notes match your search.'}</p>
          </div>
        ) : (
          <div>
            {filtered.map((note) => (
              <div
                key={note.id}
                style={{
                  padding: '1.25rem 1.5rem',
                  borderBottom: '1px solid var(--border-glass)',
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: '1rem',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{formatDate(note.note_date)}</span>
                    {note.mood && <span title={note.mood}>{MOOD_EMOJI[note.mood]}</span>}
                  </div>
                  <h3 style={{ marginBottom: '0.35rem', fontSize: '1.05rem' }}>{note.title || '(untitled)'}</h3>
                  <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
                    {note.content.length > 400 ? `${note.content.slice(0, 400)}…` : note.content}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-start' }}>
                  <button className="btn" title="Edit" onClick={() => startEdit(note)} style={{ padding: '0.45rem' }}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn" title="Delete" onClick={() => deleteNote(note.id)} style={{ padding: '0.45rem', color: 'var(--danger)' }}>
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
