import React from 'react';
import { useFilteredPositions, useLiveBalances } from '../hooks/usePortfolioData';
import { useFilters } from '../context/FilterContext';

export const Positions: React.FC = () => {
  const { positions, loading, error } = useFilteredPositions();
  const { accountLabel } = useFilters();
  const { balances: visibleBalances, loading: balancesLoading, error: balancesError } = useLiveBalances();

  const fmt = (v: number | null) => v === null ? '—' : `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Positions</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Currently open positions for the selected accounts.
          <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.5rem' }}>
            {balancesLoading ? 'Fetching live balances from Schwab…' : balancesError ? 'Live balances unavailable.' : 'Balances: live from Schwab.'}
          </span>
        </p>
      </div>

      {/* Live account balances (Net Liq / Cash / Invested) */}
      {visibleBalances.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '1rem' }}>
          {visibleBalances
            .sort((a, b) => (b.net_liq ?? 0) - (a.net_liq ?? 0))
            .map(b => (
            <div key={b.account_hash} className="glass-card" style={{ padding: '1.25rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{accountLabel(b.account_hash)}</span>
                {b.day_change !== null && (
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: b.day_change >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                    {b.day_change >= 0 ? '▲' : '▼'} {fmt(b.day_change)}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Net Liq</span>
                  <span style={{ fontWeight: 600 }}>{fmt(b.net_liq)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Available Funds</span>
                  <span>{fmt(b.available_funds)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Cash &amp; Sweep</span>
                  <span>{fmt(b.cash)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Invested ({b.position_count})</span>
                  <span>{fmt(b.positions_value)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      <div className="glass-card animate-slide-up" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="data-table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Symbol</th>
                <th>Account</th>
                <th>Asset Type</th>
                <th>Qty</th>
                <th>Avg Price</th>
                <th>Mkt Value</th>
                <th>Open P&L</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : positions.length === 0 ? (
                <tr><td colSpan={7} style={{ textAlign: 'center', padding: '2rem' }}>No positions found for the selected filters.</td></tr>
              ) : (
                positions.map((p) => {
                  const mult = p.asset_type === 'OPTION' ? 100 : 1;
                  const openPnL = Number(p.market_value) - Number(p.average_price) * Number(p.quantity) * mult;
                  return (
                    <tr key={p.id}>
                      <td><strong>{p.symbol}</strong></td>
                      <td style={{ color: 'var(--text-secondary)' }}>{accountLabel(p.account_hash)}</td>
                      <td><span className="badge badge-success" style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)' }}>{p.asset_type}</span></td>
                      <td>{p.quantity}</td>
                      <td>${Number(p.average_price).toFixed(2)}</td>
                      <td>${Number(p.market_value).toFixed(2)}</td>
                      <td className={openPnL >= 0 ? 'stat-change positive' : 'stat-change negative'}>
                        {openPnL < 0 ? '-' : ''}${Math.abs(openPnL).toFixed(2)}
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
