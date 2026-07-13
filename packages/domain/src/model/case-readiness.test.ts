import { describe, expect, it } from 'vitest';
import {
  mergeSourceReadinessIntoCase,
  readinessInputForCase,
  sourceReadinessInputForCase,
  sourceReadinessRecoverySnapshot,
} from './case-readiness';
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
    expect(sourceReadinessInputForCase(value)).toEqual({
      sourceEvidencePending: true,
      sourceEvidenceArchiveFailed: true,
    });
    const dirtyDraft = { ...value, vrm: 'DIRTY-DRAFT' } as Case;
    expect(mergeSourceReadinessIntoCase(dirtyDraft, {
      status: 'needs_review',
      sourceEvidencePending: false,
      sourceEvidenceArchiveFailed: false,
    })).toMatchObject({
      vrm: 'DIRTY-DRAFT',
      status: 'needs_review',
      sourceEvidencePending: false,
      sourceEvidenceArchiveFailed: false,
    });
    const persisted = { ...value, vrm: 'SAVED' } as Case;
    const recovery = sourceReadinessRecoverySnapshot(
      dirtyDraft,
      persisted,
      {
        status: 'needs_review',
        version: 'server-v2',
        sourceEvidencePending: false,
        sourceEvidenceArchiveFailed: false,
      },
      'server-v1',
    );
    expect(recovery).toMatchObject({
      draft: { vrm: 'DIRTY-DRAFT', status: 'needs_review', sourceEvidenceArchiveFailed: false },
      persisted: { vrm: 'SAVED', status: 'needs_review', sourceEvidenceArchiveFailed: false },
      version: 'server-v2',
    });
    expect(readinessInputForCase({
      ...value,
      sourceEvidencePending: undefined,
      sourceEvidenceArchiveFailed: undefined,
    }).sourceEvidencePending).toBe(false);
  });
});
