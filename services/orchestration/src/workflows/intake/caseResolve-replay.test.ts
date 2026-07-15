import { beforeEach, describe, expect, it, vi } from 'vitest';

type ActivityHandler = (input: unknown, ctx: { log: ReturnType<typeof vi.fn> }) => Promise<unknown>;

const activities = vi.hoisted(() => new Map<string, ActivityHandler>());
const resolveCase = vi.hoisted(() => vi.fn());
const ConflictError = vi.hoisted(() => class ConflictError extends Error {});
const dataApi = vi.hoisted(() => ({
  dedupContext: vi.fn(),
  resolvePersist: vi.fn(),
}));

vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, registration: { handler: ActivityHandler }) =>
      activities.set(name, registration.handler),
  },
}));
vi.mock('@cs/domain', () => ({ resolveCase }));
vi.mock('../../adapters/data-api.js', () => ({
  dataApi,
  ConflictError,
}));

import './caseResolve.js';

const inbound = {
  messageId: 'graph-message',
  internetMessageId: '<instruction@example.test>',
  sourceMailbox: 'intake@example.test',
  payloadHash: 'a'.repeat(64),
  candidateVrm: 'AB12CDE',
  candidateRef: 'REF-123',
};

describe('caseResolve exact replay recovery', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dataApi.dedupContext.mockResolvedValue({
      openProviderCases: [],
      seenMessageIds: [],
      seenPayloadHashes: [],
    });
  });

  it('re-applies parser fields to the exact owner and resumes downstream intake', async () => {
    dataApi.dedupContext.mockResolvedValue({
      openProviderCases: [],
      seenMessageIds: ['<instruction@example.test>'],
      seenPayloadHashes: [],
      exactSourceOwner: {
        caseId: 'case-existing',
        casePo: 'QDOS26001',
        providerAutomationMode: 'review_auto',
        status: 'needs_review',
        replayAllowed: true,
      },
    });
    dataApi.resolvePersist.mockResolvedValue({
      outcome: 'replayed',
      caseId: 'case-existing',
      casePo: 'QDOS26001',
      providerAutomationMode: 'review_auto',
    });

    const result = await activities.get('caseResolve')!({
      inbound,
      providerId: 'provider-1',
      matchState: 'matched',
      parserVrm: 'AB12CDE',
      parserRef: 'REF-123',
      parserEvaFields: { claimant_name: 'Jane Driver' },
      caseType: 'standard',
      caseTypeDual: false,
      caseTypeSignals: [],
    }, { log: vi.fn() });

    expect(dataApi.resolvePersist).toHaveBeenCalledWith(expect.objectContaining({
      parserEva: { claimant_name: 'Jane Driver' },
      decision: expect.objectContaining({
        resolution: 'replay',
        targetCaseId: 'case-existing',
      }),
    }));
    expect(dataApi.dedupContext).toHaveBeenCalledWith(expect.objectContaining({
      messageId: '<instruction@example.test>',
    }));
    expect(resolveCase).not.toHaveBeenCalled();
    expect(result).toEqual({
      outcome: 'replayed',
      caseId: 'case-existing',
      casePo: 'QDOS26001',
      providerAutomationMode: 'review_auto',
    });
  });

  it('fails visibly instead of guessing when a drop decision has no immutable owner', async () => {
    dataApi.dedupContext.mockResolvedValue({
      openProviderCases: [],
      seenMessageIds: ['<instruction@example.test>'],
      seenPayloadHashes: [],
    });
    resolveCase.mockReturnValue({
      resolution: 'drop',
      statusEffect: 'ingested',
      auditAction: 'case_attached',
    });

    await expect(
      activities.get('caseResolve')!({ inbound }, { log: vi.fn() }),
    ).rejects.toThrow('no immutable source-message owner');
    expect(dataApi.resolvePersist).not.toHaveBeenCalled();
  });

  it('keeps the ADR-0010 ownerless payload-hash repeat as an idempotent drop', async () => {
    resolveCase.mockReturnValue({
      resolution: 'drop',
      statusEffect: 'keep_target',
      auditAction: 'duplicate_dropped',
    });

    await expect(
      activities.get('caseResolve')!({ inbound }, { log: vi.fn() }),
    ).resolves.toEqual({ outcome: 'already_ingested', caseId: '' });
    expect(dataApi.resolvePersist).not.toHaveBeenCalled();
  });

  it('does not replay parser or downstream work onto a terminal exact owner', async () => {
    dataApi.dedupContext.mockResolvedValue({
      openProviderCases: [],
      seenMessageIds: ['<instruction@example.test>'],
      seenPayloadHashes: [],
      exactSourceOwner: {
        caseId: 'case-final',
        casePo: 'QDOS26001',
        providerAutomationMode: 'review_auto',
        status: 'done',
        replayAllowed: false,
      },
    });

    await expect(
      activities.get('caseResolve')!({ inbound }, { log: vi.fn() }),
    ).resolves.toMatchObject({ outcome: 'already_ingested', caseId: 'case-final' });
    expect(dataApi.resolvePersist).not.toHaveBeenCalled();
  });

  it('rethrows an ownerless conflict so Durable retry cannot silently skip the case', async () => {
    resolveCase.mockReturnValue({
      resolution: 'create',
      setDuplicateRisk: false,
      statusEffect: 'new_email',
      auditAction: 'case_created',
    });
    dataApi.resolvePersist.mockRejectedValue(new ConflictError('no exact source owner'));

    await expect(
      activities.get('caseResolve')!({ inbound }, { log: vi.fn() }),
    ).rejects.toThrow('no exact source owner');
  });
});
