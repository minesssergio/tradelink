import React, { useMemo } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';

export const EquityCurve: React.FC = () => {
  const { closedTrades, loading } = usePortfolioData();

  // Daily cumulative Net PnL + running drawdown from peak
  const { data, stats } = useMemo(() => {
    const byDay: Record<string, number> = {};
    for (const t of closedTrades) {
      const d = t.closeDate.slice(0, 10);
      byDay[d] = (byDay[d] || 0) + t.netPnL;
    }
    const days = Object.keys(byDay).sort();

    let cum = 0;
    let peak = 0;
    let maxDD = 0;
    let bestDay = { date: '', pnl: -Infinity };
    let worstDay = { date: '', pnl: Infinity };

    const rows = days.map(date => {
      const dayPnL = byDay[date];
      cum += dayPnL;
      peak = Math.max(peak, cum);
      const drawdown = cum - peak; // <= 0
      maxDD = Math.min(maxDD, drawdown);
      if (dayPnL > bestDay.pnl) bestDay = { date, pnl: dayPnL };
      if (dayPnL < worstDay.pnl) worstDay = { date, pnl: dayPnL };
      return {
        date,
        equity: Number(cum.toFixed(2)),
        drawdown: Number(drawdown.toFixed(2)),
        dayPnL: Number(dayPnL.toFixed(2)),
      };
    });

    return {
      data: rows,
      stats: rows.length === 0 ? null : {
        totalReturn: cum,
        maxDrawdown: maxDD,
        bestDay,
        worstDay,
        activeDays: rows.length,
      },
    };
  }, [closedTrades]);

  const fmt = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Equity Curve</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Cumulative Net PnL by day, with running drawdown.</p>
      </div>

      {stats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Total Net Return</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600, color: stats.totalReturn >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(stats.totalReturn)}</div>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Max Drawdown</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--danger)' }}>{fmt(stats.maxDrawdown)}</div>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Best Day <span style={{ textTransform: 'none' }}>({stats.bestDay.date})</span></div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--success)' }}>{fmt(stats.bestDay.pnl)}</div>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Worst Day <span style={{ textTransform: 'none' }}>({stats.worstDay.date})</span></div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600, color: 'var(--danger)' }}>{fmt(stats.worstDay.pnl)}</div>
          </div>
          <div className="glass-card" style={{ padding: '1.25rem' }}>
            <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.4rem' }}>Active Days</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 600 }}>{stats.activeDays}</div>
          </div>
        </div>
      )}

      {/* Equity curve */}
      <div className="glass-card" style={{ height: '45vh', padding: '2rem' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">Loading Chart...</div>
        ) : data.length === 0 ? (
          <div className="flex justify-center items-center h-full">No data available for Equity Curve.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--accent-blue)" stopOpacity={0.4}/>
                  <stop offset="95%" stopColor="var(--accent-blue)" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                formatter={(value: any, name: any) => [fmt(Number(value)), name === 'equity' ? 'Cumulative PnL' : name === 'dayPnL' ? 'Day PnL' : name]}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" strokeDasharray="4 4" />
              <Area type="monotone" dataKey="equity" stroke="var(--accent-blue)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorEquity)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Drawdown (underwater) chart */}
      {data.length > 0 && (
        <div className="glass-card" style={{ height: '22vh', padding: '1.5rem 2rem' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.75rem' }}>Drawdown from peak</h3>
          <ResponsiveContainer width="100%" height="85%">
            <AreaChart data={data} margin={{ top: 0, right: 30, left: 20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorDD" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--danger)" stopOpacity={0.05}/>
                  <stop offset="95%" stopColor="var(--danger)" stopOpacity={0.4}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip
                contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                formatter={(value: any) => [fmt(Number(value)), 'Drawdown']}
              />
              <Area type="monotone" dataKey="drawdown" stroke="var(--danger)" strokeWidth={1.5} fillOpacity={1} fill="url(#colorDD)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
};
