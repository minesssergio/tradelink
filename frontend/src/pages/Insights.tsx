import React, { useMemo } from 'react';
import { AlertOctagon, AlertTriangle, Info, CheckCircle2 } from 'lucide-react';
import { usePortfolioData } from '../hooks/usePortfolioData';
import { generateInsights, underlyingOf } from '../lib/analytics';

const SEVERITY_STYLE = {
  bad: { icon: AlertOctagon, color: 'var(--danger)', label: 'Crítico' },
  warning: { icon: AlertTriangle, color: '#f59e0b', label: 'Atención' },
  info: { icon: Info, color: 'var(--accent-blue)', label: 'Info' },
  good: { icon: CheckCircle2, color: 'var(--success)', label: 'Fortaleza' },
} as const;

export const Insights: React.FC = () => {
  const { closedTrades, loading, error } = usePortfolioData();

  const insights = useMemo(() => generateInsights(closedTrades), [closedTrades]);

  const worstTrades = useMemo(() =>
    [...closedTrades].sort((a, b) => a.netPnL - b.netPnL).slice(0, 10).filter(t => t.netPnL < 0),
  [closedTrades]);

  const fmt = (v: number) => `${v < 0 ? '-' : ''}$${Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 className="text-gradient">Insights</h1>
        <p style={{ color: 'var(--text-secondary)' }}>
          Hallazgos automáticos sobre tu operativa — qué está bajando (o sosteniendo) tus métricas. Respetan los filtros de cuenta y fecha.
        </p>
      </div>

      {error && (
        <div className="glass-card" style={{ padding: '1rem 1.5rem', border: '1px solid var(--danger)', color: 'var(--danger)' }}>
          ⚠️ {error}
        </div>
      )}

      {loading ? (
        <div style={{ padding: '2rem', textAlign: 'center' }}>Analyzing your trades...</div>
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {insights.map((ins, i) => {
              const s = SEVERITY_STYLE[ins.severity];
              const Icon = s.icon;
              return (
                <div key={i} className="glass-card" style={{ padding: '1.25rem 1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start', borderLeft: `3px solid ${s.color}` }}>
                  <Icon size={22} style={{ color: s.color, flexShrink: 0, marginTop: '0.15rem' }} />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: s.color }}>{s.label}</span>
                    </div>
                    <h3 style={{ fontSize: '1.02rem', marginBottom: '0.35rem' }}>{ins.title}</h3>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55 }}>{ins.detail}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Worst offenders table */}
          {worstTrades.length > 0 && (
            <div className="glass-card" style={{ padding: '0', overflow: 'hidden' }}>
              <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border-glass)' }}>
                <span style={{ fontWeight: 600 }}>Los 10 trades que más te costaron</span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginLeft: '0.75rem' }}>
                  impacto combinado: {fmt(worstTrades.reduce((s, t) => s + t.netPnL, 0))}
                </span>
              </div>
              <div className="data-table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Subyacente</th>
                      <th>Símbolo</th>
                      <th>Side</th>
                      <th>Cierre</th>
                      <th>Duración</th>
                      <th>Net PnL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {worstTrades.map((t, i) => (
                      <tr key={t.id}>
                        <td style={{ color: 'var(--text-muted)' }}>{i + 1}</td>
                        <td><strong>{underlyingOf(t)}</strong></td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>{t.symbol}</td>
                        <td>{t.side}</td>
                        <td>{new Date(t.closeDate).toLocaleString()}</td>
                        <td>{(t.durationMs / 60000).toFixed(0)} min</td>
                        <td style={{ fontWeight: 600, color: 'var(--danger)' }}>{fmt(t.netPnL)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
