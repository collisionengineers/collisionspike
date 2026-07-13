import { describe, expect, it } from 'vitest';
import { readinessInputForCase } from './case-readiness';
import type { Case } from './types';

describe('readinessInputForCase', () => {
  it('carries a pending manual source batch into every canonical readiness consumer', () => {
    const value = {
      status: 'ready_for_eva',
      evaFields: { claimantName: { value: '' } },
      evidence: [],
      inspectionDecision: 'confirmed_physical',
      vrm: 'AB12CDE',
      providerCode: '',
      sourceEvidencePending: true,
      sourceEvidenceArchiveFailed: true,
    } as unknown as Case;

    expect(readinessInputForCase(value).sourceEvidencePending).toBe(true);
    expect(readinessInputForCase(value).sourceEvidenceArchiveFailed).toBe(true);
    expect(readinessInputForCase({
      ...value,
      sourceEvidencePending: undefined,
      sourceEvidenceArchiveFailed: undefined,
    }).sourceEvidencePending).toBe(false);
  });
});
