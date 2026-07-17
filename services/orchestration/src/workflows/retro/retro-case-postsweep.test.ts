/**
 * retro-case-postsweep.test.ts — TKT-230 orchestrator behaviour (generator harness, the
 * retro-case-provider-recovery.test.ts convention):
 *
 *  - item 6: the rung-1 linked lane schedules the checkpointed `retroCaseFolderWritable`
 *    probe after statusEvaluate and calls `boxArchiveEvidence` ONLY on writable:true; a
 *    probe/mirror fault stays non-blocking (the link outcome is unchanged).
 *  - item 7: the two eligibility early-returns record the visible failure
 *    (`retroRecordFailure`) ONLY when the persisted classification is receiving_work, and
 *    the stamp can never alter the returned outcome.
 */
import { describe, expect, it, vi } from 'vitest';

type OrchestrationHandler = (ctx: unknown) => Generator<unknown, unknown, unknown>;
interface TaskCall {
  kind: 'activity' | 'sub-orchestration' | 'task-all';
  name: string;
  input?: unknown;
  tasks?: TaskCall[];
}

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

vi.mock('../../adapters/data-api.js', () => ({ dataApi: {} }));
vi.mock('../../adapters/graph.js', () => ({
  findMessageByInternetMessageId: vi.fn(),
  kqlPhrase: vi.fn((value: string) => value),
  searchMessages: vi.fn(),
}));
vi.mock('../../platform/subscriptions.js', () => ({ intakeMailboxes: vi.fn(() => []) }));
vi.mock('../../adapters/functions-client.js', () => ({ box: {}, callExplodeEml: vi.fn() }));
vi.mock('../../platform/blob.js', () => ({ uploadEvidenceBytes: vi.fn() }));

import './retro-case.js';

function makeCtx(input: unknown): { ctx: unknown } {
  const ctx = {
    df: {
      getInput: () => input,
      callActivityWithRetry: (name: string, _retry: unknown, activityInput: unknown): TaskCall => ({
        kind: 'activity',
        name,
        input: activityInput,
      }),
      callSubOrchestratorWithRetry: (name: string, _retry: unknown, subInput: unknown): TaskCall => ({
        kind: 'sub-orchestration',
        name,
        input: subInput,
      }),
      Task: { all: (tasks: TaskCall[]): TaskCall => ({ kind: 'task-all', name: 'Task.all', tasks }) },
      isReplaying: false,
    },
    log: vi.fn(),
  };
  return { ctx };
}

function nextTask(generator: Generator<unknown, unknown, unknown>, value?: unknown): TaskCall {
  const step = generator.next(value);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

function run(input: unknown): Generator<unknown, unknown, unknown> {
  const { ctx } = makeCtx(input);
  return orchestrations.get('retroCaseOrchestrator')!(ctx as never);
}

const LINK_INPUT = {
  trigger: {
    internetMessageId: '<trigger@example.test>',
    messageId: 'graph-trigger',
    receivedAt: '2026-07-16T10:00:00.000Z',
    attachments: [
      { filename: 'update.pdf', contentType: 'application/pdf', blobPath: 'graph-trigger/update.pdf', size: 9 },
    ],
  },
  category: 'case_update',
  keys: { externalRef: 'REF-123', vrm: 'KA08XTR' },
  providerId: 'wp-qdos',
  providerPrincipal: 'QDOS',
};

/** Walk the rung-1 record-keeping chain up to (and including) statusEvaluate. */
function walkToStatusEvaluate(generator: Generator<unknown, unknown, unknown>): void {
  expect(nextTask(generator)).toMatchObject({ name: 'retroResolveExisting' });
  expect(nextTask(generator, { outcome: 'linked', caseId: 'case-1' })).toMatchObject({
    name: 'classifyPersist',
    input: expect.objectContaining({ caseId: 'case-1', caseVrm: 'KA08XTR', workProviderId: 'wp-qdos' }),
  });
  expect(nextTask(generator, undefined)).toMatchObject({ name: 'extractImages' });
  expect(nextTask(generator, undefined)).toMatchObject({
    name: 'statusEvaluate',
    input: { caseId: 'case-1' },
  });
}

describe('TKT-230 item 6 — rung-1 writable-folder mirror', () => {
  it('schedules the checkpointed probe after statusEvaluate and mirrors ONLY on writable:true', () => {
    const generator = run(LINK_INPUT);
    walkToStatusEvaluate(generator);
    expect(nextTask(generator, undefined)).toEqual({
      kind: 'activity',
      name: 'retroCaseFolderWritable',
      input: { caseId: 'case-1' },
    });
    expect(nextTask(generator, { writable: true })).toMatchObject({
      name: 'boxArchiveEvidence',
      input: { caseId: 'case-1' },
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: { outcome: 'linked', caseId: 'case-1' },
    });
  });

  it('does NOT mirror when the probe answers writable:false (read-only archive folder)', () => {
    const generator = run(LINK_INPUT);
    walkToStatusEvaluate(generator);
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'retroCaseFolderWritable' });
    // The probe said no — the NEXT step is the terminal return, never boxArchiveEvidence.
    expect(generator.next({ writable: false, reason: 'readonly_archive_root' })).toEqual({
      done: true,
      value: { outcome: 'linked', caseId: 'case-1' },
    });
  });

  it('a faulted probe is salvaged by the surrounding best-effort try — the link outcome is unchanged', () => {
    const generator = run(LINK_INPUT);
    walkToStatusEvaluate(generator);
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'retroCaseFolderWritable' });
    expect(generator.throw!(new Error('probe retries exhausted'))).toEqual({
      done: true,
      value: { outcome: 'linked', caseId: 'case-1' },
    });
  });

  it('a faulted mirror upload is salvaged too (no new step can unwind a linked case)', () => {
    const generator = run(LINK_INPUT);
    walkToStatusEvaluate(generator);
    nextTask(generator, undefined); // retroCaseFolderWritable
    expect(nextTask(generator, { writable: true })).toMatchObject({ name: 'boxArchiveEvidence' });
    expect(generator.throw!(new Error('upload failed'))).toEqual({
      done: true,
      value: { outcome: 'linked', caseId: 'case-1' },
    });
  });

  it('an attachment-less trigger keeps the pre-existing shape (no chain, no probe)', () => {
    const generator = run({ ...LINK_INPUT, trigger: { internetMessageId: '<t@x>' } });
    expect(nextTask(generator)).toMatchObject({ name: 'retroResolveExisting' });
    expect(generator.next({ outcome: 'linked', caseId: 'case-1' })).toEqual({
      done: true,
      value: { outcome: 'linked', caseId: 'case-1' },
    });
  });
});

