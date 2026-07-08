import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { usePortfolioData } from '../hooks/usePortfolioData';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const CalendarView: React.FC = () => {
  const { closedTrades: trades, loading } = usePortfolioData();
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth()); // 0-indexed

  const data = useMemo(() => {
    const grouped: Record<number, { pnl: number, wins: number, losses: number }> = {};
    for (const t of trades) {
      const date = new Date(t.closeDate);
      if (date.getFullYear() === year && date.getMonth() === month) {
        const day = date.getDate();
        if (!grouped[day]) grouped[day] = { pnl: 0, wins: 0, losses: 0 };
        grouped[day].pnl += t.netPnL;
        if (t.netPnL > 0) grouped[day].wins++;
        else if (t.netPnL < 0) grouped[day].losses++;
      }
    }
    return grouped;
  }, [trades, year, month]);

  const monthTotal = useMemo(
    () => Object.values(data).reduce((acc, d) => acc + d.pnl, 0),
    [data]
  );

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDay = new Date(year, month, 1).getDay(); // 0 = Sunday
  const cellCount = firstDay + daysInMonth > 35 ? 42 : 35;

  const days = Array.from({ length: cellCount }, (_, i) => {
    const day = i - firstDay + 1;
    if (day > 0 && day <= daysInMonth) return day;
    return null;
  });

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Calendar...</div>;
  }

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Calendar</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Daily performance overview.</p>
      </div>

      <div className="glass-card" style={{ padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '1.5rem', marginBottom: '1.5rem' }}>
          <button className="btn" onClick={prevMonth} style={{ padding: '0.4rem' }} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <h2 style={{ fontWeight: 600, minWidth: '220px', textAlign: 'center' }}>
            {MONTH_NAMES[month]} {year}
            <span style={{
              display: 'block',
              fontSize: '0.9rem',
              fontWeight: 600,
              color: monthTotal >= 0 ? 'var(--success)' : 'var(--danger)',
            }}>
              {monthTotal < 0 ? '-' : '+'}${Math.abs(monthTotal).toFixed(2)}
            </span>
          </h2>
          <button className="btn" onClick={nextMonth} style={{ padding: '0.4rem' }} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '1px', background: 'var(--border-glass)', border: '1px solid var(--border-glass)' }}>
          {['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'].map(d => (
            <div key={d} style={{ background: 'var(--bg-surface)', padding: '0.5rem', textAlign: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {d}
            </div>
          ))}

          {days.map((day, i) => {
            const stat = day ? data[day] : null;
            const bg = stat
              ? (stat.pnl > 0 ? 'rgba(16, 185, 129, 0.1)' : stat.pnl < 0 ? 'rgba(239, 68, 68, 0.1)' : 'var(--bg-surface)')
              : 'var(--bg-surface)';

            return (
              <div key={i} style={{ background: bg, minHeight: '100px', padding: '0.5rem', position: 'relative' }}>
                {day && (
                  <>
                    <span style={{ position: 'absolute', top: '0.5rem', left: '0.5rem', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{day}</span>
                    {stat && (
                      <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                        <div style={{ fontWeight: 600, color: stat.pnl >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                          {stat.pnl < 0 ? '-' : ''}${Math.abs(stat.pnl).toFixed(1)}
                        </div>
                        <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                          W:{stat.wins} L:{stat.losses}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
