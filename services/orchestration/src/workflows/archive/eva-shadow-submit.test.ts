/** *
 * TKT-298 acceptance under test (consumer side): the queue starter drops with a trace
 * unless BOTH gates are on, dedups duplicate deliveries onto the deterministic
 * `eva-shadow-{caseId}` instance, admits Failed/Terminated re-drives, and the
 * orchestrator is a single evaSubmit call (never evaArchiveFolderEnsure).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { InvocationContext } from '@azure/functions';

interface QueueRegistration {
  queueName: string;
  handler: (item: unknown, ctx: InvocationContext) => Promise<void>;
}

const registrations = vi.hoisted(() => new Map<string, QueueRegistration>());
vi.mock('@azure/functions', () => ({
  app: {
    storageQueue: (name: string, options: QueueRegistration) => registrations.set(name, options),
  },
}));

const durable = vi.hoisted(() => ({
  client: {
    getStatus: vi.fn(),
    startNew: vi.fn(),
  },
  orchestrations: new Map<string, (ctx: unknown) => Generator<unknown, unknown, unknown>>(),
}));
vi.mock('durable-functions', () => ({
  input: { durableClient: () => ({}) },
  getClient: () => durable.client,
  app: {
    orchestration: (name: string, fn: (ctx: unknown) => Generator<unknown, unknown, unknown>) =>
      durable.orchestrations.set(name, fn),
  },
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public firstRetryIntervalInMilliseconds: number,
      public maxNumberOfAttempts: number,
    ) {}
  },
}));

const gateState = vi.hoisted(() => ({ shadowOn: false, evaOn: false }));
vi.mock('@cs/domain/gates', () => ({
  gates: {
    evaShadowAutosubmit: () => gateState.shadowOn,
    evaApi: () => gateState.evaOn,
  },
}));

import './eva-shadow-submit.js';

function fakeCtx(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}

const starter = () => registrations.get('eva-shadow-submit-starter')!;

beforeEach(() => {
  durable.client.getStatus.mockReset();
  durable.client.startNew.mockReset();
  gateState.shadowOn = false;
  gateState.evaOn = false;
});

describe('eva-shadow-submit-starter', () => {
  it('registers on the eva-shadow-submit queue', () => {
    expect(starter().queueName).toBe('eva-shadow-submit');
  });

  it('drops with a trace while either gate is off — queue message consumed, nothing started', async () => {
    const ctx = fakeCtx();
    gateState.shadowOn = true; // evaOn stays false
    await starter().handler({ caseId: 'case-1' }, ctx);
    expect(durable.client.startNew).not.toHaveBeenCalled();
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('dropped'));
  });

  it('starts one orchestration with the deterministic instance id when both gates are on', async () => {
    gateState.shadowOn = true;
    gateState.evaOn = true;
    durable.client.getStatus.mockRejectedValue(new Error('404 no instance'));
    await starter().handler(JSON.stringify({ caseId: 'case-42' }), fakeCtx());
    expect(durable.client.startNew).toHaveBeenCalledTimes(1);
    expect(durable.client.startNew).toHaveBeenCalledWith('evaShadowSubmitOrchestrator', {
      instanceId: 'eva-shadow-case-42',
      input: { caseId: 'case-42' },
    });
  });

  it('skips a duplicate delivery while an instance is Running/Completed', async () => {
    gateState.shadowOn = true;
    gateState.evaOn = true;
    durable.client.getStatus.mockResolvedValue({ runtimeStatus: 'Completed' });
    const ctx = fakeCtx();
    await starter().handler({ caseId: 'case-42' }, ctx);
    expect(durable.client.startNew).not.toHaveBeenCalled();
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('duplicate'));
  });

  it('admits a re-drive when the prior instance Failed', async () => {
    gateState.shadowOn = true;
    gateState.evaOn = true;
    durable.client.getStatus.mockResolvedValue({ runtimeStatus: 'Failed' });
    await starter().handler({ caseId: 'case-42' }, fakeCtx());
    expect(durable.client.startNew).toHaveBeenCalledTimes(1);
  });

  it('drops a message with no caseId', async () => {
    gateState.shadowOn = true;
    gateState.evaOn = true;
    const ctx = fakeCtx();
    await starter().handler({}, ctx);
    expect(durable.client.startNew).not.toHaveBeenCalled();
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('no caseId'));
  });
});

describe('evaShadowSubmitOrchestrator', () => {
  it('is a single evaSubmit call — never evaArchiveFolderEnsure', () => {
    const fn = durable.orchestrations.get('evaShadowSubmitOrchestrator')!;
    const calls: Array<{ activity: string; input: unknown }> = [];
    const ctx = {
      df: {
        getInput: () => ({ caseId: 'case-7' }),
        callActivityWithRetry: (activity: string, _retry: unknown, input: unknown) => {
          calls.push({ activity, input });
          return { submitted: true };
        },
      },
    };
    const gen = fn(ctx);
    let step = gen.next();
    const yielded: unknown[] = [];
    while (!step.done) {
      yielded.push(step.value);
      step = gen.next(step.value);
    }
    expect(calls).toEqual([{ activity: 'evaSubmit', input: { caseId: 'case-7' } }]);
    expect(step.value).toEqual({ caseId: 'case-7', eva: { submitted: true } });
  });
});