describe('TKT-230 item 7 — receiving_work eligibility returns get the visible failure record', () => {
  const DRAIN_INPUT = { internetMessageId: '<drain@example.test>', mailbox: 'info@example.test' };
  const FETCHED = {
    messageId: 'graph-drain',
    internetMessageId: '<drain@example.test>',
    sourceMailbox: 'info@example.test',
    subject: 'New instruction',
    body: 'Please inspect the vehicle.',
    candidateVrm: '',
    candidateRef: '',
    attachments: [],
    receivedAt: '2026-07-01T09:00:00.000Z',
  };

  /** Drain-path walk to the classify step. */
  function walkToClassify(generator: Generator<unknown, unknown, unknown>): void {
    expect(nextTask(generator)).toMatchObject({ name: 'retroFindTrigger' });
    expect(nextTask(generator, {
      found: true,
      messageId: 'graph-drain',
      resource: 'users/info@example.test/messages/graph-drain',
    })).toMatchObject({ name: 'fetchMessage' });
    expect(nextTask(generator, FETCHED)).toMatchObject({ name: 'providerMatch' });
    expect(nextTask(generator, { outcome: 'unmatched' })).toMatchObject({ name: 'classifyInbound' });
  }

  it('not_eligible + receiving_work → retroRecordFailure scheduled (best-effort) and the outcome unchanged', () => {
    const generator = run(DRAIN_INPUT);
    walkToClassify(generator);
    const stamp = nextTask(generator, {
      category: 'receiving_work',
      subtype: 'existing_provider_instruction',
      bodyCaseref: '',
      bodyJobref: '',
      bodyVrm: '',
      isReply: false,
    });
    expect(stamp).toMatchObject({
      name: 'retroRecordFailure',
      input: expect.objectContaining({
        trigger: FETCHED,
        keys: {},
        triggerCategory: 'receiving_work',
        rungsTried: ['eligibility'],
      }),
    });
    expect(generator.next({ recorded: true })).toEqual({
      done: true,
      value: {
        outcome: 'not_eligible',
        reasons: ['category_not_eligible:receiving_work'],
      },
    });
  });

  it('a failed stamp NEVER alters the not_eligible outcome', () => {
    const generator = run(DRAIN_INPUT);
    walkToClassify(generator);
    expect(nextTask(generator, {
      category: 'receiving_work',
      subtype: 'existing_provider_instruction',
      bodyCaseref: '',
      bodyJobref: '',
      bodyVrm: '',
      isReply: false,
    })).toMatchObject({ name: 'retroRecordFailure' });
    expect(generator.throw!(new Error('stamp retries exhausted'))).toEqual({
      done: true,
      value: {
        outcome: 'not_eligible',
        reasons: ['category_not_eligible:receiving_work'],
      },
    });
  });

  it('a NON-receiving_work ineligible category returns not_eligible with NO failure record', () => {
    const generator = run(DRAIN_INPUT);
    walkToClassify(generator);
    // case-summary digests are excluded and must stay silent (not an instruction).
    expect(generator.next({
      category: 'non_actionable',
      subtype: 'case_summary',
      bodyCaseref: '',
      bodyJobref: '',
      bodyVrm: '',
      isReply: false,
    })).toEqual({
      done: true,
      value: {
        outcome: 'not_eligible',
        reasons: ['category_not_eligible:non_actionable'],
      },
    });
  });

  it('the keyless (no_usable_key) return records the failure ONLY for receiving_work', () => {
    // Sub-orchestrator form: a caller-supplied receiving_work trigger with NO usable key.
    const generator = run({
      trigger: { internetMessageId: '<t@x>', attachments: [] },
      category: 'receiving_work',
      keys: {},
    });
    expect(nextTask(generator)).toMatchObject({
      name: 'retroRecordFailure',
      input: expect.objectContaining({
        keys: {},
        triggerCategory: 'receiving_work',
        rungsTried: ['eligibility'],
      }),
    });
    expect(generator.next({ recorded: true })).toEqual({
      done: true,
      value: { outcome: 'not_eligible', reasons: ['no_usable_key'] },
    });

    // ...and a keyless case_update stays exactly as before (silent not_eligible).
    const silent = run({
      trigger: { internetMessageId: '<t@x>', attachments: [] },
      category: 'case_update',
      keys: {},
    });
    expect(silent.next()).toEqual({
      done: true,
      value: { outcome: 'not_eligible', reasons: ['no_usable_key'] },
    });
  });
});
