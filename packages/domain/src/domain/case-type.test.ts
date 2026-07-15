import { describe, expect, it } from 'vitest';
import {
  CASE_PO_MARKER,
  MARKERED_PRINCIPALS,
  allowedCaseTypes,
  decideCaseType,
  derivedMarkerCasePo,
  markerForMint,
} from './case-type';

/**
 * ADR-0021 — the case-type taxonomy + marker/numbering decisions (operator-confirmed
 * 2026-07-03): separate sequence per marker for standalone intakes, standard number for
 * QDOS dual report+audit letters (derived audit ID at review), PCH {A., D.} + QDOS
 * {A., AP., D.} allowlist, diminution review-first.
 */

describe('marker + allowlist tables', () => {
  it('maps each case type to its Case/PO marker', () => {
    expect(CASE_PO_MARKER).toEqual({
      standard: '',
      audit: 'A.',
      audit_total_loss: 'AP.',
      diminution: 'D.',
    });
  });

  it('allowlists exactly PCH {audit, diminution} and QDOS {audit, audit_total_loss, diminution}', () => {
    expect(MARKERED_PRINCIPALS.PCH).toEqual(['audit', 'diminution']);
    expect(MARKERED_PRINCIPALS.QDOS).toEqual(['audit', 'audit_total_loss', 'diminution']);
    expect(allowedCaseTypes('pch')).toEqual(['audit', 'diminution']); // case-insensitive
    expect(allowedCaseTypes(' QDOS ')).toEqual(['audit', 'audit_total_loss', 'diminution']);
    expect(allowedCaseTypes('SBL')).toEqual([]);
    expect(allowedCaseTypes('')).toEqual([]);
    expect(allowedCaseTypes(undefined)).toEqual([]);
  });
});

describe('decideCaseType', () => {
  it('parser case_type envelope is primary — audit, with dual + signals carried through', () => {
    const d = decideCaseType({
      parserCaseType: { value: 'audit', dual: true, signals: ['report + audit report'] },
    });
    expect(d).toEqual({ caseType: 'audit', dual: true, signals: ['report + audit report'] });
  });

  it('parser diminution is honoured', () => {
    const d = decideCaseType({
      parserCaseType: { value: 'diminution', dual: false, signals: ['diminution in value'] },
    });
    expect(d.caseType).toBe('diminution');
  });

  it('falls back to the classifier subtype when the parser saw nothing', () => {
    const d = decideCaseType({ classifierSubtype: 'existing_provider_audit' });
    expect(d.caseType).toBe('audit');
    expect(d.signals).toEqual(['classifier:existing_provider_audit']);
  });

  it('no signals → standard', () => {
    expect(decideCaseType({})).toEqual({ caseType: 'standard', dual: false, signals: [] });
    expect(decideCaseType({ classifierSubtype: 'existing_provider_instruction' }).caseType).toBe(
      'standard',
    );
  });

  it('an unknown parser value degrades to the fallbacks, never propagates', () => {
    const d = decideCaseType({
      parserCaseType: { value: 'weird_type', dual: true, signals: ['x'] },
    });
    expect(d.caseType).toBe('standard');
  });
});

describe('markerForMint — the numbering decision', () => {
  it('standalone PCH audit mints from the A. sequence', () => {
    expect(markerForMint('audit', 'PCH', false)).toBe('A.');
  });

  it('QDOS dual report+audit keeps the STANDARD number (derived audit ID at review)', () => {
    expect(markerForMint('audit', 'QDOS', true)).toBe('');
  });

  it('standalone QDOS audit mints from the A. sequence', () => {
    expect(markerForMint('audit', 'QDOS', false)).toBe('A.');
  });

  it('audit for a NON-allowlisted provider mints standard (review note handles it)', () => {
    expect(markerForMint('audit', 'SBL', false)).toBe('');
    expect(markerForMint('audit', '', false)).toBe('');
    expect(markerForMint('audit', undefined, false)).toBe('');
  });

  it('diminution is review-first — never mints D. from content alone', () => {
    expect(markerForMint('diminution', 'PCH', false)).toBe('');
    expect(markerForMint('diminution', 'QDOS', false)).toBe('');
  });

  it('audit_total_loss never mints at intake for PCH (not allowlisted) — and even for QDOS it is review-time', () => {
    // PCH does not carry AP. at all.
    expect(markerForMint('audit_total_loss', 'PCH', false)).toBe('');
    // QDOS carries AP., but decideCaseType never emits audit_total_loss at intake —
    // this arm exists for a REVIEW-driven re-mint path, where it is allowlisted:
    expect(markerForMint('audit_total_loss', 'QDOS', false)).toBe('AP.');
  });

  it('standard always mints unmarked', () => {
    expect(markerForMint('standard', 'PCH', false)).toBe('');
    expect(markerForMint('standard', 'QDOS', true)).toBe('');
  });
});

describe('derivedMarkerCasePo — the review-time derived audit ID (TKT-057)', () => {
  it('QDOS dual pattern: marker + the standard number (observed corpus QDOS261608 / A.QDOS261608)', () => {
    expect(derivedMarkerCasePo('audit', 'QDOS261608')).toBe('A.QDOS261608');
    expect(derivedMarkerCasePo('audit_total_loss', 'PCH26010')).toBe('AP.PCH26010');
    expect(derivedMarkerCasePo('diminution', 'PCH26190')).toBe('D.PCH26190');
  });

  it('a Case/PO that already carries a marker IS the marker ID — never double-prefixed', () => {
    expect(derivedMarkerCasePo('audit', 'A.PCH261339')).toBe('A.PCH261339');
    expect(derivedMarkerCasePo('audit_total_loss', 'AP.QDOS261530')).toBe('AP.QDOS261530');
    expect(derivedMarkerCasePo('diminution', 'd.pch26190')).toBe('D.PCH26190');
  });

  it('standard / unset type or missing Case/PO derives nothing', () => {
    expect(derivedMarkerCasePo('standard', 'CCPY26050')).toBeUndefined();
    expect(derivedMarkerCasePo(undefined, 'CCPY26050')).toBeUndefined();
    expect(derivedMarkerCasePo('audit_total_loss', '')).toBeUndefined();
    expect(derivedMarkerCasePo('audit_total_loss', undefined)).toBeUndefined();
    expect(derivedMarkerCasePo('audit_total_loss', null)).toBeUndefined();
  });

  it('normalises to UPPER (the Box/Case-PO form)', () => {
    expect(derivedMarkerCasePo('audit_total_loss', 'pch26010')).toBe('AP.PCH26010');
  });
});
