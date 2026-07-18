/**
 * boxBlobPurgeOrchestrator (TKT-227) — generator-harness tests: the sequential purge loop
 * (never a Task.all fan-out — that exhausted dev-tier Postgres connections nightly), the
 * per-item salvage, and the honest {purged, failed, total} return shape (the
 * retro-related-ingest.test.ts convention).
 */
import { describe, expect, it, vi } from 'vitest';

type OrchestrationHandler = (ctx: unknown) => Generator<unknown, unknown, unknown>;
interface TaskCall {
  kind: 'activity' | 'task-all';
  name: string;
  input?: unknown;
  tasks?: TaskCall[];
}

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationHandler>());
vi.mock('@azure/functions', () => ({ app: { timer: vi.fn(), http: vi.fn() } }));
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

vi.mock('@cs/domain/gates', () => ({ gates: { boxApi: vi.fn(() => true) } }));
vi.mock('../../adapters/data-api.js', () => ({ dataApi: {} }));
vi.mock('../../platform/blob.js', () => ({ deleteEvidenceBytes: vi.fn() }));

import './box-blob-purge.js';

function makeCtx(): { ctx: unknown } {
  const ctx = {
    df: {
      getInput: () => ({}),
      callActivityWithRetry: (name: string, _retry: unknown, activityInput: unknown): TaskCall => ({
        kind: 'activity',
        name,
        input: activityInput,
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

/** Resume the generator by THROWING into the pending yield (a faulted activity). */
function throwTask(generator: Generator<unknown, unknown, unknown>, error: unknown): TaskCall {
  const step = generator.throw!(error);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

const CANDIDATES = [
  { caseId: 'case-1', blobPath: 'msg-1/a.pdf' },
  { caseId: 'case-2', blobPath: 'msg-2/b.jpg' },
  { caseId: 'case-3', blobPath: 'msg-3/c.eml' },
];

function run(): Generator<unknown, unknown, unknown> {
  const { ctx } = makeCtx();
  return orchestrations.get('boxBlobPurgeOrchestrator')!(ctx as never);
}

describe('boxBlobPurgeOrchestrator', () => {
  it('schedules boxPurgeOne strictly one at a time — never an array yield or Task.all fan-out', () => {
    const generator = run();

    expect(nextTask(generator)).toEqual({ kind: 'activity', name: 'boxPurgeList', input: {} });

    let step = generator.next(CANDIDATES);
    const yielded: TaskCall[] = [];
    while (!step.done) {
      const value = step.value as TaskCall;
      // Every single yield is ONE activity task: no arrays, no task-all wrapper object.
      expect(Array.isArray(value)).toBe(false);
      expect(value.kind).toBe('activity');
      expect(value.name).toBe('boxPurgeOne');
      yielded.push(value);
      step = generator.next({ purged: true });
    }
    expect(yielded.map((task) => task.input)).toEqual(CANDIDATES);
    expect(step.value).toEqual({ purged: 3, failed: 0, total: 3 });
  });

  it('salvages a thrown item and continues the loop with the remaining candidates', () => {
    const generator = run();

    expect(nextTask(generator)).toMatchObject({ name: 'boxPurgeList' });
    expect(nextTask(generator, CANDIDATES)).toMatchObject({
      name: 'boxPurgeOne',
      input: CANDIDATES[0],
    });
    // Item 1 faults (all retries exhausted) → salvaged; item 2 is still scheduled.
    expect(throwTask(generator, new Error('remaining connection slots are reserved'))).toMatchObject({
      name: 'boxPurgeOne',
      input: CANDIDATES[1],
    });
    expect(nextTask(generator, { purged: true })).toMatchObject({
      name: 'boxPurgeOne',
      input: CANDIDATES[2],
    });
    expect(generator.next({ purged: true })).toEqual({
      done: true,
      value: { purged: 2, failed: 1, total: 3 },
    });
  });

  it('returns the honest zero shape when the candidate list is empty', () => {
    const generator = run();
    expect(nextTask(generator)).toMatchObject({ name: 'boxPurgeList' });
    expect(generator.next([])).toEqual({
      done: true,
      value: { purged: 0, failed: 0, total: 0 },
    });
  });
});
