import React, { useMemo } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

export const EquityCurve: React.FC = () => {
  const { closedTrades, loading } = usePortfolioData();

  const data = useMemo(() => {
    // Sort trades historically from oldest to newest
    const historical = [...closedTrades].sort((a, b) => new Date(a.closeDate).getTime() - new Date(b.closeDate).getTime());

    let cumulativePnL = 0;
    return historical.map(t => {
      cumulativePnL += t.netPnL;
      return {
        date: new Date(t.closeDate).toLocaleDateString(),
        pnl: cumulativePnL
      };
    });
  }, [closedTrades]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Equity Curve</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Your cumulative Net PnL over time.</p>
      </div>

      <div className="glass-card" style={{ height: '60vh', padding: '2rem' }}>
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
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
              <Area type="stepAfter" dataKey="pnl" stroke="var(--accent-blue)" strokeWidth={3} fillOpacity={1} fill="url(#colorEquity)" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
