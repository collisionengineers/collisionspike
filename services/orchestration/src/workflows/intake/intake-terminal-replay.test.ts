import { describe, expect, it, vi } from 'vitest';

type Marker = { kind: 'activity' | 'sub'; name: string };
type Orchestration = (ctx: Record<string, unknown>) => Generator<Marker, unknown, unknown>;

const orchestrations = vi.hoisted(() => new Map<string, Orchestration>());

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
  shouldLinkReplyToCase: () => false,
}));
vi.mock('./triage-classify.js', () => ({
  shouldAttemptTriageAssist: () => false,
}));
vi.mock('@cs/domain', () => ({
  categoryMintsCase: () => true,
  decideCaseType: () => ({ caseType: 'standard', dual: false, signals: [] }),
  decideRetro: () => ({ attempt: false, reasons: [] }),
}));
vi.mock('../../platform/vehicle-data-intake.js', () => ({
  vehicleDataIntakeIdempotencyKey: () => 'unused',
}));

import './intakeOrchestrator.js';

describe('intakeOrchestrator terminal exact-message replay', () => {
  it('stops without scheduling Archive or any other downstream mutation', () => {
    const activityCalls: string[] = [];
    const subCalls: string[] = [];
    const results: Record<string, unknown> = {
      fetchMessage: {
        messageId: 'graph-final',
        internetMessageId: '<final@example.test>',
        subject: 'Instruction',
        body: '',
        candidateRef: '',
        candidateVrm: '',
        attachments: [],
      },
      providerMatch: {
        workProviderId: 'provider-1',
        matchState: 'matched',
        principalCode: 'QDOS',
      },
      classifyInbound: {
        category: 'receiving_work',
        subtype: 'instruction',
        confidence: 1,
        signals: [],
        bodyCaseref: '',
        bodyJobref: '',
        bodyVrm: '',
      },
      triagePolicy: {
        action: 'proceed_default',
        finalCategory: 'receiving_work',
        finalSubtype: 'instruction',
      },
      parse: {},
      caseResolve: {
        outcome: 'already_ingested',
        caseId: 'case-final',
        casePo: 'QDOS26001',
        providerAutomationMode: 'review_auto',
      },
    };
    const ctx = {
      log: vi.fn(),
      df: {
        getInput: () => ({ messageId: 'graph-final' }),
        isReplaying: false,
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

    expect(step.value).toEqual({ skipped: true, caseId: 'case-final' });
    expect(activityCalls).toEqual([
      'fetchMessage',
      'providerMatch',
      'classifyInbound',
      'triagePolicy',
      'parse',
      'caseResolve',
    ]);
    expect(subCalls).toEqual([]);
  });
});
