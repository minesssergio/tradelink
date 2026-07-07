import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useFilters } from '../context/FilterContext';
import { Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Line, ComposedChart } from 'recharts';

interface Snapshot {
  account_hash: string;
  snapshot_date: string;
  net_liq: number | null;
  cash: number | null;
  positions_value: number | null;
}

export const AccountGrowth: React.FC = () => {
  const { matchesAccount, accountLabel } = useFilters();
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getGrowth()
      .then(res => {
        setSnapshots(res.data || []);
        setSetupRequired(!!res.setupRequired);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(String(err?.message || err));
        setLoading(false);
      });
  }, []);

  const visible = useMemo(() => snapshots.filter(s => matchesAccount(s.account_hash)), [snapshots, matchesAccount]);

  // One point per date: total Net Liq of selected accounts (carry last-known value
  // forward for accounts without a snapshot that day)
  const { chartData, accountsInData } = useMemo(() => {
    const dates = [...new Set(visible.map(s => s.snapshot_date))].sort();
    const accounts = [...new Set(visible.map(s => s.account_hash))];
    const byAccount: Record<string, Record<string, number>> = {};
    for (const s of visible) {
      if (s.net_liq === null) continue;
      (byAccount[s.account_hash] ??= {})[s.snapshot_date] = Number(s.net_liq);
    }
    const lastKnown: Record<string, number> = {};
    const rows = dates.map(date => {
      let total = 0;
      const row: Record<string, number | string> = { date };
      for (const acc of accounts) {
        const v = byAccount[acc]?.[date] ?? lastKnown[acc];
        if (v !== undefined) {
          lastKnown[acc] = v;
          total += v;
          row[acc] = Number(v.toFixed(2));
        }
      }
      row.total = Number(total.toFixed(2));
      return row;
    });
    return { chartData: rows, accountsInData: accounts };
  }, [visible]);

  const growthStats = useMemo(() => {
    if (chartData.length < 2) return null;
    const first = Number(chartData[0].total);
    const last = Number(chartData[chartData.length - 1].total);
    return {
      from: String(chartData[0].date),
      to: String(chartData[chartData.length - 1].date),
      change: last - first,
      changePct: first > 0 ? ((last - first) / first) * 100 : 0,
      current: last,
    };
  }, [chartData]);

  const fmt = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#38bdf8'];

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Account Growth</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Real Net Liq history per account (daily snapshots, includes deposits and market moves).
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {setupRequired && (
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>One-time setup required</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The <code>schwab_balance_snapshots</code> table doesn't exist yet. Run
              <code> supabase/migrations/005_create_balance_snapshots.sql</code> in the Supabase SQL Editor.
              After that, every sync stores the day's balance — the curve builds up from tomorrow onward.
            </p>
          </div>
        </div>
      )}

      {growthStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
          <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
            <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>{fmt(growthStats.current)}</h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>CURRENT NET LIQ (SNAPSHOT)</span>
          </div>
          <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
            <h2 style={{ color: growthStats.change >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
              {fmt(growthStats.change)} ({growthStats.changePct >= 0 ? '+' : ''}{growthStats.changePct.toFixed(2)}%)
            </h2>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              GROWTH {growthStats.from} → {growthStats.to}
            </span>
          </div>
        </div>
      )}

      <div className="glass-card" style={{ height: '55vh', padding: '2rem' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">Loading Growth...</div>
        ) : chartData.length === 0 ? (
          <div className="flex justify-center items-center h-full" style={{ flexDirection: 'column', gap: '0.75rem', color: 'var(--text-muted)' }}>
            <TrendingUp size={32} />
            <span>{setupRequired ? 'Apply the migration to start collecting snapshots.' : 'No snapshots yet — they accumulate with each daily sync.'}</span>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorGrowth" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.35}/>
                  <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${Number(v).toLocaleString()}`} domain={['auto', 'auto']} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                formatter={(value: any, name: any) => [fmt(Number(value)), name === 'total' ? 'Total' : accountLabel(String(name))]}
              />
              <Legend formatter={(name) => name === 'total' ? 'Total' : accountLabel(String(name))} />
              <Area type="monotone" dataKey="total" stroke="var(--accent-blue)" strokeWidth={3} fillOpacity={1} fill="url(#colorGrowth)" />
              {accountsInData.length > 1 && accountsInData.map((acc, i) => (
                <Line key={acc} type="monotone" dataKey={acc} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={1.5} dot={false} strokeDasharray="4 3" />
              ))}
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
