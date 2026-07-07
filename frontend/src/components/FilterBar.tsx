import React, { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronDown, Pencil, X, Landmark } from 'lucide-react';
import { useFilters } from '../context/FilterContext';

const PRESETS: { label: string; days: number | 'ytd' }[] = [
  { label: '7D', days: 7 },
  { label: '30D', days: 30 },
  { label: '90D', days: 90 },
  { label: 'YTD', days: 'ytd' },
];

const toIsoDay = (d: Date) => d.toISOString().slice(0, 10);

export const FilterBar: React.FC = () => {
  const {
    accounts, selected, setSelected, from, to, setRange,
    aliases, setAlias, accountLabel, isFiltering, clearFilters,
  } = useFilters();

  const [open, setOpen] = useState(false);
  const [editingHash, setEditingHash] = useState<string | null>(null);
  const [aliasDraft, setAliasDraft] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setEditingHash(null);
      }
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  const toggleAccount = (hash: string) => {
    setSelected(selected.includes(hash) ? selected.filter(h => h !== hash) : [...selected, hash]);
  };

  const applyPreset = (days: number | 'ytd') => {
    const now = new Date();
    if (days === 'ytd') {
      setRange(`${now.getFullYear()}-01-01`, toIsoDay(now));
    } else {
      const start = new Date(now);
      start.setDate(start.getDate() - days);
      setRange(toIsoDay(start), toIsoDay(now));
    }
  };

  const accountButtonLabel = selected.length === 0
    ? `All Accounts (${accounts.length})`
    : selected.length === 1
      ? accountLabel(selected[0])
      : `${selected.length} accounts`;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap',
      padding: '0.75rem 0', marginBottom: '1rem', borderBottom: '1px solid var(--border-glass)',
    }}>
      {/* Account selector */}
      <div ref={dropdownRef} style={{ position: 'relative' }}>
        <button
          className="btn btn-glass flex items-center gap-3"
          onClick={() => setOpen(!open)}
          style={{
            padding: '0.5rem 1rem',
            ...(selected.length > 0 ? { background: 'var(--accent-blue)', color: 'white', borderColor: 'var(--accent-blue)' } : {}),
          }}
        >
          <Landmark size={15} /> {accountButtonLabel} <ChevronDown size={14} />
        </button>

        {open && (
          <div className="glass-card" style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 50,
            minWidth: '280px', padding: '0.5rem', background: 'var(--bg-surface)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.5)',
          }}>
            <button
              className="btn"
              onClick={() => setSelected([])}
              style={{
                width: '100%', justifyContent: 'flex-start', padding: '0.5rem 0.75rem',
                background: selected.length === 0 ? 'rgba(99,102,241,0.15)' : 'transparent',
              }}
            >
              All Accounts
            </button>
            <div style={{ height: '1px', background: 'var(--border-glass)', margin: '0.4rem 0' }} />

            {accounts.map(acc => {
              const hash = acc.account_hash;
              const checked = selected.includes(hash);
              const isEditing = editingHash === hash;
              return (
                <div key={hash} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.35rem 0.5rem' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleAccount(hash)}
                    style={{ accentColor: 'var(--accent-blue, #6366f1)', cursor: 'pointer' }}
                    id={`acc-${hash}`}
                  />
                  {isEditing ? (
                    <input
                      autoFocus
                      className="input-glass"
                      value={aliasDraft}
                      placeholder="Alias (e.g. Swing)"
                      onChange={e => setAliasDraft(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { setAlias(hash, aliasDraft); setEditingHash(null); }
                        if (e.key === 'Escape') setEditingHash(null);
                      }}
                      onBlur={() => { setAlias(hash, aliasDraft); setEditingHash(null); }}
                      style={{ flex: 1, padding: '0.25rem 0.5rem', fontSize: '0.85rem' }}
                    />
                  ) : (
                    <>
                      <label htmlFor={`acc-${hash}`} style={{ flex: 1, cursor: 'pointer', fontSize: '0.9rem' }}>
                        <span style={{ fontWeight: 600 }}>{accountLabel(hash)}</span>
                      </label>
                      <button
                        className="btn"
                        title="Rename account"
                        onClick={() => { setEditingHash(hash); setAliasDraft(aliases[hash] || ''); }}
                        style={{ padding: '0.25rem', background: 'transparent', color: 'var(--text-muted)' }}
                      >
                        <Pencil size={13} />
                      </button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Date range */}
      <div className="flex items-center gap-3" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <CalendarIcon size={15} style={{ color: 'var(--text-muted)' }} />
        <input
          type="date"
          className="input-glass"
          value={from || ''}
          max={to || undefined}
          onChange={e => setRange(e.target.value || null, to)}
          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
        />
        <span style={{ color: 'var(--text-muted)' }}>→</span>
        <input
          type="date"
          className="input-glass"
          value={to || ''}
          min={from || undefined}
          onChange={e => setRange(from, e.target.value || null)}
          style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem' }}
        />
      </div>

      {/* Presets */}
      <div style={{ display: 'flex', gap: '0.35rem' }}>
        {PRESETS.map(p => (
          <button
            key={p.label}
            className="btn btn-glass"
            onClick={() => applyPreset(p.days)}
            style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
          >
            {p.label}
          </button>
        ))}
      </div>

      {isFiltering && (
        <button
          className="btn"
          onClick={clearFilters}
          style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem', color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
        >
          <X size={13} /> Clear filters
        </button>
      )}
    </div>
  );
};
