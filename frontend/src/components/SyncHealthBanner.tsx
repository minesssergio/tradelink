import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, AlertOctagon } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useFilters } from '../context/FilterContext';
import { evaluateSyncHealth, type SyncHealth, type TokenStatus } from '../lib/syncHealth';

/**
 * App-wide banner that surfaces sync problems the user would otherwise never
 * see: a Schwab connection needing re-auth, or days without a successful sync.
 * Reads only the CURRENT user's rows (schwab_tokens + sync_runs, both RLS-scoped).
 */
export const SyncHealthBanner: React.FC = () => {
  const { dataVersion } = useFilters();
  const [health, setHealth] = useState<SyncHealth>({ level: 'ok', message: '' });

  useEffect(() => {
    (async () => {
      const [{ data: token }, { data: lastRun, error: runsError }] = await Promise.all([
        supabase.from('schwab_tokens').select('status').maybeSingle(),
        supabase
          .from('sync_runs')
          .select('created_at')
          .eq('success', true)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      // If sync_runs doesn't exist yet (migration pending) don't nag about
      // missing runs — only token-status problems are trustworthy then.
      const lastSuccess = runsError ? new Date().toISOString() : (lastRun?.created_at ?? null);
      setHealth(evaluateSyncHealth((token?.status as TokenStatus) ?? null, lastSuccess));
    })();
  }, [dataVersion]);

  if (health.level === 'ok') return null;

  const isCritical = health.level === 'critical';
  const color = isCritical ? 'var(--danger)' : '#f59e0b';
  const Icon = isCritical ? AlertOctagon : AlertTriangle;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '0.75rem',
      padding: '0.7rem 1rem', marginBottom: '1rem', borderRadius: '10px',
      background: isCritical ? 'rgba(239,68,68,0.08)' : 'rgba(245,158,11,0.08)',
      border: `1px solid ${color}`,
    }}>
      <Icon size={18} style={{ color, flexShrink: 0 }} />
      <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)', flex: 1 }}>{health.message}</span>
      {isCritical && (
        <Link to="/settings" className="btn btn-primary" style={{ padding: '0.35rem 0.8rem', fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
          Ir a Settings
        </Link>
      )}
    </div>
  );
};
