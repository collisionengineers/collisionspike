import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

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
  handler: (input: unknown, ctx: InvocationContext) => Promise<unknown>;
}
interface HttpRegistration {
  methods: string[];
  authLevel: string;
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<unknown>;
}

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationRegistration>());
const activities = vi.hoisted(() => new Map<string, ActivityRegistration>());
const timers = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const http = vi.hoisted(() => new Map<string, HttpRegistration>());
const durable = vi.hoisted(() => ({ getClient: vi.fn() }));
const maintenanceApi = vi.hoisted(() => ({ drain: vi.fn() }));
const classify = vi.hoisted(() => ({ sweep: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: HttpRegistration) => http.set(name, options),
    timer: (name: string, options: Record<string, unknown>) => timers.set(name, options),
  },
}));
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, options: ActivityRegistration) => activities.set(name, options),
    orchestration: (name: string, handler: OrchestrationRegistration) =>
      orchestrations.set(name, handler),
  },
  input: { durableClient: () => ({}) },
  getClient: durable.getClient,
  RetryOptions: class {
    backoffCoefficient?: number;
    maxRetryIntervalInMilliseconds?: number;
    constructor(_first: number, _attempts: number) {}
  },
}));
vi.mock('../lib/box-maintenance-api.js', () => ({
  boxMaintenanceApi: { drainFileRequests: maintenanceApi.drain },
}));
vi.mock('./box-classify-sweep.js', () => ({
  runBoxClassifySweep: classify.sweep,
}));

const mod = await import('./box-maintenance-monitor.js');

function orchestrationContext(isReplaying = false): TestContext {
  return {
    df: {
      callActivityWithRetry: vi.fn((name: string) => ({ kind: 'activity', name })),
      createTimer: vi.fn((date: Date) => ({ kind: 'timer', date })),
      continueAsNew: vi.fn(),
      currentUtcDateTime: new Date('2026-07-11T12:00:00Z'),
      isReplaying,
    },
    log: vi.fn(),
  };
}

function invocationContext(): InvocationContext {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  } as unknown as InvocationContext;
}

beforeEach(() => {
  vi.clearAllMocks();
  maintenanceApi.drain.mockResolvedValue({ processed: 2, completed: 1 });
  classify.sweep.mockResolvedValue(undefined);
});

describe('Box maintenance eternal orchestrators', () => {
  it.each([
    ['boxFileRequestOutboxMonitorOrchestrator', 'boxFileRequestOutboxDrainActivity', 60_000],
    ['boxClassificationMonitorOrchestrator', 'boxClassificationSweepActivity', 300_000],
  ])('runs %s, schedules a durable timer, and continues as new', (name, activity, interval) => {
    const ctx = orchestrationContext();
    const run = orchestrations.get(name)!(ctx);

    let step = run.next();
    expect(step.value).toMatchObject({ kind: 'activity', name: activity });
    step = run.next({ completed: true });
    expect(step.value).toMatchObject({
      kind: 'timer',
      date: new Date(ctx.df.currentUtcDateTime.getTime() + interval),
    });
    run.next();
    expect(ctx.df.continueAsNew).toHaveBeenCalledWith(undefined);
  });

  it('always reschedules after exhausted activity retries and suppresses replay logs', () => {
    const ctx = orchestrationContext(true);
    const run = orchestrations.get('boxClassificationMonitorOrchestrator')!(ctx);
    run.next();

    const step = run.throw(new Error('temporary outage'));

    expect(step.value).toMatchObject({ kind: 'timer' });
    expect(ctx.log).not.toHaveBeenCalled();
    run.next();
    expect(ctx.df.continueAsNew).toHaveBeenCalled();
  });

  it('keeps remote File Request work in the API and reuses the existing classification sweep', async () => {
    const ctx = invocationContext();
    await activities.get('boxFileRequestOutboxDrainActivity')!.handler(undefined, ctx);
    await activities.get('boxClassificationSweepActivity')!.handler(undefined, ctx);

    expect(maintenanceApi.drain).toHaveBeenCalledOnce();
    expect(classify.sweep).toHaveBeenCalledWith(ctx);
  });
});

