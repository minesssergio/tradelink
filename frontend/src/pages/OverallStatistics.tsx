import React, { useMemo } from 'react';
import { calculateStats } from '../lib/tradeEngine';
import { advancedStats } from '../lib/analytics';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { Activity, Target, Flame, Shield, Receipt } from 'lucide-react';

const fmtDuration = (ms: number) => {
  const mins = ms / 60000;
  if (mins < 60) return `${mins.toFixed(0)} min`;
  if (mins < 60 * 24) return `${(mins / 60).toFixed(1)} h`;
  return `${(mins / 60 / 24).toFixed(1)} días`;
};

export const OverallStatistics: React.FC = () => {
  const { closedTrades: trades, loading } = usePortfolioData();
  const stats = useMemo(() => calculateStats(trades), [trades]);
  const adv = useMemo(() => advancedStats(trades), [trades]);

  if (loading) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>Loading Statistics...</div>;
  }

  if (!stats || trades.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center' }}>No closed trades found to generate statistics.</div>;
  }

  const formatMoney = (val: number) => `$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const getColor = (val: number) => val >= 0 ? 'var(--success)' : 'var(--danger)';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Overall Statistics</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Deep dive into your trading performance.</p>
      </div>

      {/* Main KPIs (TradesViz style) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem' }}>
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: `4px solid ${getColor(stats.grossPnL)}` }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Gross Closed PnL</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: getColor(stats.grossPnL) }}>
            {stats.grossPnL < 0 ? '-' : ''}{formatMoney(stats.grossPnL)}
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem', borderTop: `4px solid ${getColor(stats.netPnL)}` }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Total Net Closed PnL</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: getColor(stats.netPnL) }}>
            {stats.netPnL < 0 ? '-' : ''}{formatMoney(stats.netPnL)}
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Win Rate</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {stats.winRate.toFixed(2)}%
          </div>
        </div>
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.5rem' }}>Profit Factor</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)' }}>
            {stats.profitFactor.toFixed(3)}
          </div>
        </div>
      </div>

      {/* Detailed Columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.5rem' }}>
        
        {/* Averages Section */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={18} /> Averages
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Average Trade PnL</span>
              <span className={`badge ${stats.avgTrade >= 0 ? 'badge-success' : 'badge-danger'}`}>{stats.avgTrade < 0 ? '-' : ''}{formatMoney(stats.avgTrade)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Average Winning Trade</span>
              <span className="badge badge-success">{formatMoney(stats.avgWin)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Average Losing Trade</span>
              <span className="badge badge-danger">-{formatMoney(stats.avgLoss)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Avg Duration — Winners</span>
              <span style={{ fontWeight: 600, color: 'var(--success)' }}>{fmtDuration(stats.avgWinDurationMs)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Avg Duration — Losers</span>
              <span style={{
                fontWeight: 600,
                color: stats.avgLossDurationMs > stats.avgWinDurationMs * 1.3 ? 'var(--danger)' : 'var(--text-primary)',
              }}>
                {fmtDuration(stats.avgLossDurationMs)}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Trades</span>
              <span style={{ fontWeight: 600 }}>{stats.totalTrades}</span>
            </div>
          </div>
        </div>

        {/* Extremes Section */}
        <div className="glass-card" style={{ padding: '1.5rem' }}>
          <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Target size={18} /> Extremes
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Best Winning Trade</span>
              <span className="badge badge-success">{formatMoney(stats.bestTrade)}</span>
            </div>
            <div className="flex justify-between items-center">
              <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Worst Losing Trade</span>
              <span className="badge badge-danger">-{formatMoney(Math.abs(stats.worstTrade))}</span>
            </div>
            {adv && (
              <>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Median Trade PnL</span>
                  <span className={`badge ${adv.medianPnL >= 0 ? 'badge-success' : 'badge-danger'}`}>{adv.medianPnL < 0 ? '-' : ''}{formatMoney(adv.medianPnL)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Std Dev per Trade</span>
                  <span style={{ fontWeight: 600 }}>{formatMoney(adv.stdDevPnL)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Avg Duration</span>
                  <span style={{ fontWeight: 600 }}>{fmtDuration(adv.avgDurationMs)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Expectancy / edge */}
        {adv && (
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={18} /> Edge
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Expectancy (per trade)</span>
                <span className={`badge ${adv.expectancy >= 0 ? 'badge-success' : 'badge-danger'}`}>{adv.expectancy < 0 ? '-' : ''}{formatMoney(adv.expectancy)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Payoff Ratio (avg win / avg loss)</span>
                <span style={{ fontWeight: 600 }}>{adv.payoffRatio.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Wins / Losses / Breakeven</span>
                <span style={{ fontWeight: 600 }}>
                  <span style={{ color: 'var(--success)' }}>{adv.totalWins}</span> / <span style={{ color: 'var(--danger)' }}>{adv.totalLosses}</span> / {adv.breakevenTrades}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Streaks */}
        {adv && (
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Flame size={18} /> Streaks
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Max Consecutive Wins</span>
                <span className="badge badge-success">{adv.maxConsecWins} (+{formatMoney(adv.maxWinStreakPnL)})</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Max Consecutive Losses</span>
                <span className="badge badge-danger">{adv.maxConsecLosses} (-{formatMoney(adv.maxLossStreakPnL)})</span>
              </div>
            </div>
          </div>
        )}

        {/* Costs */}
        {adv && (
          <div className="glass-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ borderBottom: '1px solid var(--border-glass)', paddingBottom: '0.75rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Receipt size={18} /> Costs
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Total Fees</span>
                <span className="badge badge-danger">-{formatMoney(adv.totalFees)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Fee Drag (% of gross wins)</span>
                <span style={{ fontWeight: 600, color: adv.feeDragPct > 15 ? 'var(--danger)' : 'var(--text-primary)' }}>{adv.feeDragPct.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};
