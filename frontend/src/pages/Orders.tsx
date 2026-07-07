import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { useFilters } from '../context/FilterContext';

interface OrderRow {
  id: string;
  account_hash: string;
  order_id: string;
  entered_time: string;
  close_time: string | null;
  status: string;
  order_type: string | null;
  symbol: string | null;
  instruction: string | null;
  position_effect: string | null;
  quantity: number | null;
  filled_quantity: number | null;
  price: number | null;
}

const STATUS_COLORS: Record<string, string> = {
  FILLED: 'var(--success)',
  WORKING: 'var(--accent-blue)',
  CANCELED: 'var(--text-muted)',
  REJECTED: 'var(--danger)',
  EXPIRED: 'var(--text-muted)',
};

export const Orders: React.FC = () => {
  const { filterTransactions, accountLabel } = useFilters();
  const [rawOrders, setRawOrders] = useState<OrderRow[]>([]);
  const [setupRequired, setSetupRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');

  useEffect(() => {
    api.getOrders()
      .then(res => {
        setRawOrders(res.data || []);
        setSetupRequired(!!res.setupRequired);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setError(err instanceof TypeError
          ? 'No se puede conectar con el servidor API (localhost:3001). Arranca los servidores con start.bat.'
          : String(err?.message || err));
        setLoading(false);
      });
  }, []);

  // Reuse the account+date filter helper (orders expose entered_time as `time`)
  const orders = useMemo(() => {
    const withTime = rawOrders.map(o => ({ ...o, time: o.entered_time }));
    const filtered = filterTransactions(withTime);
    return statusFilter ? filtered.filter(o => o.status === statusFilter) : filtered;
  }, [rawOrders, filterTransactions, statusFilter]);

  const statuses = useMemo(() => [...new Set(rawOrders.map(o => o.status))].sort(), [rawOrders]);

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h1 className="text-gradient">Orders</h1>
          <p style={{ color: 'var(--text-secondary)' }}>
            Order lifecycle from Schwab (working, filled, canceled). <span style={{ color: 'var(--text-muted)' }}>{loading ? '' : `${orders.length} orders`}</span>
          </p>
        </div>
        {statuses.length > 0 && (
          <select
            className="input-glass"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            style={{ padding: '0.5rem 0.75rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}
          >
            <option value="">All statuses</option>
            {statuses.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        )}
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {setupRequired && (
        <div className="glass-card" style={{ padding: '2rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          <AlertTriangle size={24} style={{ color: 'var(--warning, #f59e0b)', flexShrink: 0 }} />
          <div>
            <h3 style={{ marginBottom: '0.5rem' }}>One-time setup required</h3>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              The <code>schwab_orders</code> table doesn't exist yet. Run
              <code> supabase/migrations/004_create_schwab_orders.sql</code> in the Supabase SQL Editor,
              then trigger a sync from Settings and reload this page.
            </p>
          </div>
        </div>
      )}

      <div className="glass-card animate-slide-up" style={{ padding: '0', overflow: 'hidden' }}>
        <div className="data-table-container" style={{ overflowX: 'auto', maxHeight: '70vh' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Entered</th>
                <th>Symbol</th>
                <th>Account</th>
                <th>Instruction</th>
                <th>Effect</th>
                <th>Type</th>
                <th>Qty</th>
                <th>Filled</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>Loading Orders...</td></tr>
              ) : orders.length === 0 ? (
                <tr><td colSpan={10} style={{ textAlign: 'center', padding: '2rem' }}>
                  {setupRequired ? 'Waiting for migration + first sync.' : 'No orders found for the selected filters.'}
                </td></tr>
              ) : (
                orders.map((o) => (
                  <tr key={o.id}>
                    <td>{new Date(o.entered_time).toLocaleString()}</td>
                    <td><strong>{o.symbol || '—'}</strong></td>
                    <td style={{ color: 'var(--text-secondary)' }}>{accountLabel(o.account_hash)}</td>
                    <td>{o.instruction || '—'}</td>
                    <td>{o.position_effect || '—'}</td>
                    <td>{o.order_type || '—'}</td>
                    <td>{o.quantity ?? '—'}</td>
                    <td>{o.filled_quantity ?? '—'}</td>
                    <td>{o.price !== null ? `$${Number(o.price).toFixed(2)}` : '—'}</td>
                    <td>
                      <span className="badge" style={{ background: 'rgba(255,255,255,0.05)', color: STATUS_COLORS[o.status] || 'var(--text-secondary)' }}>
                        {o.status}
                      </span>
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