describe('Box maintenance singleton starter and readback', () => {
  function client(initial: Record<string, string> = {}) {
    const states = new Map(Object.entries(initial));
    return {
      states,
      getStatus: vi.fn(async (instanceId: string) => {
        const runtimeStatus = states.get(instanceId);
        if (!runtimeStatus) throw Object.assign(new Error('404 not found'), { statusCode: 404 });
        return { runtimeStatus };
      }),
      startNew: vi.fn(async (_name: string, options: { instanceId: string }) => {
        states.set(options.instanceId, 'Pending');
        return options.instanceId;
      }),
    };
  }

  it('POST starts both fixed singletons once; a replayed POST and GET only read them', async () => {
    const fake = client();
    durable.getClient.mockReturnValue(fake);
    const registration = http.get('box-maintenance-monitors')!;
    const ctx = invocationContext();

    const first = await registration.handler({ method: 'POST' } as HttpRequest, ctx) as {
      status: number;
      jsonBody: { ok: boolean; monitors: Record<string, { started: boolean; instanceId: string }> };
    };
    expect(first.status).toBe(200);
    expect(first.jsonBody.ok).toBe(true);
    expect(first.jsonBody.monitors.fileRequest).toMatchObject({
      started: true,
      instanceId: mod.BOX_FILE_REQUEST_MONITOR_INSTANCE_ID,
    });
    expect(first.jsonBody.monitors.classification).toMatchObject({
      started: true,
      instanceId: mod.BOX_CLASSIFY_MONITOR_INSTANCE_ID,
    });
    expect(fake.startNew).toHaveBeenCalledTimes(2);

    const second = await registration.handler({ method: 'POST' } as HttpRequest, ctx) as {
      status: number;
      jsonBody: { monitors: Record<string, { started: boolean }> };
    };
    expect(second.status).toBe(200);
    expect(second.jsonBody.monitors.fileRequest.started).toBe(false);
    expect(second.jsonBody.monitors.classification.started).toBe(false);
    expect(fake.startNew).toHaveBeenCalledTimes(2);

    const read = await registration.handler({ method: 'GET' } as HttpRequest, ctx) as {
      status: number;
      jsonBody: { action: string; monitors: Record<string, { runtimeStatus: string }> };
    };
    expect(read.status).toBe(200);
    expect(read.jsonBody.action).toBe('read');
    expect(read.jsonBody.monitors.fileRequest.runtimeStatus).toBe('Pending');
  });

  it('restarts a failed singleton while leaving the healthy singleton alone', async () => {
    const fake = client({
      [mod.BOX_FILE_REQUEST_MONITOR_INSTANCE_ID]: 'Failed',
      [mod.BOX_CLASSIFY_MONITOR_INSTANCE_ID]: 'Running',
    });

    await expect(mod.ensureBoxFileRequestMonitor(fake as never)).resolves.toMatchObject({
      started: true,
      runtimeStatus: 'Pending',
    });
    await expect(mod.ensureBoxClassificationMonitor(fake as never)).resolves.toMatchObject({
      started: false,
      runtimeStatus: 'Running',
    });
    expect(fake.startNew).toHaveBeenCalledOnce();
  });

  it('treats a competing bootstrap winner as the same singleton', async () => {
    const fake = {
      getStatus: vi.fn()
        .mockResolvedValueOnce({ runtimeStatus: 'Failed' })
        .mockResolvedValueOnce({ runtimeStatus: 'Running' }),
      startNew: vi.fn(async () => { throw new Error('instance already exists'); }),
    };
    await expect(mod.ensureBoxFileRequestMonitor(fake as never)).resolves.toMatchObject({
      started: false,
      running: true,
      runtimeStatus: 'Running',
    });
  });

  it('registers an explicit function-key HTTP control and a non-primary startup fallback', () => {
    expect(http.get('box-maintenance-monitors')).toMatchObject({
      methods: ['GET', 'POST'],
      authLevel: 'function',
      route: 'maintenance/box-monitors',
    });
    expect(timers.get('box-maintenance-monitor-bootstrap')).toMatchObject({
      schedule: '0 0 * * * *',
      runOnStartup: true,
    });
  });
});
