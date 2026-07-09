import React, { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import {
  breakdownBy, weekdayOf, durationBucketOf, instrumentKind, rollingWinRate,
  DURATION_ORDER, WEEKDAY_ORDER, type BreakdownRow,
} from '../lib/analytics';
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ReferenceLine,
} from 'recharts';

const WEEKDAY_SHORT: Record<string, string> = {
  Monday: 'Mon', Tuesday: 'Tue', Wednesday: 'Wed', Thursday: 'Thu', Friday: 'Fri', Saturday: 'Sat', Sunday: 'Sun',
};

/** Small win-rate bar chart reused for each breakdown below. Bars are colored by win rate: green ≥50%, red <50%. */
const WinRateBarChart: React.FC<{ rows: BreakdownRow[]; labelFormatter?: (k: string) => string }> = ({ rows, labelFormatter }) => (
  <ResponsiveContainer width="100%" height="100%">
    <BarChart data={rows} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
      <XAxis
        dataKey="key"
        tickFormatter={labelFormatter}
        tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
      />
      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
      <Tooltip
        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
        contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
        formatter={(value: any, _name, item: any) => [`${Number(value).toFixed(1)}% (${item.payload.trades} trades)`, 'Win Rate']}
      />
      <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
      <Bar dataKey="winRate" radius={[4, 4, 0, 0]}>
        {rows.map((r, i) => (
          <Cell key={i} fill={r.winRate >= 50 ? 'var(--success)' : 'var(--danger)'} />
        ))}
      </Bar>
    </BarChart>
  </ResponsiveContainer>
);

export const WinRateCharts: React.FC = () => {
  const { closedTrades, loading } = usePortfolioData();

  const donutData = useMemo(() => {
    let wins = 0, losses = 0, breakeven = 0;
    for (const t of closedTrades) {
      if (t.netPnL > 0) wins++;
      else if (t.netPnL < 0) losses++;
      else breakeven++;
    }
    const slices = [
      { name: 'Winning Trades', value: wins, color: 'var(--success)' },
      { name: 'Losing Trades', value: losses, color: 'var(--danger)' },
    ];
    if (breakeven > 0) slices.push({ name: 'Breakeven', value: breakeven, color: 'var(--text-muted)' });
    return slices;
  }, [closedTrades]);

  const overallWinRate = useMemo(() => {
    const decisive = closedTrades.filter(t => t.netPnL !== 0).length;
    const wins = closedTrades.filter(t => t.netPnL > 0).length;
    return decisive > 0 ? (wins / decisive) * 100 : 0;
  }, [closedTrades]);

  const byWeekday = useMemo(() =>
    breakdownBy(closedTrades, weekdayOf).sort((a, b) => WEEKDAY_ORDER.indexOf(a.key) - WEEKDAY_ORDER.indexOf(b.key)),
  [closedTrades]);

  const byDuration = useMemo(() =>
    breakdownBy(closedTrades, durationBucketOf).sort((a, b) => DURATION_ORDER.indexOf(a.key) - DURATION_ORDER.indexOf(b.key)),
  [closedTrades]);

  const byInstrument = useMemo(() =>
    breakdownBy(closedTrades, instrumentKind).sort((a, b) => b.trades - a.trades),
  [closedTrades]);

  const trend = useMemo(() => rollingWinRate(closedTrades, 20), [closedTrades]);

  const hasData = closedTrades.length > 0;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Win-Rate Charts</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Distribution of winning vs losing trades, cut by day, duration and instrument type.
        </p>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem' }}>
        {/* Overall donut */}
        <div className="glass-card" style={{ flex: '1 1 45%', height: '40vh', padding: '1.5rem', position: 'relative' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Overall</h3>
          {loading ? (
            <div className="flex justify-center items-center h-full">Loading Chart...</div>
          ) : !hasData ? (
            <div className="flex justify-center items-center h-full">No closed trades available.</div>
          ) : (
            <>
              <div style={{
                position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -46%)',
                textAlign: 'center', pointerEvents: 'none',
              }}>
                <div style={{ fontSize: '1.8rem', fontWeight: 700 }}>{overallWinRate.toFixed(1)}%</div>
                <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Win Rate</div>
              </div>
              <ResponsiveContainer width="100%" height="90%">
                <PieChart>
                  <Pie data={donutData} cx="50%" cy="50%" innerRadius={70} outerRadius={110} paddingAngle={5} dataKey="value" stroke="none">
                    {donutData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }} />
                  <Legend verticalAlign="bottom" height={30} iconType="circle" />
                </PieChart>
              </ResponsiveContainer>
            </>
          )}
        </div>

        {/* Rolling win-rate trend */}
        <div className="glass-card" style={{ flex: '1 1 45%', height: '40vh', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>
            Rolling Win Rate <span style={{ color: 'var(--text-muted)', fontWeight: 400 }}>(last 20 trades)</span>
          </h3>
          {!hasData || trend.length === 0 ? (
            <div className="flex justify-center items-center h-full" style={{ height: '85%', color: 'var(--text-muted)' }}>
              {hasData ? 'Need at least 20 closed trades to show a trend.' : 'No closed trades available.'}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="85%">
              <LineChart data={trend} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                <ReferenceLine y={50} stroke="rgba(255,255,255,0.2)" strokeDasharray="4 4" />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-surface)', border: '1px solid var(--border-glass)' }}
                  formatter={(value: any) => [`${Number(value).toFixed(1)}%`, 'Win Rate']}
                />
                <Line type="monotone" dataKey="winRate" stroke="var(--accent-blue)" strokeWidth={2.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* By weekday */}
        <div className="glass-card" style={{ flex: '1 1 45%', height: '32vh', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Win Rate by Day of Week</h3>
          {!hasData ? (
            <div className="flex justify-center items-center h-full" style={{ height: '85%', color: 'var(--text-muted)' }}>No data</div>
          ) : (
            <div style={{ height: '85%' }}>
              <WinRateBarChart rows={byWeekday} labelFormatter={(k) => WEEKDAY_SHORT[k] ?? k} />
            </div>
          )}
        </div>

        {/* By duration */}
        <div className="glass-card" style={{ flex: '1 1 45%', height: '32vh', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Win Rate by Holding Time</h3>
          {!hasData ? (
            <div className="flex justify-center items-center h-full" style={{ height: '85%', color: 'var(--text-muted)' }}>No data</div>
          ) : (
            <div style={{ height: '85%' }}>
              <WinRateBarChart rows={byDuration} />
            </div>
          )}
        </div>

        {/* By instrument kind */}
        <div className="glass-card" style={{ flex: '1 1 100%', height: '32vh', padding: '1.5rem' }}>
          <h3 style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '0.5rem' }}>Win Rate by Instrument (Calls / Puts / Stock)</h3>
          {!hasData ? (
            <div className="flex justify-center items-center h-full" style={{ height: '85%', color: 'var(--text-muted)' }}>No data</div>
          ) : (
            <div style={{ height: '85%' }}>
              <WinRateBarChart rows={byInstrument} />
            </div>
          )}
        </div>
      </div>

      {/* Cross-links to the deeper analysis tools */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <Link to="/reports/breakdowns" className="glass-card" style={{ flex: 1, minWidth: '260px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Cut by symbol, hour or account</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Full interactive breakdown table →</div>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>
        <Link to="/insights" className="glass-card" style={{ flex: 1, minWidth: '260px', padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', textDecoration: 'none', color: 'inherit' }}>
          <div>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>What's dragging my metrics down?</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Auto-generated insights →</div>
          </div>
          <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
        </Link>
      </div>
    </div>
  );
};
