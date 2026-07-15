import { describe, expect, it, vi } from 'vitest';

vi.mock('durable-functions', () => ({
  app: { orchestration: vi.fn() },
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public readonly firstRetryIntervalInMilliseconds: number,
      public readonly maxNumberOfAttempts: number,
    ) {}
  },
}));
vi.mock('./activities/imagesReceivedVrmMatch.js', () => ({ shouldAttemptPdfVrmMatch: vi.fn() }));
vi.mock('./activities/reply-link-eligibility.js', () => ({ shouldLinkReplyToCase: vi.fn() }));
vi.mock('./gated/triage-classify.js', () => ({ shouldAttemptTriageAssist: vi.fn() }));

import { providerRecoveryAfterArchive } from './intakeOrchestrator.js';

describe('provider recovery completion boundary', () => {
  it('reports completion only when the Archive folder is linked', () => {
    expect(providerRecoveryAfterArchive(
      'identity_ready',
      { folderId: 'folder-123', outcome: 'created', providerRecoveryCompleted: true },
      false,
    )).toBe('completed');
    expect(providerRecoveryAfterArchive(
      'identity_ready',
      {
        skipped: true,
        reason: 'already_linked',
        folderId: 'folder-123',
        providerRecoveryCompleted: true,
      },
      false,
    )).toBe('completed');
  });

  it('keeps identity-only, gated, no-PO, and failed folder work pending', () => {
    expect(providerRecoveryAfterArchive('identity_ready', undefined, false)).toBe('archive_pending');
    expect(providerRecoveryAfterArchive(
      'identity_ready',
      { folderId: 'folder-123', providerRecoveryCompleted: false },
      false,
    )).toBe('archive_pending');
    expect(providerRecoveryAfterArchive(
      'identity_ready',
      { skipped: true, reason: 'gated off' },
      false,
    )).toBe('archive_pending');
    expect(providerRecoveryAfterArchive(
      'identity_ready',
      { skipped: true, reason: 'no_case_po' },
      false,
    )).toBe('archive_pending');
    expect(providerRecoveryAfterArchive('identity_ready', undefined, true)).toBe('archive_pending');
  });

  it('does not widen blocked or unrelated intake outcomes', () => {
    expect(providerRecoveryAfterArchive('blocked', { folderId: 'folder-123' }, false)).toBe('blocked');
    expect(providerRecoveryAfterArchive('not_needed', undefined, true)).toBe('not_needed');
    expect(providerRecoveryAfterArchive(undefined, undefined, false)).toBe('not_needed');
  });
});
