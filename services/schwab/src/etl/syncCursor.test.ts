import { describe, it, expect } from 'vitest';
import { resolveIncrementalStart, chunkDateRange, DEFAULT_BACKFILL_DAYS, CHUNK_DAYS } from './syncCursor.js';

describe('resolveIncrementalStart', () => {
  it('backfills DEFAULT_BACKFILL_DAYS when there is no prior data', () => {
    const now = new Date('2026-07-09T12:00:00Z');
    const start = resolveIncrementalStart(null, 3, now);
    const expected = new Date(now.getTime() - DEFAULT_BACKFILL_DAYS * 24 * 60 * 60 * 1000).toISOString();
    expect(start).toBe(expected);
  });

  it('resumes from (lastKnown - overlapDays) when prior data exists', () => {
    const lastKnown = '2026-07-01T00:00:00.000Z';
    const start = resolveIncrementalStart(lastKnown, 3);
    expect(start).toBe('2026-06-28T00:00:00.000Z');
  });

  it('uses a wider overlap for orders than transactions when given a larger overlapDays', () => {
    const lastKnown = '2026-07-08T00:00:00.000Z';
    const txStart = resolveIncrementalStart(lastKnown, 3);
    const orderStart = resolveIncrementalStart(lastKnown, 7);
    expect(new Date(orderStart).getTime()).toBeLessThan(new Date(txStart).getTime());
  });
});

describe('chunkDateRange', () => {
  it('returns a single chunk when the range fits within chunkDays', () => {
    const chunks = chunkDateRange('2026-07-01T00:00:00.000Z', '2026-07-05T00:00:00.000Z', 180);
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toEqual(['2026-07-01T00:00:00.000Z', '2026-07-05T00:00:00.000Z']);
  });

  it('splits a multi-year range into consecutive chunkDays-sized windows', () => {
    const start = '2024-07-09T00:00:00.000Z';
    const end = '2026-07-09T00:00:00.000Z'; // ~730 days, default backfill window
    const chunks = chunkDateRange(start, end, CHUNK_DAYS);

    expect(chunks.length).toBeGreaterThan(1);
    // Chunks must be contiguous: each chunk's end is the next chunk's start.
    for (let i = 1; i < chunks.length; i++) {
      expect(chunks[i]![0]).toBe(chunks[i - 1]![1]);
    }
    // First chunk starts at the range start, last chunk ends at the range end.
    expect(chunks[0]![0]).toBe(start);
    expect(chunks[chunks.length - 1]![1]).toBe(end);
  });

  it('returns no chunks when start >= end', () => {
    expect(chunkDateRange('2026-07-05T00:00:00.000Z', '2026-07-01T00:00:00.000Z')).toEqual([]);
    expect(chunkDateRange('2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z')).toEqual([]);
  });

  it('never produces a chunk wider than chunkDays', () => {
    const chunks = chunkDateRange('2026-01-01T00:00:00.000Z', '2026-12-31T00:00:00.000Z', 30);
    const maxMs = 30 * 24 * 60 * 60 * 1000;
    for (const [s, e] of chunks) {
      expect(new Date(e).getTime() - new Date(s).getTime()).toBeLessThanOrEqual(maxMs);
    }
  });
});
