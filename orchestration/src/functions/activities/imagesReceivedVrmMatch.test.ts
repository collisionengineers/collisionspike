/**
 * imagesReceivedVrmMatch (TKT-102) — the image-delivery PDF-VRM rung's decision logic.
 * Pure helpers only (the triagePolicy.test.ts convention): the scheduling predicate the
 * orchestrator branches on, the gate/registration plan, and the match-cardinality
 * resolution (exact-single → suggest; none/several → the TKT-034 flag; VRM never attaches).
 */
import { describe, expect, it } from 'vitest';
import {
  planVrmMatch,
  resolveVrmMatches,
  shouldAttemptPdfVrmMatch,
} from './imagesReceivedVrmMatch.js';

const PDF = { filename: 'tractable.pdf', contentType: 'application/pdf' };
const JPG = { filename: 'IMG_0421.jpg', contentType: 'image/jpeg' };

const imagesReceived = { subtype: 'images_received' };
const noMatchTriage = { action: 'proceed_default', finalSubtype: 'images_received' } as const;

describe('shouldAttemptPdfVrmMatch — orchestrator scheduling predicate', () => {
  it('fires for an images_received email with a PDF attachment and no subject/body match', () => {
    expect(shouldAttemptPdfVrmMatch(imagesReceived, noMatchTriage, [PDF])).toBe(true);
  });

  it('fires when only the triage relabel says images_received (Stage A said otherwise)', () => {
    expect(
      shouldAttemptPdfVrmMatch(
        { subtype: 'update_general' },
        { action: 'route_images_unmatched', finalSubtype: 'images_received' },
        [PDF],
      ),
    ).toBe(true);
  });

  it('does NOT fire when the subject/body machinery already matched (suggested or attached)', () => {
    expect(
      shouldAttemptPdfVrmMatch(imagesReceived, { action: 'suggest_attach', finalSubtype: 'images_received' }, [PDF]),
    ).toBe(false);
    expect(
      shouldAttemptPdfVrmMatch(imagesReceived, { action: 'attach_case', finalSubtype: 'images_received' }, [PDF]),
    ).toBe(false);
  });

  it('does NOT fire without a PDF attachment (plain photos stay on the existing rung 4)', () => {
    expect(shouldAttemptPdfVrmMatch(imagesReceived, noMatchTriage, [JPG])).toBe(false);
    expect(shouldAttemptPdfVrmMatch(imagesReceived, noMatchTriage, [])).toBe(false);
    expect(shouldAttemptPdfVrmMatch(imagesReceived, noMatchTriage, undefined)).toBe(false);
  });

  it('does NOT fire for a non-images-received email', () => {
    expect(
      shouldAttemptPdfVrmMatch({ subtype: 'update_general' }, { action: 'proceed_default', finalSubtype: 'update_general' }, [PDF]),
    ).toBe(false);
  });

  it('recognises a PDF by content-type when the filename has no extension', () => {
    expect(
      shouldAttemptPdfVrmMatch(imagesReceived, noMatchTriage, [{ filename: 'report', contentType: 'application/pdf' }]),
    ).toBe(true);
  });
});

describe('planVrmMatch — gates + registration plan', () => {
  it('is a no-op with both TRIAGE gates off (kill-switch discipline)', () => {
    expect(planVrmMatch({ vrm: 'AB12CDE', triedVrm: '', refGate: false, imagesRouting: false })).toEqual({
      step: 'skip',
      reason: 'gate_off',
    });
  });

  it('looks up open cases when a NEW PDF registration exists and the ref-gate is on', () => {
    expect(planVrmMatch({ vrm: 'AB12 CDE', triedVrm: '', refGate: true, imagesRouting: true })).toEqual({
      step: 'lookup',
      vrm: 'AB12CDE',
    });
  });

  it('routes straight to the flag when the parser found no registration', () => {
    expect(planVrmMatch({ vrm: '', triedVrm: '', refGate: true, imagesRouting: true })).toEqual({
      step: 'flag',
      reason: 'no_registration',
    });
  });

  it('skips a registration the subject/body machinery already tried (same nothing twice)', () => {
    expect(planVrmMatch({ vrm: 'ab12 cde', triedVrm: 'AB12CDE', refGate: true, imagesRouting: true })).toEqual({
      step: 'flag',
      reason: 'already_tried',
    });
  });

  it('cannot suggest with the ref-gate off — falls to the flag when images-routing is on', () => {
    expect(planVrmMatch({ vrm: 'AB12CDE', triedVrm: '', refGate: false, imagesRouting: true })).toEqual({
      step: 'flag',
      reason: 'suggest_gate_off',
    });
  });

  it('stays inert when only the flag would fire but its gate is off', () => {
    expect(planVrmMatch({ vrm: '', triedVrm: '', refGate: true, imagesRouting: false })).toEqual({
      step: 'skip',
      reason: 'flag_gate_off',
    });
  });
});

describe('resolveVrmMatches — cardinality (suggest-first; VRM never attaches)', () => {
  const m = (caseId: string, casePo: string) => ({ caseId, casePo });

  it('exactly one open case → suggest (a person confirms; never an attach)', () => {
    expect(resolveVrmMatches([m('c1', 'CCPY26050')])).toEqual({
      step: 'suggest',
      target: { caseId: 'c1', casePo: 'CCPY26050' },
    });
  });

  it('no open case → the visible flag', () => {
    expect(resolveVrmMatches([])).toEqual({ step: 'flag', reason: 'no_open_case' });
  });

  it('several open cases → the visible flag (a person picks; never a guess)', () => {
    expect(resolveVrmMatches([m('c1', 'CCPY26050'), m('c2', 'QDOS26029')])).toEqual({
      step: 'flag',
      reason: 'multiple_open_cases',
    });
  });

  it('two match rows naming the SAME case still count as exactly one', () => {
    expect(resolveVrmMatches([m('c1', 'CCPY26050'), m('c1', 'CCPY26050')])).toEqual({
      step: 'suggest',
      target: { caseId: 'c1', casePo: 'CCPY26050' },
    });
  });
});
