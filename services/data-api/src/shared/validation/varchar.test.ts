import { describe, expect, it } from 'vitest';
import { VRM_COLUMN_MAX, clampVarchar, vrmOrEmpty } from './varchar.js';

/** TKT-073 — an over-length value must never fail the row write (pg 22001). */

describe('clampVarchar', () => {
  it('passes a fitting value through untouched', () => {
    expect(clampVarchar('SAB/46492/1', 100)).toEqual({
      value: 'SAB/46492/1',
      clamped: false,
      originalLength: 11,
    });
  });

  it('trims before measuring', () => {
    expect(clampVarchar('  abc  ', 3)).toEqual({ value: 'abc', clamped: false, originalLength: 3 });
  });

  it('truncates an over-length value to the column width and reports the clamp', () => {
    const long = 'X'.repeat(150);
    const out = clampVarchar(long, 100);
    expect(out.value).toHaveLength(100);
    expect(out.clamped).toBe(true);
    expect(out.originalLength).toBe(150);
  });

  it('null/undefined become empty, never a throw', () => {
    expect(clampVarchar(null, 10).value).toBe('');
    expect(clampVarchar(undefined, 10).value).toBe('');
  });
});

describe('vrmOrEmpty (case_.vrm varchar(16) — the live 22001 killer)', () => {
  it('normalises a genuine plate (trim/upper/collapse spaces)', () => {
    expect(vrmOrEmpty(' pk20 fwt ')).toEqual({ value: 'PK20FWT', dropped: false });
  });

  it('keeps an unusual-but-fitting token (permissive up to the column width)', () => {
    expect(vrmOrEmpty('10071038')).toEqual({ value: '10071038', dropped: false });
  });

  it(`DROPS (never truncates) a junk sniff longer than ${VRM_COLUMN_MAX} chars`, () => {
    const junk = 'REFRIGERANT-R1234YF-LONG';
    expect(vrmOrEmpty(junk)).toEqual({ value: '', dropped: true });
  });

  it('empty in -> empty out, not "dropped"', () => {
    expect(vrmOrEmpty('')).toEqual({ value: '', dropped: false });
    expect(vrmOrEmpty(undefined)).toEqual({ value: '', dropped: false });
  });
});
