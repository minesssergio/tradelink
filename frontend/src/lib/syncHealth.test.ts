import { describe, it, expect } from 'vitest';
import { evaluateSyncHealth, STALE_SYNC_THRESHOLD_DAYS } from './syncHealth';

const NOW = new Date('2026-07-10T12:00:00Z');
const daysAgo = (d: number) => new Date(NOW.getTime() - d * 24 * 60 * 60 * 1000).toISOString();

describe('evaluateSyncHealth', () => {
  it('is silent for a user who never connected Schwab (onboarding, not an outage)', () => {
    expect(evaluateSyncHealth(null, null, NOW).level).toBe('ok');
  });

  it('is critical when the token needs re-auth, regardless of sync recency', () => {
    const health = evaluateSyncHealth('NEEDS_REAUTH', daysAgo(0.1), NOW);
    expect(health.level).toBe('critical');
    expect(health.message).toContain('re-autorización');
  });

  it('is critical when the token was revoked', () => {
    expect(evaluateSyncHealth('REVOKED', daysAgo(1), NOW).level).toBe('critical');
  });

  it('is silent when ACTIVE and the last successful sync is recent', () => {
    expect(evaluateSyncHealth('ACTIVE', daysAgo(1), NOW).level).toBe('ok');
  });

  it('warns when ACTIVE but the last successful sync is older than the threshold', () => {
    const health = evaluateSyncHealth('ACTIVE', daysAgo(STALE_SYNC_THRESHOLD_DAYS + 2), NOW);
    expect(health.level).toBe('warning');
    expect(health.message).toContain('5 días');
  });

  it('does not warn exactly at the threshold boundary (weekend + Monday gap is normal)', () => {
    expect(evaluateSyncHealth('ACTIVE', daysAgo(STALE_SYNC_THRESHOLD_DAYS), NOW).level).toBe('ok');
  });

  it('warns when ACTIVE but no successful sync was ever recorded', () => {
    const health = evaluateSyncHealth('ACTIVE', null, NOW);
    expect(health.level).toBe('warning');
    expect(health.message).toContain('Sync');
  });

  it('uses singular "día" for exactly one day', () => {
    const health = evaluateSyncHealth('ACTIVE', daysAgo(4.4), NOW);
    expect(health.message).toContain('4 días');
  });
});
