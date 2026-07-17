/**
 * poolMax (TKT-227) — the PGPOOL_MAX knob clamps to 1..20 and falls back to the
 * historical cap of 10 for an absent or garbage value, so nothing changes without an
 * explicit app-setting.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { poolMax } from './client.js';

const ORIGINAL = process.env.PGPOOL_MAX;

beforeEach(() => {
  delete process.env.PGPOOL_MAX;
});

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.PGPOOL_MAX;
  else process.env.PGPOOL_MAX = ORIGINAL;
});

describe('poolMax', () => {
  it('defaults to 10 when PGPOOL_MAX is absent', () => {
    expect(poolMax()).toBe(10);
  });

  it.each(['', 'banana', 'NaN', '  ', 'ten'])(
    'defaults to 10 for the garbage value %j',
    (value) => {
      process.env.PGPOOL_MAX = value;
      expect(poolMax()).toBe(10);
    },
  );

  it('accepts an in-range value', () => {
    process.env.PGPOOL_MAX = '5';
    expect(poolMax()).toBe(5);
  });

  it('clamps below-range values up to 1', () => {
    process.env.PGPOOL_MAX = '0';
    expect(poolMax()).toBe(1);
    process.env.PGPOOL_MAX = '-3';
    expect(poolMax()).toBe(1);
  });

  it('clamps above-range values down to 20', () => {
    process.env.PGPOOL_MAX = '999';
    expect(poolMax()).toBe(20);
  });
});
