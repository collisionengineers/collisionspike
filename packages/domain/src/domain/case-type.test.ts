import { describe, expect, it } from 'vitest';
import {
  CASE_PO_MARKER,
  MARKERED_PRINCIPALS,
  allowedCaseTypes,
  decideCaseType,
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

  it('falls back to the legacy audit boolean envelope (not-yet-redeployed parser)', () => {
    const d = decideCaseType({ parserAudit: { value: true, signals: ['audit report'] } });
    expect(d).toEqual({ caseType: 'audit', dual: false, signals: ['audit report'] });
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
