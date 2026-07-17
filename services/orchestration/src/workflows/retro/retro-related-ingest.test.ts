/**
 * retroRelatedIngestOrchestrator (TKT-225) — generator-harness tests: the per-row
 * fetch→parse→evidence→fields chain, per-row salvage, the contradiction guard, and the
 * empty-parse noop (the retro-case-provider-recovery.test.ts convention).
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

import './retro-related-ingest.js';

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

function nextTask(
  generator: Generator<unknown, unknown, unknown>,
  value?: unknown,
): TaskCall {
  const step = generator.next(value);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

/** Resume the generator by THROWING into the pending yield (a faulted activity). */
function throwTask(
  generator: Generator<unknown, unknown, unknown>,
  error: unknown,
): TaskCall {
  const step = generator.throw!(error);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

const ROW_1 = {
  internetMessageId: '<rel-1@example.test>',
  messageId: 'graph-rel-1',
  resource: 'users/intake@example.test/messages/graph-rel-1',
  mailbox: 'intake@example.test',
  receivedAt: '2026-07-01T09:00:00.000Z',
};
const ROW_2 = {
  internetMessageId: '<rel-2@example.test>',
  messageId: 'graph-rel-2',
  resource: 'users/intake@example.test/messages/graph-rel-2',
  mailbox: 'intake@example.test',
  receivedAt: '2026-07-02T09:00:00.000Z',
};

const INPUT = {
  caseId: 'case-retro',
  rows: [ROW_1, ROW_2],
  keys: { externalRef: 'REF-123', vrm: 'KA08XTR' },
  caseVrm: 'KA08XTR',
  workProviderId: 'wp-qdos',
  providerPrincipal: 'QDOS',
};

const ENV_1 = {
  messageId: 'graph-rel-1',
  internetMessageId: '<rel-1@example.test>',
  sourceMailbox: 'intake@example.test',
  subject: 'RE: REF-123',
  body: 'Please see the attached update.',
  candidateVrm: '',
  receivedAt: '2026-07-01T09:00:00.000Z',
  attachments: [
    { filename: 'update.pdf', contentType: 'application/pdf', blobPath: 'graph-rel-1/update.pdf', size: 100 },
  ],
};
const ENV_2 = {
  messageId: 'graph-rel-2',
  internetMessageId: '<rel-2@example.test>',
  sourceMailbox: 'intake@example.test',
  subject: 'RE: REF-123 chaser',
  body: 'Any update?',
  candidateVrm: '',
  receivedAt: '2026-07-02T09:00:00.000Z',
  attachments: [],
};

function run(input: unknown): Generator<unknown, unknown, unknown> {
  const { ctx } = makeCtx(input);
  return orchestrations.get('retroRelatedIngestOrchestrator')!(ctx as never);
}

describe('retroRelatedIngestOrchestrator', () => {
  it('happy path: fetch → parse → classifyPersist (no body-instruction fallback) → extractImages → backfill per row, then ONE statusEvaluate', () => {
    const generator = run(INPUT);

    // Row 1 — the fetchMessage resource form retroLinkRelated produced.
    expect(nextTask(generator)).toEqual({
      kind: 'activity',
      name: 'fetchMessage',
      input: { messageId: 'graph-rel-1', resource: ROW_1.resource },
    });
    expect(nextTask(generator, ENV_1)).toMatchObject({
      name: 'parse',
      input: {
        messageId: 'graph-rel-1',
        attachments: ENV_1.attachments,
        providerHint: 'QDOS',
      },
    });
    // D6 — evidence persists WITHOUT the body-instruction fallback (a chaser body must
    // not become an instruction row) and WITH the case VRM + provider (AI opt-out).
    expect(nextTask(generator, {
      reference: { value: 'REF-123' },
      extraction: { mileage: { value: '12,345' } },
    })).toMatchObject({
      name: 'classifyPersist',
      input: expect.objectContaining({
        caseId: 'case-retro',
        inbound: ENV_1,
        caseVrm: 'KA08XTR',
        workProviderId: 'wp-qdos',
        bodyInstructionFallback: false,
      }),
    });
    expect(nextTask(generator, { persisted: 2 })).toMatchObject({
      name: 'extractImages',
      input: expect.objectContaining({
        caseId: 'case-retro',
        messageId: 'graph-rel-1',
        caseVrm: 'KA08XTR',
        workProviderId: 'wp-qdos',
        providerPrincipal: 'QDOS',
      }),
    });
    // The parse agreed with the keys → fields offered to the fill-gaps route.
    expect(nextTask(generator, { extracted: 0, registrationVisible: false })).toMatchObject({
      name: 'retroBackfillFields',
      input: expect.objectContaining({
        caseId: 'case-retro',
        sourceInternetMessageId: '<rel-1@example.test>',
        parserRef: 'REF-123',
        parserMileage: '12,345',
        parserEva: expect.objectContaining({ source_reference: '<rel-1@example.test>' }),
      }),
    });

    // Row 2 — attachment-less chaser: parse still runs (empty input), yields nothing,
    // so evidence persists and the backfill is SKIPPED (straight to the next step).
    expect(nextTask(generator, { outcome: 'applied', vrmFilled: false })).toMatchObject({
      name: 'fetchMessage',
      input: { messageId: 'graph-rel-2', resource: ROW_2.resource },
    });
    expect(nextTask(generator, ENV_2)).toMatchObject({ name: 'parse' });
    expect(nextTask(generator, {})).toMatchObject({
      name: 'classifyPersist',
      input: expect.objectContaining({ bodyInstructionFallback: false }),
    });
    expect(nextTask(generator, { persisted: 1 })).toMatchObject({ name: 'extractImages' });

    // One status re-alignment for the whole batch.
    expect(nextTask(generator, { extracted: 0, registrationVisible: false })).toMatchObject({
      name: 'statusEvaluate',
      input: { caseId: 'case-retro' },
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: { processed: 2, failed: 0, fieldsApplied: 1 },
    });
  });

  it('salvage: a faulted first row never sinks the batch — the second row is fully processed', () => {
    const generator = run(INPUT);

    expect(nextTask(generator)).toMatchObject({ name: 'fetchMessage' });
    // Row 1's fetch faults (all retries exhausted) → salvaged, row 2 proceeds.
    expect(throwTask(generator, new Error('graph 404'))).toMatchObject({
      name: 'fetchMessage',
      input: { messageId: 'graph-rel-2', resource: ROW_2.resource },
    });
    nextTask(generator, ENV_2); // parse
    nextTask(generator, {}); // classifyPersist
    nextTask(generator, { persisted: 1 }); // extractImages
    expect(nextTask(generator, { extracted: 0, registrationVisible: false })).toMatchObject({
      name: 'statusEvaluate',
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: { processed: 1, failed: 1, fieldsApplied: 0 },
    });
  });

  it('contradiction: parsed ref AND VRM both disagree with the keys → no field application, evidence chain still runs', () => {
    const generator = run({ ...INPUT, rows: [ROW_1] });

    nextTask(generator); // fetchMessage
    nextTask(generator, ENV_1); // parse
    // Both the parsed reference and the parsed VRM name a DIFFERENT matter.
    expect(nextTask(generator, {
      vrm: { value: 'BD51SMR' },
      reference: { value: 'ZZZ-999' },
      extraction: {},
    })).toMatchObject({
      name: 'classifyPersist',
      input: expect.objectContaining({ bodyInstructionFallback: false }),
    });
    expect(nextTask(generator, { persisted: 2 })).toMatchObject({ name: 'extractImages' });
    // retroBackfillFields is NOT scheduled — straight to the batch statusEvaluate.
    expect(nextTask(generator, { extracted: 0, registrationVisible: false })).toMatchObject({
      name: 'statusEvaluate',
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: { processed: 1, failed: 0, fieldsApplied: 0 },
    });
  });

  it('empty parse: evidence persists, the backfill is skipped entirely', () => {
    const generator = run({ ...INPUT, rows: [ROW_2] });

    nextTask(generator); // fetchMessage
    expect(nextTask(generator, ENV_2)).toMatchObject({
      name: 'parse',
      input: expect.objectContaining({ attachments: [] }),
    });
    nextTask(generator, {}); // classifyPersist
    expect(nextTask(generator, { persisted: 1 })).toMatchObject({ name: 'extractImages' });
    expect(nextTask(generator, { extracted: 0, registrationVisible: false })).toMatchObject({
      name: 'statusEvaluate',
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: { processed: 1, failed: 0, fieldsApplied: 0 },
    });
  });
});
