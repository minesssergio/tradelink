import React, { useState } from 'react';
import { usePortfolioData } from '../hooks/usePortfolioData';

export const Transactions: React.FC = () => {
  const { transactions, loading, error } = usePortfolioData();
  const [viewRaw, setViewRaw] = useState(false);

  // Compute unique keys from raw_data for the raw table headers
  const rawKeys = Array.from(new Set(transactions.flatMap(t => Object.keys(t.raw_data || {}))));

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-gradient">Transactions</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Historical activity from Schwab.</p>
        </div>
        <button
          className="btn btn-glass"
          onClick={() => setViewRaw(!viewRaw)}
        >
          {viewRaw ? 'Standard View' : 'View Raw Data'}
        </button>
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
              {viewRaw ? (
                <tr>
                  {rawKeys.map(key => <th key={key} style={{ whiteSpace: 'nowrap' }}>{key}</th>)}
                </tr>
              ) : (
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Description</th>
                  <th>Amount</th>
                </tr>
              )}
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={viewRaw ? rawKeys.length : 5} style={{ textAlign: 'center', padding: '2rem' }}>Loading...</td></tr>
              ) : transactions.length === 0 ? (
                <tr><td colSpan={viewRaw ? rawKeys.length : 5} style={{ textAlign: 'center', padding: '2rem' }}>No transactions found.</td></tr>
              ) : (
                transactions.map((t) => (
                  viewRaw ? (
                    <tr key={t.id}>
                      {rawKeys.map(key => {
                        const val = t.raw_data?.[key];
                        return (
                          <td key={key} style={{ whiteSpace: 'nowrap' }}>
                            {typeof val === 'object' ? JSON.stringify(val) : String(val ?? '')}
                          </td>
                        );
                      })}
                    </tr>
                  ) : (
                    <tr key={t.id}>
                      <td>{new Date(t.time).toLocaleString()}</td>
                      <td><span className="badge" style={{ background: 'rgba(255,255,255,0.05)' }}>{t.type}</span></td>
                      <td>{t.status}</td>
                      <td>{t.raw_data?.description || '-'}</td>
                      <td style={{ color: Number(t.amount || 0) < 0 ? 'var(--danger)' : 'var(--success)' }}>
                        ${Number(t.amount || 0).toFixed(2)}
                      </td>
                    </tr>
                  )
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
