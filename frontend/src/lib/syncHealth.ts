/**
 * Pure decision logic for the sync-health banner. Kept free of I/O so it can
 * be unit-tested — the component just feeds it data from Supabase.
 */

export type TokenStatus = 'ACTIVE' | 'NEEDS_REAUTH' | 'REVOKED' | null;

export interface SyncHealth {
  level: 'ok' | 'warning' | 'critical';
  /** Human message for the banner; empty when level === 'ok'. */
  message: string;
}

/** Days without a successful sync before we warn the user their data is stale. */
export const STALE_SYNC_THRESHOLD_DAYS = 3;

const DAY_MS = 24 * 60 * 60 * 1000;

export function evaluateSyncHealth(
  tokenStatus: TokenStatus,
  lastSuccessfulSyncAt: string | null,
  now: Date = new Date()
): SyncHealth {
  // No token row = user hasn't connected Schwab yet. That's onboarding, not an
  // outage — Settings already guides them; a red banner would just nag.
  if (tokenStatus === null) return { level: 'ok', message: '' };

  if (tokenStatus === 'NEEDS_REAUTH' || tokenStatus === 'REVOKED') {
    return {
      level: 'critical',
      message: 'Tu conexión con Schwab requiere re-autorización — tus datos dejaron de actualizarse. Ve a Settings → Connect Schwab para reconectar.',
    };
  }

  // ACTIVE token but the syncs aren't landing
  if (lastSuccessfulSyncAt) {
    const ageDays = (now.getTime() - new Date(lastSuccessfulSyncAt).getTime()) / DAY_MS;
    if (ageDays > STALE_SYNC_THRESHOLD_DAYS) {
      const days = Math.floor(ageDays);
      return {
        level: 'warning',
        message: `La última sincronización exitosa fue hace ${days} día${days === 1 ? '' : 's'} — tus datos pueden estar desactualizados. Prueba el botón Sync; si falla repetidamente, revisa Settings.`,
      };
    }
    return { level: 'ok', message: '' };
  }

  // ACTIVE token but no successful run on record at all (e.g. connected but
  // first sync never ran, or sync_runs table just created)
  return {
    level: 'warning',
    message: 'Schwab está conectado pero aún no hay ninguna sincronización exitosa registrada. Pulsa Sync para traer tus datos.',
  };
}
