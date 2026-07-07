import React, { useMemo } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

export const WinRateCharts: React.FC = () => {
  const { closedTrades, loading } = usePortfolioData();

  const data = useMemo(() => {
    let wins = 0;
    let losses = 0;

    for (const t of closedTrades) {
      if (t.netPnL >= 0) wins++;
      else losses++;
    }

    return [
      { name: 'Winning Trades', value: wins, color: 'var(--success)' },
      { name: 'Losing Trades', value: losses, color: 'var(--danger)' }
    ];
  }, [closedTrades]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Win-Rate Charts</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Distribution of Winning vs Losing Trades.</p>
      </div>

      <div className="glass-card" style={{ height: '60vh', padding: '2rem' }}>
        {loading ? (
          <div className="flex justify-center items-center h-full">Loading Chart...</div>
        ) : data[0].value === 0 && data[1].value === 0 ? (
          <div className="flex justify-center items-center h-full">No closed trades available.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={80}
                outerRadius={140}
                paddingAngle={5}
                dataKey="value"
                stroke="none"
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
              <Legend verticalAlign="bottom" height={36} iconType="circle" />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};
