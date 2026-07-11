import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestContext {
  df: {
    callActivityWithRetry: ReturnType<typeof vi.fn>;
    createTimer: ReturnType<typeof vi.fn>;
    continueAsNew: ReturnType<typeof vi.fn>;
    currentUtcDateTime: Date;
    isReplaying: boolean;
  };
  log: ReturnType<typeof vi.fn>;
}

interface OrchestrationRegistration {
  (ctx: TestContext): Generator<unknown, void, unknown>;
}
interface ActivityRegistration {
  handler: (input: unknown, ctx: { log: ReturnType<typeof vi.fn> }) => Promise<unknown>;
}
interface HttpRegistration {
  handler: (
    req: { method: string },
    ctx: { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn>; error: ReturnType<typeof vi.fn> },
  ) => Promise<{ status?: number; jsonBody?: unknown }>;
}

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationRegistration>());
const activities = vi.hoisted(() => new Map<string, ActivityRegistration>());
const timers = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const httpRegistrations = vi.hoisted(() => new Map<string, HttpRegistration>());
const getClient = vi.hoisted(() => vi.fn());

vi.mock('@azure/functions', () => ({
  app: {
    timer: (name: string, options: Record<string, unknown>) => timers.set(name, options),
    http: (name: string, options: HttpRegistration) => httpRegistrations.set(name, options),
  },
}));
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, options: ActivityRegistration) => activities.set(name, options),
    orchestration: (name: string, handler: OrchestrationRegistration) => orchestrations.set(name, handler),
  },
  input: { durableClient: () => ({}) },
  getClient,
  RetryOptions: class {
    backoffCoefficient?: number;
    maxRetryIntervalInMilliseconds?: number;
    constructor(_firstRetryMs: number, _maxAttempts: number) {}
  },
}));

const drain = vi.hoisted(() => vi.fn(async () => ({ published: 2, failed: 0 })));
vi.mock('../lib/data-api.js', () => ({
  dataApi: { drainEvidenceBackfillRequests: drain },
}));

const mod = await import('./evidence-backfill-publisher-monitor.js');

function context(): TestContext {
  return {
    df: {
      callActivityWithRetry: vi.fn((name: string) => ({ kind: 'activity', name })),
      createTimer: vi.fn((date: Date) => ({ kind: 'timer', date })),
      continueAsNew: vi.fn(),
      currentUtcDateTime: new Date('2026-07-11T12:00:00Z'),
      isReplaying: false,
    },
    log: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('evidence backfill publisher durable monitor', () => {
  it('drains through the API-owned publisher seam', async () => {
    const ctx = { log: vi.fn() };
    await expect(
      activities.get('evidenceBackfillPublisherDrain')!.handler(undefined, ctx),
    ).resolves.toEqual({ published: 2, failed: 0 });
    expect(drain).toHaveBeenCalledTimes(1);
    expect(ctx.log).toHaveBeenCalledWith(expect.stringContaining('"published":2'));
  });

  it('uses a durable timer and continue-as-new so pending work is retried after restart', () => {
    const first = context();
    const firstRun = orchestrations.get('evidenceBackfillPublisherMonitorOrchestrator')!(first);
    expect(firstRun.next().value).toMatchObject({ name: 'evidenceBackfillPublisherDrain' });
    expect(firstRun.next({ published: 0, failed: 1 }).value).toMatchObject({ kind: 'timer' });
    firstRun.next();
    expect(first.df.continueAsNew).toHaveBeenCalledWith(undefined);

    // A new generator is the next continue-as-new execution (and also models host
    // process restart/replay): the DB outbox drain is requested again, not forgotten.
    const restarted = context();
    const restartedRun = orchestrations.get('evidenceBackfillPublisherMonitorOrchestrator')!(restarted);
    expect(restartedRun.next().value).toMatchObject({ name: 'evidenceBackfillPublisherDrain' });
  });

  it('survives exhausted activity retries and still schedules the next durable wake', () => {
    const ctx = context();
    const run = orchestrations.get('evidenceBackfillPublisherMonitorOrchestrator')!(ctx);
    run.next();
    expect(run.throw(new Error('API unavailable')).value).toMatchObject({ kind: 'timer' });
    run.next();
    expect(ctx.df.continueAsNew).toHaveBeenCalledWith(undefined);
  });

  it('keeps a live singleton and restarts a failed fixed instance', async () => {
    const running = {
      getStatus: vi.fn(async () => ({ runtimeStatus: 'Running' })),
      startNew: vi.fn(),
    };
    await expect(mod.ensureEvidenceBackfillPublisherMonitor(running as never)).resolves.toEqual({
      started: false,
      status: 'Running',
    });
    expect(running.startNew).not.toHaveBeenCalled();

    const failed = {
      getStatus: vi.fn(async () => ({ runtimeStatus: 'Failed' })),
      startNew: vi.fn(async () => 'new-instance'),
    };
    await expect(mod.ensureEvidenceBackfillPublisherMonitor(failed as never)).resolves.toEqual({
      started: true,
    });
    expect(failed.startNew).toHaveBeenCalledWith(
      'evidenceBackfillPublisherMonitorOrchestrator',
      { instanceId: mod.EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID },
    );
  });

  it('registers a run-on-startup singleton bootstrap', () => {
    expect(timers.get('evidence-backfill-publisher-monitor-bootstrap')).toMatchObject({
      runOnStartup: true,
      schedule: '0 0 * * * *',
    });
    expect(activities.has('evidenceBackfillPublisherDrain')).toBe(true);
  });

  it('exposes an explicit post-deploy ensure/readback seam', async () => {
    const client = {
      getStatus: vi.fn(async () => { throw new Error('404 not found'); }),
      startNew: vi.fn(async () => 'instance'),
    };
    getClient.mockReturnValue(client);
    const ctx = { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const response = await httpRegistrations
      .get('evidence-backfill-publisher-monitor')!
      .handler({ method: 'POST' }, ctx);

    expect(response).toMatchObject({
      status: 200,
      jsonBody: {
        ok: true,
        action: 'ensure',
        monitor: {
          instanceId: mod.EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID,
          runtimeStatus: 'Pending',
          running: true,
          started: true,
        },
      },
    });
    expect(client.startNew).toHaveBeenCalledWith(
      'evidenceBackfillPublisherMonitorOrchestrator',
      { instanceId: mod.EVIDENCE_BACKFILL_PUBLISHER_MONITOR_INSTANCE_ID },
    );
  });
});
