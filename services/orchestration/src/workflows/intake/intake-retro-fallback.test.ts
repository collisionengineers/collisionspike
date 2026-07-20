/**
 * Simplify pass (Action B) — locks in the activity-call sequence of the shared
 * `runRetroFallback` helper (intakeOrchestrator.ts) across the two mutually-exclusive lanes
 * that call it: an unmatched reply, and a non-reply arrival. Drives the orchestrator
 * generator by hand (the intake-terminal-replay.test.ts harness) and asserts that
 * retroCaseOrchestrator fires (or doesn't) identically to the pre-extraction inlined form
 * under equivalent decideRetro outcomes.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Marker = { kind: 'activity' | 'sub'; name: string };
type Orchestration = (ctx: Record<string, unknown>) => Generator<Marker, unknown, unknown>;

const orchestrations = vi.hoisted(() => new Map<string, Orchestration>());
const categoryMintsCase = vi.hoisted(() => vi.fn());
const shouldLinkReplyToCase = vi.hoisted(() => vi.fn());
const decideRetro = vi.hoisted(() => vi.fn());

vi.mock('durable-functions', () => ({
  RetryOptions: class RetryOptions {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public firstRetryIntervalInMilliseconds: number,
      public maxNumberOfAttempts: number,
    ) {}
  },
  app: {
    orchestration: (name: string, handler: Orchestration) => orchestrations.set(name, handler),
  },
}));

vi.mock('../../platform/supplement-parse.js', () => ({
  supplementClaimantNameFromBody: () => ({ status: 'absent', value: '', candidates: [] }),
  supplementAccidentCircumstancesFromBody: () => '',
  resolveClaimantInputs: () => ({ value: '', conflicts: [], fromEmailBody: false }),
}));
vi.mock('../evidence/imagesReceivedVrmMatch.js', () => ({
  shouldAttemptPdfVrmMatch: () => false,
}));
vi.mock('./reply-link-eligibility.js', () => ({
  shouldLinkReplyToCase,
}));
vi.mock('./triage-classify.js', () => ({
  shouldAttemptTriageAssist: () => false,
}));
vi.mock('@cs/domain', () => ({
  categoryMintsCase,
  decideCaseType: () => ({ caseType: 'standard', dual: false, signals: [] }),
  decideRetro,
}));
vi.mock('../../platform/vehicle-data-intake.js', () => ({
  vehicleDataIntakeIdempotencyKey: () => 'unused',
}));

import './intakeOrchestrator.js';

function driveOrchestrator(results: Record<string, unknown>) {
  const activityCalls: string[] = [];
  const subCalls: string[] = [];
  const ctx = {
    log: vi.fn(),
    df: {
      getInput: () => ({ messageId: 'graph-msg' }),
      isReplaying: false,
      instanceId: 'instance-1',
      newGuid: () => 'guid-1',
      callActivityWithRetry: (name: string): Marker => {
        activityCalls.push(name);
        return { kind: 'activity', name };
      },
      callSubOrchestratorWithRetry: (name: string): Marker => {
        subCalls.push(name);
        return { kind: 'sub', name };
      },
    },
  };
  const generator = orchestrations.get('intakeOrchestrator')!(ctx);
  let step = generator.next();
  while (!step.done) {
    step = generator.next(results[step.value.name]);
  }
  return { returnValue: step.value, activityCalls, subCalls };
}

const baseFetchMessage = {
  messageId: 'graph-msg',
  subject: 'A message',
  body: '',
  candidateRef: '',
  candidateVrm: '',
  attachments: [],
};
const baseProviderMatch = { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' };
const baseClassification = {
  category: 'query',
  subtype: 'query_existing_work',
  confidence: 1,
  signals: [],
  bodyCaseref: '',
  bodyJobref: '',
  bodyVrm: '',
};
const proceedDefault = { action: 'proceed_default', finalCategory: 'query', finalSubtype: 'query_existing_work' };

describe('intakeOrchestrator retro-fallback sequence (Action B extraction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    categoryMintsCase.mockReturnValue(false);
  });

  it('reply lane: an unmatched reply attempts retro reconstruction', () => {
    shouldLinkReplyToCase.mockReturnValue(true);
    decideRetro.mockReturnValue({ attempt: true, keys: { casePo: 'QDOS26050' }, reasons: [] });

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: { ...baseFetchMessage, internetMessageId: '<reply-unmatched@example.test>' },
      providerMatch: baseProviderMatch,
      classifyInbound: { ...baseClassification, isReply: true },
      triagePolicy: proceedDefault,
      linkReply: { outcome: 'no_match' },
      retroCaseOrchestrator: { outcome: 'created' },
    });

    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'classifyInbound',
      'triagePolicy',
      'linkReply',
    ]);
    expect(subCalls).toEqual(['retroCaseOrchestrator']);
    expect(decideRetro).toHaveBeenCalledWith(
      expect.objectContaining({ isReply: true, linkReplyOutcome: 'no_match' }),
    );
    expect(returnValue).toEqual({
      triaged: 'query',
      subtype: 'query_existing_work',
      replyLink: 'no_match',
      retro: 'created',
    });
  });

  it('reply lane: decideRetro declining to attempt never calls retroCaseOrchestrator', () => {
    shouldLinkReplyToCase.mockReturnValue(true);
    decideRetro.mockReturnValue({ attempt: false, keys: {}, reasons: ['no_usable_key'] });

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: { ...baseFetchMessage, internetMessageId: '<reply-no-key@example.test>' },
      providerMatch: baseProviderMatch,
      classifyInbound: { ...baseClassification, isReply: true },
      triagePolicy: proceedDefault,
      linkReply: { outcome: 'no_match' },
    });

    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'classifyInbound',
      'triagePolicy',
      'linkReply',
    ]);
    expect(subCalls).toEqual([]);
    expect(returnValue).toEqual({
      triaged: 'query',
      subtype: 'query_existing_work',
      replyLink: 'no_match',
    });
  });

  it('non-reply lane: an unmatched non-reply arrival attempts retro reconstruction', () => {
    shouldLinkReplyToCase.mockReturnValue(false);
    decideRetro.mockReturnValue({ attempt: true, keys: { externalRef: 'JOB-9' }, reasons: [] });

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: { ...baseFetchMessage, internetMessageId: '<billing@example.test>' },
      providerMatch: baseProviderMatch,
      classifyInbound: { ...baseClassification, category: 'billing', isReply: false },
      triagePolicy: { action: 'proceed_default', finalCategory: 'billing', finalSubtype: 'query_existing_work' },
      retroCaseOrchestrator: { outcome: 'created' },
    });

    expect(activityCalls).toEqual(['fetchMessage', 'providerMatch', 'classifyInbound', 'triagePolicy']);
    expect(subCalls).toEqual(['retroCaseOrchestrator']);
    expect(decideRetro).toHaveBeenCalledWith(expect.objectContaining({ isReply: false }));
    expect(decideRetro.mock.calls[0][0]).not.toHaveProperty('linkReplyOutcome');
    expect(returnValue).toEqual({
      triaged: 'billing',
      subtype: 'query_existing_work',
      retro: 'created',
    });
  });

  it('non-reply lane: decideRetro declining to attempt never calls retroCaseOrchestrator', () => {
    shouldLinkReplyToCase.mockReturnValue(false);
    decideRetro.mockReturnValue({ attempt: false, keys: {}, reasons: ['category_not_eligible:query'] });

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: { ...baseFetchMessage, internetMessageId: '<query@example.test>' },
      providerMatch: baseProviderMatch,
      classifyInbound: { ...baseClassification, isReply: false },
      triagePolicy: proceedDefault,
    });

    expect(activityCalls).toEqual(['fetchMessage', 'providerMatch', 'classifyInbound', 'triagePolicy']);
    expect(subCalls).toEqual([]);
    expect(returnValue).toEqual({
      triaged: 'query',
      subtype: 'query_existing_work',
    });
  });
});
