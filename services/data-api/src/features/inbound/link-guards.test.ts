import { describe, expect, it } from 'vitest';
import { normalizeRefToken, vrmLinkRefConflict } from './link-guards.js';

/**
 * TKT-101 regression — the QDOS 46533/1 vs 46671/1 wrong-link. Distinct refs on the
 * same (junk or genuinely shared) VRM must refuse the VRM-only auto-link.
 */

describe('normalizeRefToken', () => {
  it('uppercases, trims, and collapses whitespace', () => {
    expect(normalizeRefToken(' 46671/1 ')).toBe('46671/1');
    expect(normalizeRefToken('sab / 46492 / 1')).toBe('SAB/46492/1');
    expect(normalizeRefToken(undefined)).toBe('');
  });
});

describe('vrmLinkRefConflict', () => {
  it('the live QDOS shape: incoming 46671/1 vs a case known as 46533/1 -> CONFLICT (refuse the link)', () => {
    expect(vrmLinkRefConflict('46671/1', ['', null, '46533/1'])).toBe(true);
  });

  it('same reference -> no conflict (the link may proceed)', () => {
    expect(vrmLinkRefConflict('46533/1', ['46533/1'])).toBe(false);
    expect(vrmLinkRefConflict(' 46533/1 ', ['46533/1  '])).toBe(false);
  });

  it('matches against ANY of the case-known refs (case_ref, case_po, sibling job-refs)', () => {
    expect(vrmLinkRefConflict('46533/1', ['QDOS26056', 'SAB/46533/1', '46533/1'])).toBe(false);
    expect(vrmLinkRefConflict('QDOS26056', ['QDOS26056', '46533/1'])).toBe(false);
  });

  it('incoming email cites NO reference -> nothing to contradict (VRM link proceeds)', () => {
    expect(vrmLinkRefConflict('', ['46533/1'])).toBe(false);
    expect(vrmLinkRefConflict(null, ['46533/1'])).toBe(false);
  });

  it('case has NO known references -> nothing to contradict (VRM link proceeds)', () => {
    expect(vrmLinkRefConflict('46671/1', ['', null, undefined])).toBe(false);
    expect(vrmLinkRefConflict('46671/1', [])).toBe(false);
  });
});
