/**
 * Simplify pass (Action A) — locks in the activity-call sequence of the shared
 * `persistEvidenceAndArchive` helper (intakeOrchestrator.ts) across the three lanes that
 * call it: attach_case, linked-reply, and receiving_work. Drives the orchestrator generator
 * by hand (the intake-terminal-replay.test.ts harness) and asserts the exact ordered
 * activity/sub-orchestrator call sequence is unchanged from the pre-extraction inlined form.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Marker = { kind: 'activity' | 'sub'; name: string };
type Orchestration = (ctx: Record<string, unknown>) => Generator<Marker, unknown, unknown>;

const orchestrations = vi.hoisted(() => new Map<string, Orchestration>());
const categoryMintsCase = vi.hoisted(() => vi.fn());
const shouldLinkReplyToCase = vi.hoisted(() => vi.fn());

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
  supplementClaimantNameFromBody: () => null,
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
  decideRetro: () => ({ attempt: false, reasons: [] }),
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

describe('intakeOrchestrator evidence-persistence sequence (Action A extraction)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('attach_case branch: classifyPersist -> extractImages -> boxArchiveEvidence -> statusEvaluate', () => {
    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<attach@example.test>',
        subject: 'Re: Case QDOS26050',
        body: '',
        candidateRef: 'QDOS26050',
        candidateVrm: '',
        attachments: [],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      triageUnified: {
        classification: {
          category: 'receiving_work',
          subtype: 'existing_provider_instruction',
          confidence: 1,
          signals: [],
          bodyCaseref: 'QDOS26050',
          bodyJobref: '',
          bodyVrm: '',
        },
        decision: {
          action: 'attach_case',
          targetCaseId: 'case-attach-1',
          finalCategory: 'case_update',
          finalSubtype: 'update_general',
        },
        parseFedApplied: false,
      },
      classifyPersist: {},
      extractImages: {},
      boxArchiveEvidence: {},
      statusEvaluate: { value: 'needs_review' },
    });

    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'triageUnified',
      'classifyPersist',
      'extractImages',
      'boxArchiveEvidence',
      'statusEvaluate',
    ]);
    expect(subCalls).toEqual([]);
    expect(returnValue).toEqual({
      triaged: 'case_update',
      subtype: 'update_general',
      attach: 'attach_case',
      caseId: 'case-attach-1',
      status: 'needs_review',
    });
  });

  it('linked-reply branch: classifyPersist -> extractImages -> boxArchiveEvidence -> statusEvaluate', () => {
    categoryMintsCase.mockReturnValue(false);
    shouldLinkReplyToCase.mockReturnValue(true);

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<reply@example.test>',
        subject: 'Re: your case',
        body: '',
        candidateRef: 'QDOS26051',
        candidateVrm: '',
        attachments: [],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      triageUnified: {
        classification: {
          category: 'case_update',
          subtype: 'update_general',
          confidence: 1,
          signals: [],
          bodyCaseref: 'QDOS26051',
          bodyJobref: '',
          bodyVrm: '',
          isReply: true,
        },
        decision: { action: 'proceed_default', finalCategory: 'case_update', finalSubtype: 'update_general' },
        parseFedApplied: false,
      },
      linkReply: { outcome: 'linked', caseId: 'case-reply-1' },
      classifyPersist: {},
      extractImages: {},
      boxArchiveEvidence: {},
      statusEvaluate: { value: 'done' },
    });

    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'triageUnified',
      'linkReply',
      'classifyPersist',
      'extractImages',
      'boxArchiveEvidence',
      'statusEvaluate',
    ]);
    expect(subCalls).toEqual([]);
    expect(returnValue).toEqual({
      triaged: 'case_update',
      subtype: 'update_general',
      replyLink: 'linked',
      caseId: 'case-reply-1',
      status: 'done',
    });
  });

  it('receiving_work tail: classifyPersist -> extractImages -> boxArchiveEvidence -> statusEvaluate -> enrich', () => {
    categoryMintsCase.mockReturnValue(true);

    const { returnValue, activityCalls, subCalls } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<instruction@example.test>',
        subject: 'Instruction',
        body: '',
        candidateRef: '',
        candidateVrm: '',
        attachments: [],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      triageUnified: {
        classification: {
          category: 'receiving_work',
          subtype: 'existing_provider_instruction',
          confidence: 1,
          signals: [],
          bodyCaseref: '',
          bodyJobref: '',
          bodyVrm: '',
        },
        decision: { action: 'proceed_default', finalCategory: 'receiving_work', finalSubtype: 'existing_provider_instruction' },
        parseFedApplied: false,
      },
      caseResolve: {
        outcome: 'created',
        caseId: 'case-work-1',
        casePo: 'QDOS26099',
        providerAutomationMode: 'review_auto',
      },
      setIngested: {},
      correlatePreInstruction: {},
      boxFolderCreateOrchestrator: { folderId: 'folder-1', providerRecoveryCompleted: false },
      classifyPersist: {},
      extractImages: {},
      boxArchiveEvidence: {},
      statusEvaluate: { value: 'needs_review' },
      enrich: {},
    });

    // attachments: [] → hoisted parse is skipped (no doc candidates); triageUnified is the
    // single classify+triage call.
    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'triageUnified',
      'caseResolve',
      'setIngested',
      'correlatePreInstruction',
      'classifyPersist',
      'extractImages',
      'boxArchiveEvidence',
      'statusEvaluate',
      'enrich',
    ]);
    expect(subCalls).toEqual(['boxFolderCreateOrchestrator']);
    expect(returnValue).toEqual({
      caseId: 'case-work-1',
      status: 'needs_review',
      mode: 'review_auto',
      providerRecovery: 'not_needed',
    });
  });
});
