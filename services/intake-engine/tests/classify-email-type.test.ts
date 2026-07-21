import { describe, it, expect } from 'vitest';
import { classifyEmailType } from '../src/pipeline/classify-email-type.js';
import type { ProviderRegistryEntry } from '../src/registry/schema.js';

function entry(overrides: Partial<ProviderRegistryEntry> = {}): ProviderRegistryEntry {
  return {
    principalCode: 'TEST',
    relationship: 'direct',
    active: true,
    knownEmailDomains: [],
    knownEmailAddresses: [],
    candidatePrincipals: [],
    caseTypeMarkers: [],
    emailTypeRules: {
      dualCommissioningPhrases: ['REPORT + AUDIT REPORT'],
      auditSignalPhrases: ['please audit the'],
      auditRepairableVerdictPhrases: ['found the vehicle repairable'],
      auditTotalLossVerdictPhrases: ['total loss'],
    },
    ...overrides,
  };
}

describe('classifyEmailType', () => {
  it('defaults to 1a_standard when no audit/dual-commissioning signal is present', () => {
    const result = classifyEmailType(entry(), 'Please proceed with a standard engineer inspection.');
    expect(result.emailType).toBe('1a_standard');
  });

  it('1b_audit_repairable when an audit signal + repairable verdict phrase are present', () => {
    const result = classifyEmailType(
      entry({ caseTypeMarkers: ['audit_repairable', 'audit_total_loss'] }),
      'Please audit the previous report. The engineer found the vehicle repairable.',
    );
    expect(result.emailType).toBe('1b_audit_repairable');
    expect(result.matchedAuditSignalPhrase).toBe('please audit the');
    expect(result.matchedVerdictPhrase).toBe('found the vehicle repairable');
  });

  it('1b_audit_total_loss when an audit signal + total-loss verdict phrase are present', () => {
    const result = classifyEmailType(
      entry({ caseTypeMarkers: ['audit_repairable', 'audit_total_loss'] }),
      'Please audit the previous report. This vehicle is a total loss.',
    );
    expect(result.emailType).toBe('1b_audit_total_loss');
  });

  it('1c_inspection_and_audit on the dual-commissioning phrase, regardless of audit-signal wording', () => {
    const result = classifyEmailType(entry(), 'We require REPORT + AUDIT REPORT for this instruction.');
    expect(result.emailType).toBe('1c_inspection_and_audit');
    expect(result.matchedDualCommissioningPhrase).toBe('REPORT + AUDIT REPORT');
  });

  it('needs_review when an audit is detected but the verdict cannot be determined', () => {
    const result = classifyEmailType(entry(), 'Please audit the previous engineer\'s report and advise.');
    expect(result.emailType).toBe('needs_review');
    expect(result.matchedAuditSignalPhrase).toBe('please audit the');
    expect(result.matchedVerdictPhrase).toBeUndefined();
  });

  it('needs_review when both verdict phrases are present (contradictory content)', () => {
    const result = classifyEmailType(
      entry({ caseTypeMarkers: ['audit_repairable', 'audit_total_loss'] }),
      'Please audit the previous report. Found the vehicle repairable, but also this is a total loss.',
    );
    expect(result.emailType).toBe('needs_review');
  });

  it('needs_review when a detected verdict is not in the provider\'s declared caseTypeMarkers', () => {
    const result = classifyEmailType(
      entry({ caseTypeMarkers: ['audit_repairable'] }), // total_loss NOT declared
      'Please audit the previous report. This vehicle is a total loss.',
    );
    expect(result.emailType).toBe('needs_review');
  });

  it('an empty caseTypeMarkers list is non-restrictive (not yet declared, not "no markers allowed")', () => {
    const result = classifyEmailType(
      entry({ caseTypeMarkers: [] }),
      'Please audit the previous report. This vehicle is a total loss.',
    );
    expect(result.emailType).toBe('1b_audit_total_loss');
  });

  it('phrase matching is case-insensitive', () => {
    const result = classifyEmailType(entry(), 'PLEASE AUDIT THE report and confirm the vehicle to be repairable.');
    // audit signal matches case-insensitively; no configured verdict phrase matches this
    // exact wording, so this exercises the case-insensitive audit-signal path via needs_review.
    expect(result.matchedAuditSignalPhrase).toBe('please audit the');
  });
});
