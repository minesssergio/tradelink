import React, { useMemo, useState } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { useFilters } from '../context/FilterContext';
import {
  breakdownBy, underlyingOf, instrumentKind, weekdayOf, hourBucketOf, durationBucketOf,
  DURATION_ORDER, type BreakdownRow,
} from '../lib/analytics';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

type Dimension = 'underlying' | 'kind' | 'weekday' | 'hour' | 'duration' | 'side' | 'account';

const WEEKDAY_ORDER = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const Breakdowns: React.FC = () => {
  const { closedTrades, loading, error } = usePortfolioData();
  const { accountLabel } = useFilters();
  const [dimension, setDimension] = useState<Dimension>('underlying');

  const DIMENSIONS: { id: Dimension; label: string; keyFn: (t: any) => string; order?: string[] }[] = useMemo(() => [
    { id: 'underlying', label: 'Símbolo', keyFn: underlyingOf },
    { id: 'kind', label: 'Calls / Puts / Stock', keyFn: instrumentKind },
    { id: 'weekday', label: 'Día de la semana', keyFn: weekdayOf, order: WEEKDAY_ORDER },
    { id: 'hour', label: 'Hora de entrada', keyFn: hourBucketOf },
    { id: 'duration', label: 'Duración', keyFn: durationBucketOf, order: DURATION_ORDER },
    { id: 'side', label: 'Long / Short', keyFn: (t) => t.side },
    { id: 'account', label: 'Cuenta', keyFn: (t) => accountLabel(t.accountHash) },
  ], [accountLabel]);

  const active = DIMENSIONS.find(d => d.id === dimension)!;

  const rows: BreakdownRow[] = useMemo(() => {
    const data = breakdownBy(closedTrades, active.keyFn);
    if (active.order) {
      return data.sort((a, b) => active.order!.indexOf(a.key) - active.order!.indexOf(b.key));
    }
    if (dimension === 'hour') return data.sort((a, b) => a.key.localeCompare(b.key));
    return data.sort((a, b) => a.netPnL - b.netPnL); // worst first — that's what we analyze
  }, [closedTrades, active, dimension]);

  const fmt = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Breakdowns</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Dónde ganas y dónde pierdes — rendimiento cortado por dimensión.</p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {/* Dimension selector */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        {DIMENSIONS.map(d => (
          <button
            key={d.id}
            className="btn btn-glass"
            onClick={() => setDimension(d.id)}
            style={{
              padding: '0.45rem 0.9rem', fontSize: '0.85rem',
              ...(dimension === d.id ? { background: 'var(--accent-blue)', color: 'white', borderColor: 'var(--accent-blue)' } : {}),
            }}
          >
            {d.label}
          </button>
        ))}
      </div>

      {/* PnL bar chart per group */}
      <div className="glass-card" style={{ height: '35vh', padding: '1.5rem 2rem' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">Loading...</div>
        ) : rows.length === 0 ? (
          <div className="flex justify-center items-center h-full">No trades for the selected filters.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 10, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="key" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} interval={0} angle={rows.length > 8 ? -30 : 0} textAnchor={rows.length > 8 ? 'end' : 'middle'} height={rows.length > 8 ? 60 : 30} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
              <Tooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                formatter={(value: any) => [fmt(Number(value)), 'Net PnL']}
              />
              <Bar dataKey="netPnL" radius={[4, 4, 0, 0]}>
                {rows.map((r, i) => (
                  <Cell key={i} fill={r.netPnL >= 0 ? 'var(--success)' : 'var(--danger)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Detail table */}
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="data-table-container" style={{ overflowX: 'auto', maxHeight: '55vh' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>{active.label}</th>
                <th>Trades</th>
                <th>Net PnL</th>
                <th>Win Rate</th>
                <th>Profit Factor</th>
                <th>Avg / Trade</th>
                <th>Fees</th>
                <th>Mejor</th>
                <th>Peor</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.key}>
                  <td><strong>{r.key}</strong></td>
                  <td>{r.trades}</td>
                  <td style={{ fontWeight: 600, color: r.netPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(r.netPnL)}</td>
                  <td>{r.winRate.toFixed(1)}%</td>
                  <td>{r.profitFactor === Infinity ? '∞' : r.profitFactor.toFixed(2)}</td>
                  <td style={{ color: r.avgPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(r.avgPnL)}</td>
                  <td style={{ color: 'var(--text-muted)' }}>{fmt(r.fees)}</td>
                  <td style={{ color: 'var(--success)' }}>{fmt(r.bestTrade)}</td>
                  <td style={{ color: 'var(--danger)' }}>{fmt(r.worstTrade)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
