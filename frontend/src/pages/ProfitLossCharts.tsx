import React, { useMemo } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

export const ProfitLossCharts: React.FC = () => {
  const { closedTrades, loading } = usePortfolioData();

  const data = useMemo(() => {
    // Group by Date
    const grouped: Record<string, number> = {};
    for (const t of closedTrades) {
      const d = new Date(t.closeDate).toLocaleDateString();
      grouped[d] = (grouped[d] || 0) + t.netPnL;
    }

    return Object.keys(grouped).map(date => ({
      date,
      pnl: grouped[date]
    })).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [closedTrades]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Profit & Loss Charts</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Daily Net PnL distribution.</p>
      </div>

      <div className="glass-card" style={{ height: '60vh', padding: '2rem' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">Loading Chart...</div>
        ) : data.length === 0 ? (
          <div className="flex justify-center items-center h-full">No data available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)' }} axisLine={false} tickLine={false} tickFormatter={(val) => `$${val}`} />
              <Tooltip cursor={{ fill: 'rgba(255,255,255,0.05)' }} contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
              <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.pnl >= 0 ? 'var(--success)' : 'var(--danger)'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
