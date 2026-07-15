/**
 * api/src/lib/triage-locks.test.ts — pure lock-key derivation (no DB).
 * `acquireTriageLocks` is a thin loop over `deriveTriageLockKeys` + a TxQuery call, so
 * covering the derivation exhaustively here is what actually pins the serialisation
 * contract the three call sites (triage/context, cases/resolve, inbound/link-reply) share.
 */
import { describe, it, expect } from 'vitest';
import { deriveTriageLockKeys } from './triage-locks';

describe('deriveTriageLockKeys', () => {
  it('derives one namespaced key per present signal', () => {
    expect(deriveTriageLockKeys({ caseref: 'ccpy26050' })).toEqual(['triage:ref:CCPY26050']);
    expect(deriveTriageLockKeys({ jobref: 'abc-123' })).toEqual(['triage:jobref:ABC-123']);
    expect(deriveTriageLockKeys({ vrm: 'ab12 cde' })).toEqual(['triage:vrm:AB12 CDE']);
  });

  it('normalizes case and trims surrounding whitespace', () => {
    expect(deriveTriageLockKeys({ caseref: '  ccpy26050  ' })).toEqual(['triage:ref:CCPY26050']);
    expect(deriveTriageLockKeys({ vrm: '\tab12cde\n' })).toEqual(['triage:vrm:AB12CDE']);
  });

  it('skips blank, whitespace-only, or undefined signals', () => {
    expect(deriveTriageLockKeys({})).toEqual([]);
    expect(deriveTriageLockKeys({ caseref: '', jobref: '   ', vrm: undefined })).toEqual([]);
  });

  it('returns keys in a FIXED order (ref, jobref, vrm) regardless of input key order', () => {
    expect(deriveTriageLockKeys({ vrm: 'AB12CDE', jobref: 'J1', caseref: 'C1' })).toEqual([
      'triage:ref:C1',
      'triage:jobref:J1',
      'triage:vrm:AB12CDE',
    ]);
    expect(deriveTriageLockKeys({ jobref: 'J1', vrm: 'AB12CDE' })).toEqual([
      'triage:jobref:J1',
      'triage:vrm:AB12CDE',
    ]);
  });

  it('is pure — repeated calls with equal (not identical) input yield equal output', () => {
    const input = { caseref: 'X', vrm: 'Y' };
    expect(deriveTriageLockKeys(input)).toEqual(deriveTriageLockKeys({ ...input }));
  });

  it('keeps distinct namespaces even when two signals share the same raw value', () => {
    // A job ref that happens to equal a case ref string must still lock BOTH namespaces —
    // they are different real-world identifiers that happen to collide as text.
    expect(deriveTriageLockKeys({ caseref: 'SAME', jobref: 'SAME' })).toEqual([
      'triage:ref:SAME',
      'triage:jobref:SAME',
    ]);
  });
});
