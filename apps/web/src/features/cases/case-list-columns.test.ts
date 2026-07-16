import { describe, it, expect } from 'vitest';
import type { ActionReason, Case, CaseStatus } from '../../data';
import {
  caseDisplayName,
  columnsForQueue,
  heldReleaseEligible,
  whyHeldText,
} from './case-list-columns';

/* ============================================================
   case-list-columns — per-queue column sets + the FACT-driven held
   classification behind "Why held" and bulk-Release eligibility
   (reforge M-D + review rework, spec IA §2/§4).
   ============================================================ */

/** Minimal Case fixture — only the fields the held classifier reads. */
function heldCase(opts: {
  status: CaseStatus;
  vrm?: string;
  claimant?: string;
  onHold?: boolean;
  actionReason?: ActionReason;
  providerCode?: string;
}): Case {
  return {
    id: 'c1',
    status: opts.status,
    vrm: opts.vrm ?? 'AB12CDE',
    onHold: opts.onHold,
    actionReason: opts.actionReason,
    providerCode: opts.providerCode ?? 'CCPY',
    evaFields: { claimantName: { value: opts.claimant ?? 'Jane Doe' } },
  } as unknown as Case;
}

/** The live new-client park shape: person-parked for review, no provider code. */
function providerParkCase(extra: Partial<Parameters<typeof heldCase>[0]> = {}): Case {
  return heldCase({
    status: 'needs_review',
    onHold: true,
    actionReason: 'needs_review',
    providerCode: '',
    ...extra,
  });
}

describe('columnsForQueue', () => {
  it('not-ready keeps the full set (status/outstanding/channel genuinely vary) + Last update (TKT-117)', () => {
    expect(columnsForQueue('not-ready')).toEqual([
      'vrm',
      'casePo',
      'provider',
      'status',
      'outstanding',
      'channel',
      'lastUpdate',
      'due',
    ]);
  });

  it('review drops Outstanding/Status/Channel and adds Claimant + Vehicle', () => {
    const cols = columnsForQueue('review');
    expect(cols).toEqual(['vrm', 'casePo', 'provider', 'claimant', 'vehicle', 'lastUpdate', 'due']);
    expect(cols).not.toContain('status');
    expect(cols).not.toContain('outstanding');
    expect(cols).not.toContain('channel');
  });

  it('held drops Case/PO + Status unconditionally; carries Why held + Age', () => {
    const cols = columnsForQueue('held');
    expect(cols).toEqual(['vrm', 'provider', 'whyHeld', 'channel', 'lastUpdate', 'age']);
    expect(cols).not.toContain('casePo');
    expect(cols).not.toContain('status');
  });

  it('every queue carries the Last update column (TKT-117)', () => {
    for (const q of ['not-ready', 'review', 'held'] as const) {
      expect(columnsForQueue(q)).toContain('lastUpdate');
    }
  });
});

describe('whyHeldText', () => {
  it('a live twin count names the number — regardless of status (duplicate FACT)', () => {
    // Live held rows rarely carry duplicate_risk; the twins ARE the fact.
    const parked = heldCase({ status: 'needs_review', onHold: true });
    expect(whyHeldText(parked, 2)).toBe('Possible duplicate — 2 open for this VRM');
    expect(whyHeldText(heldCase({ status: 'duplicate_risk' }), 1)).toBe(
      'Possible duplicate — 1 open for this VRM',
    );
  });

  it('status-flagged duplicate stays generic without a positive count (never invents a number)', () => {
    const c = heldCase({ status: 'duplicate_risk' });
    expect(whyHeldText(c)).toBe('Possible duplicate');
    expect(whyHeldText(c, 0)).toBe('Possible duplicate');
  });

  it('the new-client park reads "Provider not recognised — needs set-up"', () => {
    expect(whyHeldText(providerParkCase())).toBe('Provider not recognised — needs set-up');
  });

  it('provider-not-recognised needs ALL THREE park facts (onHold + needs_review + no code)', () => {
    expect(whyHeldText(providerParkCase({ providerCode: 'CCPY' }))).toBe('On hold');
    expect(whyHeldText(providerParkCase({ onHold: false }))).toBe('On hold');
    expect(whyHeldText(providerParkCase({ actionReason: 'duplicate' }))).toBe('On hold');
  });

  it('duplicate FACT outranks the provider park', () => {
    expect(whyHeldText(providerParkCase(), 3)).toBe('Possible duplicate — 3 open for this VRM');
  });

  it('the provider park outranks missing basics', () => {
    expect(whyHeldText(providerParkCase({ claimant: '' }))).toBe(
      'Provider not recognised — needs set-up',
    );
  });

  it('missing VRM or claimant reads "Missing the basics" on ANY held row (un-gated from status)', () => {
    expect(whyHeldText(heldCase({ status: 'needs_review', onHold: true, vrm: '' }))).toBe(
      'Missing the basics (claimant / VRM)',
    );
    expect(whyHeldText(heldCase({ status: 'error', claimant: '' }))).toBe(
      'Missing the basics (claimant / VRM)',
    );
    expect(whyHeldText(heldCase({ status: 'error', vrm: '  ', claimant: '  ' }))).toBe(
      'Missing the basics (claimant / VRM)',
    );
  });

  it('errored case with its basics present reads "Failed processing"', () => {
    expect(whyHeldText(heldCase({ status: 'error' }))).toBe('Failed processing');
  });

  it('person-parked rows with nothing else wrong read "On hold"', () => {
    expect(whyHeldText(heldCase({ status: 'needs_review', onHold: true }))).toBe('On hold');
  });
});

describe('caseDisplayName', () => {
  it('falls through vrm → claimant → Case/PO → "untitled case"', () => {
    expect(caseDisplayName(heldCase({ status: 'needs_review' }))).toBe('AB12CDE');
    expect(caseDisplayName(heldCase({ status: 'needs_review', vrm: ' ' }))).toBe('Jane Doe');
    const noBasics = heldCase({ status: 'needs_review', vrm: '', claimant: '' });
    (noBasics as unknown as { casePo?: string }).casePo = 'CCPY26050';
    expect(caseDisplayName(noBasics)).toBe('CCPY26050');
    expect(caseDisplayName(heldCase({ status: 'needs_review', vrm: '', claimant: '' }))).toBe(
      'untitled case',
    );
  });
});

describe('heldReleaseEligible', () => {
  it('excludes duplicates — by live twin FACT or by status flag', () => {
    const parked = heldCase({ status: 'needs_review', onHold: true });
    expect(heldReleaseEligible(parked, 2)).toBe(false);
    expect(heldReleaseEligible(heldCase({ status: 'duplicate_risk' }))).toBe(false);
  });

  it('excludes failed-processing rows', () => {
    expect(heldReleaseEligible(heldCase({ status: 'error' }))).toBe(false);
  });

  it('keeps provider-not-recognised rows eligible (release-after-set-up flow)', () => {
    expect(heldReleaseEligible(providerParkCase())).toBe(true);
  });

  it('keeps missing-basics and plain on-hold rows eligible', () => {
    expect(heldReleaseEligible(heldCase({ status: 'needs_review', onHold: true, vrm: '' }))).toBe(
      true,
    );
    expect(heldReleaseEligible(heldCase({ status: 'needs_review', onHold: true }))).toBe(true);
  });
});
