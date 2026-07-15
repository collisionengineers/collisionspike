import { describe, expect, it, vi } from 'vitest';

type OrchestrationHandler = (ctx: unknown) => Generator<unknown, unknown, unknown>;
type TaskCall = { kind: 'activity' | 'sub-orchestration'; name: string; input: unknown };

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationHandler>());
vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('durable-functions', () => ({
  app: {
    orchestration: (name: string, handler: OrchestrationHandler) => orchestrations.set(name, handler),
    activity: vi.fn(),
  },
  input: { durableClient: vi.fn(() => ({})) },
  getClient: vi.fn(),
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public readonly firstRetryIntervalInMilliseconds: number,
      public readonly maxNumberOfAttempts: number,
    ) {}
  },
}));

vi.mock('../../lib/data-api.js', () => ({ dataApi: {} }));
vi.mock('../../lib/graph.js', () => ({
  findMessageByInternetMessageId: vi.fn(),
  kqlPhrase: vi.fn((value: string) => value),
  searchMessages: vi.fn(),
}));
vi.mock('../../lib/subscriptions.js', () => ({ intakeMailboxes: vi.fn(() => []) }));
vi.mock('../../lib/functions-client.js', () => ({ box: {}, callExplodeEml: vi.fn() }));
vi.mock('../../lib/blob.js', () => ({ uploadEvidenceBytes: vi.fn() }));

import { mapRetroParse } from './retro-case.js';

function nextTask(
  generator: Generator<unknown, unknown, unknown>,
  value?: unknown,
): TaskCall {
  const step = generator.next(value);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

describe('retroCaseOrchestrator Outlook provider recovery', () => {
  it('ensures the pinned Archive folder after a recovered PO and before status evaluation', () => {
    const callActivityWithRetry = vi.fn(
      (name: string, _retry: unknown, input: unknown): TaskCall => ({ kind: 'activity', name, input }),
    );
    const callSubOrchestratorWithRetry = vi.fn(
      (name: string, _retry: unknown, input: unknown): TaskCall => ({
        kind: 'sub-orchestration',
        name,
        input,
      }),
    );
    const ctx = {
      df: {
        getInput: () => ({
          trigger: {
            internetMessageId: '<trigger@example.test>',
            receivedAt: '2026-07-14T10:00:00.000Z',
          },
          category: 'case_update',
          keys: { externalRef: 'REF-123' },
        }),
        callActivityWithRetry,
        callSubOrchestratorWithRetry,
        isReplaying: false,
      },
      log: vi.fn(),
    };
    const generator = orchestrations.get('retroCaseOrchestrator')!(ctx);

    expect(nextTask(generator)).toMatchObject({ name: 'retroResolveExisting' });
    expect(nextTask(generator, { outcome: 'none' })).toMatchObject({ name: 'retroBoxLocate' });
    expect(nextTask(generator, { skipped: 'gate_off' })).toMatchObject({ name: 'retroOutlookLocate' });
    expect(nextTask(generator, {
      found: true,
      messageId: 'graph-original',
      resource: 'users/info/messages/graph-original',
      mailbox: 'intake@example.test',
      matchedKey: 'externalRef',
    })).toMatchObject({ name: 'fetchMessage' });
    expect(nextTask(generator, {
      messageId: 'graph-original',
      internetMessageId: '<original@example.test>',
      sourceMailbox: 'intake@example.test',
      subject: 'Instruction REF-123',
      body: 'Please handle reference REF-123.',
      attachments: [],
      receivedAt: '2026-07-13T09:00:00.000Z',
    })).toMatchObject({ name: 'parse' });
    expect(nextTask(generator, {
      reference: { value: 'REF-123' },
      extraction: {
        work_provider: { value: 'QDOS' },
        claimant_name: { value: 'Jane Driver' },
      },
    })).toMatchObject({
      name: 'retroCreatePersist',
      input: expect.objectContaining({ reconstructionSource: 'outlook' }),
    });
    expect(nextTask(generator, {
      outcome: 'created',
      caseId: 'case-retro',
      casePo: 'QDOS26088',
      providerRecovery: 'identity_ready',
    })).toMatchObject({ name: 'classifyPersist' });

    expect(nextTask(generator, undefined)).toEqual({
      kind: 'sub-orchestration',
      name: 'boxFolderCreateOrchestrator',
      input: { caseId: 'case-retro' },
    });
    expect(nextTask(generator, {
      folderId: 'pinned-test-folder',
      providerRecoveryCompleted: true,
    })).toEqual({
      kind: 'activity',
      name: 'statusEvaluate',
      input: { caseId: 'case-retro' },
    });

    expect(generator.next({ value: 'not_ready' })).toEqual({
      done: true,
      value: {
        outcome: 'created',
        caseId: 'case-retro',
        casePo: 'QDOS26088',
        source: 'outlook',
        providerRecovery: 'completed',
      },
    });
    expect(callSubOrchestratorWithRetry).toHaveBeenCalledTimes(1);
  });

  it('maps document/body claimant conflicts with a stable source reference', () => {
    expect(mapRetroParse(
      { extraction: { claimant_name: { value: 'Ms Document Person' } } },
      'Claimant: Mr Body Person',
      '<original@example.test>',
    ).parserEva).toMatchObject({
      claimant_name: 'Ms Document Person',
      source_reference: '<original@example.test>',
      claimant_conflicts: [{
        value: 'Mr Body Person',
        source: 'email_text',
        source_reference: '<original@example.test>',
      }],
    });
  });
});
