import React from 'react';

export const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => {
  return (
    <div className="animate-fade-in flex items-center justify-center" style={{ minHeight: '60vh', flexDirection: 'column', gap: '1rem' }}>
      <h1 className="text-gradient" style={{ fontSize: '3rem' }}>{title}</h1>
      <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem' }}>
        Esta sección se construirá en las próximas fases del proyecto.
      </p>
      <div className="glass-card mt-2" style={{ padding: '2rem', textAlign: 'center', opacity: 0.7 }}>
        <p>🚧 En construcción 🚧</p>
      </div>
    </div>
  );
};
