import React, { useState } from 'react';
import { api } from '../lib/api';
import { Link2, RefreshCw, Key, Layers } from 'lucide-react';
import { useFilters } from '../context/FilterContext';
import { LOT_METHOD_LABELS, type LotMethod } from '../lib/tradeEngine';
import { invalidatePortfolioCache } from '../hooks/usePortfolioData';

const LOT_METHOD_DESCRIPTIONS: Record<LotMethod, string> = {
  FIFO: 'Shares are sold in order of their purchase dates, from oldest to newest.',
  LIFO: 'Shares are sold in order of their purchase dates, from newest to oldest.',
  HIGH_COST: 'Shares are sold in order of their original purchase prices, from highest to lowest.',
  LOW_COST: 'Shares are sold in order of their original purchase prices, from lowest to highest.',
};

const LotMethodSettings: React.FC = () => {
  const {
    accounts, accountLabel,
    defaultLotMethod, setDefaultLotMethod,
    lotMethodOverrides, setAccountLotMethod,
  } = useFilters();

  return (
    <div className="glass-card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Layers size={24} className="brand-icon" />
        <h3 style={{ margin: 0 }}>Lot Selection Method</h3>
      </div>
      <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
        Debe coincidir con el "Default Lot Selection Method" configurado en Schwab para cada cuenta.
        Determina qué lote se cierra en cada venta y, por tanto, el PnL de cada trade.
        (Tax Lot Optimizer no es reproducible; usa High Cost como aproximación.)
      </p>

      {/* Default method (radio, Schwab style) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Default method (all accounts)
        </span>
        {(Object.keys(LOT_METHOD_LABELS) as LotMethod[]).map(m => (
          <label key={m} style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', cursor: 'pointer', padding: '0.35rem 0' }}>
            <input
              type="radio"
              name="default-lot-method"
              checked={defaultLotMethod === m}
              onChange={() => setDefaultLotMethod(m)}
              style={{ marginTop: '0.2rem', accentColor: 'var(--accent-blue, #6366f1)' }}
            />
            <span>
              <span style={{ fontWeight: 600 }}>{LOT_METHOD_LABELS[m]}</span>
              <span style={{ display: 'block', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                {LOT_METHOD_DESCRIPTIONS[m]}
              </span>
            </span>
          </label>
        ))}
      </div>

      {/* Per-account overrides */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Per-account override
        </span>
        {accounts.map(acc => (
          <div key={acc.account_hash} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ minWidth: '120px', fontSize: '0.9rem' }}>{accountLabel(acc.account_hash)}</span>
            <select
              className="input-glass"
              value={lotMethodOverrides[acc.account_hash] || ''}
              onChange={e => setAccountLotMethod(acc.account_hash, (e.target.value || null) as LotMethod | null)}
              style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border-glass)', borderRadius: '8px' }}
            >
              <option value="">Default ({LOT_METHOD_LABELS[defaultLotMethod]})</option>
              {(Object.keys(LOT_METHOD_LABELS) as LotMethod[]).map(m => (
                <option key={m} value={m}>{LOT_METHOD_LABELS[m]}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
    </div>
  );
};

export const Settings: React.FC = () => {
  const [loadingLink, setLoadingLink] = useState(false);
  const [loadingSync, setLoadingSync] = useState(false);
  const [callbackUrl, setCallbackUrl] = useState('');
  const [loadingSubmit, setLoadingSubmit] = useState(false);

  const handleConnect = async () => {
    setLoadingLink(true);
    try {
      const { url } = await api.getAuthUrl();
      window.location.href = url;
    } catch (err) {
      console.error(err);
      alert('Failed to get Auth URL');
      setLoadingLink(false);
    }
  };

  const handleSync = async () => {
    setLoadingSync(true);
    try {
      const res = await api.triggerSync();
      invalidatePortfolioCache();
      const skipped = res.skippedMissingTables?.length
        ? `\n\nPendiente: aplicar migraciones para ${res.skippedMissingTables.join(', ')} (SQL Editor de Supabase).`
        : '';
      alert(`Sync successful! ${res.transactionsProcessed} transactions, ${res.positionsProcessed} positions, ${res.ordersProcessed ?? 0} orders.${skipped}`);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Sync failed');
    } finally {
      setLoadingSync(false);
    }
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!callbackUrl) return;
    
    setLoadingSubmit(true);
    try {
      let code = callbackUrl;
      // Extract code if it's a full URL
      if (callbackUrl.includes('code=')) {
        const urlParams = new URLSearchParams(callbackUrl.substring(callbackUrl.indexOf('?')));
        code = urlParams.get('code') || callbackUrl;
      }

      await api.submitCallbackCode(code);
      alert('Code verified! You are now connected to Schwab.');
      setCallbackUrl('');
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Failed to verify code');
    } finally {
      setLoadingSubmit(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Settings</h1>
        <p style={{ color: 'var(--text-secondary)' }}>Manage your integrations and preferences.</p>
      </div>

      <div className="dashboard-grid">
        <div className="glass-card animate-slide-up" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <Link2 size={24} className="brand-icon" />
            <h3 style={{ margin: 0 }}>Charles Schwab Integration</h3>
          </div>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
            1. Click "Connect Schwab" to authorize.<br/>
            2. When redirected to 127.0.0.1 (it will show an error), copy the ENTIRE URL from your browser's address bar.<br/>
            3. Paste it in the box below to link your account.
          </p>
          
          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem' }}>
            <button className="btn btn-primary" onClick={handleConnect} disabled={loadingLink}>
              {loadingLink ? 'Redirecting...' : 'Connect Schwab'}
            </button>
            <button className="btn btn-glass" onClick={handleSync} disabled={loadingSync}>
              <RefreshCw size={18} className={loadingSync ? 'spinning' : ''} />
              {loadingSync ? 'Syncing...' : 'Force Sync'}
            </button>
          </div>

          <form onSubmit={handleSubmitCode} style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem' }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Key size={16} style={{ position: 'absolute', top: '50%', left: '1rem', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input 
                type="text" 
                className="input-glass" 
                placeholder="Paste the https://127.0.0.1/?code=... URL here"
                style={{ paddingLeft: '2.5rem' }}
                value={callbackUrl}
                onChange={(e) => setCallbackUrl(e.target.value)}
              />
            </div>
            <button type="submit" className="btn btn-primary" disabled={loadingSubmit || !callbackUrl}>
              {loadingSubmit ? 'Saving...' : 'Link Account'}
            </button>
          </form>
        </div>

        <LotMethodSettings />
      </div>
    </div>
  );
};
