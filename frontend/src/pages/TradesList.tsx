import React from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { useFilters } from '../context/FilterContext';

export const TradesList: React.FC = () => {
  const { closedTrades: trades, loading, error } = usePortfolioData();
  const { accountLabel } = useFilters();

  const formatMoney = (val: number) => `$${Math.abs(val).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Closed Trades</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Your completed trading executions. <span style={{ color: 'var(--text-muted)' }}>{loading ? '' : `${trades.length} trades`}</span>
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      <div className="glass-card animate-slide-up" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="data-table-container" style={{ overflowX: 'auto', maxHeight: '70vh' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Account</th>
                <th>Side</th>
                <th>Qty</th>
                <th>Open Date</th>
                <th>Close Date</th>
                <th>Entry Price</th>
                <th>Exit Price</th>
                <th>Gross PnL</th>
                <th>Fees</th>
                <th>Net PnL</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>Loading Trades...</td></tr>
              ) : trades.length === 0 ? (
                <tr><td colSpan={11} style={{ textAlign: 'center', padding: '2rem' }}>No closed trades found for the selected filters.</td></tr>
              ) : (
                trades.map((t) => (
                  <tr key={t.id}>
                    <td><strong>{t.symbol}</strong></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{accountLabel(t.accountHash)}</td>
                    <td><span className="badge" style={{ background: t.side === 'LONG' ? 'var(--success-bg)' : 'var(--danger-bg)', color: t.side === 'LONG' ? 'var(--success)' : 'var(--danger)' }}>{t.side}</span></td>
                    <td>{t.quantity}</td>
                    <td>{new Date(t.openDate).toLocaleString()}</td>
                    <td>{new Date(t.closeDate).toLocaleString()}</td>
                    <td>${t.entryPrice.toFixed(2)}</td>
                    <td>${t.exitPrice.toFixed(2)}</td>
                    <td style={{ color: t.grossPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {t.grossPnL < 0 ? '-' : ''}{formatMoney(t.grossPnL)}
                    </td>
                    <td>{formatMoney(t.fees)}</td>
                    <td style={{ fontWeight: 600, color: t.netPnL >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {t.netPnL < 0 ? '-' : ''}{formatMoney(t.netPnL)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
