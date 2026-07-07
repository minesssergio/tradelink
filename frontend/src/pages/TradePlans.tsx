import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, Pencil, Trash2, X, Save, AlertTriangle, ClipboardCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// Trade/Day plans live in journal_notes tagged 'plan' — same table, distinct view.
const PLAN_TAG = 'plan';

interface PlanNote {
  id: string;
  note_date: string;
  title: string;
  content: string;
  tags: string[];
  created_at: string;
}

const emptyDraft = () => ({
  note_date: new Date().toISOString().slice(0, 10),
  title: '',
  content: '',
});

const PLAN_TEMPLATE = `Bias del día:
Niveles clave:
Setups que voy a operar:
Máximo de trades:
Riesgo máximo del día:
No operar si:`;

export const TradePlans: React.FC = () => {
  const [plans, setPlans] = useState<PlanNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tableMissing, setTableMissing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [saving, setSaving] = useState(false);

  const loadPlans = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('journal_notes')
      .select('*')
      .contains('tags', [PLAN_TAG])
      .order('note_date', { ascending: false });

    if (error) {
      if (error.code === 'PGRST205' || error.message.includes('journal_notes')) setTableMissing(true);
      else setError(error.message);
    } else {
      setPlans((data as PlanNote[]) || []);
      setTableMissing(false);
      setError(null);
    }
    setLoading(false);
  };

  useEffect(() => { loadPlans(); }, []);

  const filtered = useMemo(() => {
    if (!search.trim()) return plans;
    const q = search.toLowerCase();
    return plans.filter(p => p.title.toLowerCase().includes(q) || p.content.toLowerCase().includes(q) || p.note_date.includes(q));
  }, [plans, search]);

  const startNew = () => {
    setDraft({ ...emptyDraft(), content: PLAN_TEMPLATE });
    setEditing('new');
  };

  const saveDraft = async () => {
    if (!draft.title.trim() && !draft.content.trim()) return;
    setSaving(true);

    if (editing === 'new') {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from('journal_notes').insert({
        user_id: userData.user?.id,
        note_date: draft.note_date,
        title: draft.title.trim() || `Plan ${draft.note_date}`,
        content: draft.content,
        tags: [PLAN_TAG],
      });
      if (error) setError(error.message);
    } else if (editing) {
      const { error } = await supabase
        .from('journal_notes')
        .update({ note_date: draft.note_date, title: draft.title.trim(), content: draft.content })
        .eq('id', editing);
      if (error) setError(error.message);
    }

    setSaving(false);
    setEditing(null);
    await loadPlans();
  };

  const deletePlan = async (id: string) => {
    if (!window.confirm('Delete this plan?')) return;
    const { error } = await supabase.from('journal_notes').delete().eq('id', id);
    if (error) setError(error.message);
    await loadPlans();
  };

  const formatDate = (d: string) =>
    new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-gradient">Trade / Day Plans</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Planifica antes de operar; compara después con lo que hiciste.</p>
        </div>
        <button className="btn btn-primary" onClick={startNew} disabled={tableMissing}>
          <Plus size={18} /> New Plan
        </button>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem', borderColor: 'var(--danger)', color: 'var(--danger)' }}>{error}</div>
      )}

      {tableMissing && (
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>One-time setup required</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The <code>journal_notes</code> table doesn't exist yet. Run
              <code> supabase/migrations/003_create_journal_notes.sql</code> in the Supabase SQL Editor, then reload.
            </p>
          </div>
        </div>
      )}

      {editing && (
        <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3>{editing === 'new' ? 'New Plan' : 'Edit Plan'}</h3>
            <button className="btn" onClick={() => setEditing(null)} style={{ padding: '0.4rem' }}><X size={16} /></button>
          </div>

          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <input
              type="date"
              className="input-glass"
              value={draft.note_date}
              onChange={(e) => setDraft({ ...draft, note_date: e.target.value })}
              style={{ padding: '0.6rem 1rem' }}
            />
            <input
              type="text"
              className="input-glass"
              placeholder="Título (ej. 'Plan viernes — CPI day, tamaño reducido')"
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              style={{ padding: '0.6rem 1rem', flex: 1, minWidth: '260px' }}
            />
          </div>

          <textarea
            className="input-glass"
            value={draft.content}
            onChange={(e) => setDraft({ ...draft, content: e.target.value })}
            rows={9}
            style={{ padding: '0.75rem 1rem', resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.6 }}
          />

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem' }}>
            <button className="btn" onClick={() => setEditing(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveDraft} disabled={saving || (!draft.title.trim() && !draft.content.trim())}>
              <Save size={16} /> {saving ? 'Saving…' : 'Save Plan'}
            </button>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ padding: '0', overflow: 'hidden', minHeight: '40vh' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div className="input-glass" style={{ flex: 1, padding: '0.5rem 1rem', display: 'flex', alignItems: 'center' }}>
            <Search size={16} style={{ color: 'var(--text-muted)', marginRight: '0.5rem' }} />
            <input
              type="text"
              placeholder="Search plans..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-primary)', outline: 'none', width: '100%' }}
            />
          </div>
        </div>

        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>Loading plans…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
            <ClipboardCheck size={28} />
            <p>{plans.length === 0 ? 'No plans yet. Write tomorrow\'s plan tonight.' : 'No plans match your search.'}</p>
          </div>
        ) : (
          <div>
            {filtered.map((plan) => (
              <div key={plan.id} style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>{formatDate(plan.note_date)}</div>
                  <h3 style={{ marginBottom: '0.35rem', fontSize: '1.05rem' }}>{plan.title || '(untitled)'}</h3>
                  <p style={{ color: 'var(--text-secondary)', whiteSpace: 'pre-wrap', lineHeight: 1.55, fontSize: '0.9rem' }}>
                    {plan.content.length > 500 ? `${plan.content.slice(0, 500)}…` : plan.content}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0, alignItems: 'flex-start' }}>
                  <button className="btn" title="Edit" onClick={() => { setDraft({ note_date: plan.note_date, title: plan.title, content: plan.content }); setEditing(plan.id); }} style={{ padding: '0.45rem' }}>
                    <Pencil size={15} />
                  </button>
                  <button className="btn" title="Delete" onClick={() => deletePlan(plan.id)} style={{ padding: '0.45rem', color: 'var(--danger)' }}>
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
