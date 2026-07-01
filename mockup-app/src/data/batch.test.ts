import { describe, it, expect } from 'vitest';
import { runBatch, summarizeBatch } from './batch';

/* ============================================================
   batch — the pure bulk-mutation runner (reforge M-E1, spec IA §4).
   ============================================================ */

const tick = (ms = 2) => new Promise<void>((resolve) => setTimeout(resolve, ms));

describe('runBatch', () => {
  it('resolves every id into exactly one of ok/failed (never throws)', async () => {
    const result = await runBatch(['a', 'b', 'c', 'd'], async (id) => {
      await tick();
      if (id === 'b' || id === 'd') throw new Error(`boom ${id}`);
    });
    expect([...result.ok].sort()).toEqual(['a', 'c']);
    expect(result.failed.map((f) => f.id).sort()).toEqual(['b', 'd']);
    expect(result.failed.find((f) => f.id === 'b')?.error.message).toBe('boom b');
  });

  it('actually enforces the concurrency cap', async () => {
    let active = 0;
    let maxActive = 0;
    const ids = Array.from({ length: 12 }, (_, i) => `id-${i}`);
    await runBatch(
      ids,
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await tick(4);
        active -= 1;
      },
      { concurrency: 4 },
    );
    expect(maxActive).toBeLessThanOrEqual(4);
    expect(maxActive).toBeGreaterThan(1); // it does run in parallel
  });

  it('respects a custom (lower) concurrency', async () => {
    let active = 0;
    let maxActive = 0;
    await runBatch(
      ['a', 'b', 'c', 'd', 'e'],
      async () => {
        active += 1;
        maxActive = Math.max(maxActive, active);
        await tick(3);
        active -= 1;
      },
      { concurrency: 1 },
    );
    expect(maxActive).toBe(1);
  });

  it('handles all-fail', async () => {
    const result = await runBatch(['a', 'b'], () => Promise.reject(new Error('down')));
    expect(result.ok).toEqual([]);
    expect(result.failed.map((f) => f.id)).toEqual(['a', 'b']);
  });

  it('handles empty input without calling fn', async () => {
    let calls = 0;
    const result = await runBatch([], async () => {
      calls += 1;
    });
    expect(result).toEqual({ ok: [], failed: [] });
    expect(calls).toBe(0);
  });

  it('normalizes non-Error throws', async () => {
    const result = await runBatch(['a'], () => Promise.reject('plain string'));
    expect(result.failed[0].error).toBeInstanceOf(Error);
    expect(result.failed[0].error.message).toBe('plain string');
  });
});

describe('summarizeBatch', () => {
  it('full success → "<Verb> n cases"', () => {
    expect(summarizeBatch('Held', { ok: ['a', 'b', 'c'], failed: [] })).toEqual({
      ok: true,
      title: 'Held 3 cases',
    });
    expect(summarizeBatch('Released', { ok: ['a'], failed: [] })).toEqual({
      ok: true,
      title: 'Released 1 case',
    });
  });

  it('partial failure → "x of y" + stay-selected detail', () => {
    const s = summarizeBatch('Held', {
      ok: ['a', 'b', 'c', 'd'],
      failed: [
        { id: 'e', error: new Error('x') },
        { id: 'f', error: new Error('y') },
      ],
    });
    expect(s.ok).toBe(false);
    expect(s.title).toBe('Held 4 of 6 cases');
    expect(s.detail).toBe('2 failed and stay selected — retry when ready.');
  });

  it('single failure uses the singular verb form', () => {
    const s = summarizeBatch('Released', {
      ok: [],
      failed: [{ id: 'a', error: new Error('x') }],
    });
    expect(s.title).toBe('Released 0 of 1 case');
    expect(s.detail).toBe('1 failed and stays selected — retry when ready.');
  });
});
