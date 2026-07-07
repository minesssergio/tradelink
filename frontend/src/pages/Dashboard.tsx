import React, { useMemo } from 'react';
import { calculateStats } from '../lib/tradeEngine';
import { usePortfolioData, useFilteredPositions, useLiveBalances } from '../hooks/usePortfolioData';
import { useFilters } from '../context/FilterContext';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';

export const Dashboard: React.FC = () => {
  const { closedTrades, loading: txLoading, error: txError } = usePortfolioData();
  const { positions, loading: posLoading, error: posError } = useFilteredPositions();
  const { totals, loading: balLoading, error: balError } = useLiveBalances();
  const { accountLabel, isFiltering } = useFilters();

  const loading = txLoading || posLoading;
  const apiError = txError || posError;

  const stats = useMemo(() => calculateStats(closedTrades), [closedTrades]);

  // Open PnL approximation: market value vs cost basis of current holdings.
  const openPnL = useMemo(() => positions.reduce((acc, p) => {
    const mult = p.asset_type === 'OPTION' ? 100 : 1;
    const costBasis = Number(p.average_price) * Number(p.quantity) * mult;
    return acc + (Number(p.market_value) - costBasis);
  }, 0), [positions]);

  // Daily aggregates for the two charts (last 30 days with activity)
  const dailyData = useMemo(() => {
    const byDay: Record<string, { date: string; pnl: number; win: number; loss: number }> = {};
    for (const t of closedTrades) {
      const date = t.closeDate.slice(0, 10);
      if (!byDay[date]) byDay[date] = { date, pnl: 0, win: 0, loss: 0 };
      byDay[date].pnl += t.netPnL;
      if (t.netPnL >= 0) byDay[date].win++;
      else byDay[date].loss++;
    }
    const days = Object.values(byDay).sort((a, b) => a.date.localeCompare(b.date)).slice(-30);
    let cum = 0;
    return days.map(d => ({ ...d, pnl: Number(d.pnl.toFixed(2)), cumPnL: Number((cum += d.pnl).toFixed(2)) }));
  }, [closedTrades]);

  const fmtUsd = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toFixed(2)}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {apiError && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {apiError}
        </div>
      )}

      {/* Account Info (live from Schwab, like thinkorswim's panel) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {balLoading ? '…' : balError ? '—' : fmtUsd(totals.netLiq)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            NET LIQ (LIVE)
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ color: totals.dayChange >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {balLoading ? '…' : balError ? '—' : `${fmtUsd(totals.dayChange)} (${totals.dayChangePct >= 0 ? '+' : ''}${totals.dayChangePct.toFixed(2)}%)`}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            DAY CHANGE
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {balLoading ? '…' : balError ? '—' : fmtUsd(totals.availableFunds)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            AVAILABLE FUNDS FOR TRADING
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {balLoading ? '…' : balError ? '—' : fmtUsd(totals.cash)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            CASH &amp; SWEEP
          </span>
        </div>
      </div>

      {/* Journal performance KPIs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ color: openPnL >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {loading ? '…' : fmtUsd(openPnL)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            OPEN PNL (UNREALIZED)
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ color: (stats?.netPnL ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)', fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {loading ? '…' : fmtUsd(stats?.netPnL ?? 0)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL NET CLOSED PNL{isFiltering ? ' (FILTERED)' : ''}
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {loading ? '…' : `${(stats?.winRate ?? 0).toFixed(2)}%`}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            TOTAL WINNING TRADES %
          </span>
        </div>
        <div className="glass-card flex items-center justify-center" style={{ flexDirection: 'column', padding: '1.5rem 1rem' }}>
          <h2 style={{ fontSize: '1.8rem', marginBottom: '0.25rem' }}>
            {loading ? '…' : (stats?.profitFactor ?? 0).toFixed(3)}
          </h2>
          <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            PROFIT FACTOR
          </span>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        {/* Daily Wins/Losses */}
        <div className="glass-card" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Daily Wins/Losses</h3>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <RechartsTooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
                <Bar dataKey="win" stackId="a" fill="var(--success)" radius={[0, 0, 0, 0]} barSize={12} />
                <Bar dataKey="loss" stackId="a" fill="var(--danger)" radius={[4, 4, 0, 0]} barSize={12} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Cumulative PnL Area Chart */}
        <div className="glass-card" style={{ padding: '1rem' }}>
          <h3 style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1rem' }}>Cumulative Net PnL (last 30 active days)</h3>
          <div style={{ height: '200px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dailyData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPnL" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="var(--success)" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="var(--success)" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
                <RechartsTooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
                <Area type="monotone" dataKey="cumPnL" stroke="var(--success)" strokeWidth={2} fillOpacity={1} fill="url(#colorPnL)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Open Positions Table (TradesViz style) */}
      <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-glass)', display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>Open Positions</span>
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{positions.length} holdings</span>
        </div>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Account</th>
                <th>Asset Type</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Avg Price</th>
                <th>Mkt Value</th>
                <th>PnL</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : positions.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>No positions found.</td></tr>
              ) : (
                positions.map((p) => {
                  const mult = p.asset_type === 'OPTION' ? 100 : 1;
                  const rowPnL = Number(p.market_value) - Number(p.average_price) * Number(p.quantity) * mult;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.symbol}</strong></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{accountLabel(p.account_hash)}</td>
                      <td>{p.asset_type}</td>
                      <td><span style={{ color: p.quantity > 0 ? 'var(--success)' : 'var(--danger)' }}>{p.quantity > 0 ? 'long' : 'short'}</span></td>
                      <td>{p.quantity}</td>
                      <td>${Number(p.average_price).toFixed(2)}</td>
                      <td>${Number(p.market_value).toFixed(2)}</td>
                      <td style={{ color: rowPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                        {fmtUsd(rowPnL)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
};
