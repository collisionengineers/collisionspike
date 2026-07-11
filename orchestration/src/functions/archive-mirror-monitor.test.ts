import { beforeEach, describe, expect, it, vi } from 'vitest';

interface OrchestrationReg {
  (ctx: TestContext): Generator<unknown, void, unknown>;
}
interface ActivityReg {
  handler: (input: never, ctx: never) => Promise<unknown>;
}

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationReg>());
const activities = vi.hoisted(() => new Map<string, ActivityReg>());
const timers = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('@azure/functions', () => ({
  app: {
    timer: (name: string, options: Record<string, unknown>) => timers.set(name, options),
  },
}));
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, options: ActivityReg) => activities.set(name, options),
    orchestration: (name: string, handler: OrchestrationReg) => orchestrations.set(name, handler),
  },
  input: { durableClient: () => ({}) },
  getClient: vi.fn(),
  RetryOptions: class {
    backoffCoefficient?: number;
    maxRetryIntervalInMilliseconds?: number;
    constructor(_first: number, _attempts: number) {}
  },
}));
vi.mock('../lib/archive-mirror-api.js', () => ({
  archiveMirrorApi: { pending: vi.fn(), complete: vi.fn() },
}));

interface ActivityYield {
  kind: 'activity';
  name: string;
  input?: unknown;
}
interface TimerYield { kind: 'timer'; date: Date }
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

const mod = await import('./archive-mirror-monitor.js');

function context(): TestContext {
  return {
    df: {
      callActivityWithRetry: vi.fn((name: string, _retry: unknown, input?: unknown) => ({
        kind: 'activity', name, input,
      } satisfies ActivityYield)),
      createTimer: vi.fn((date: Date) => ({ kind: 'timer', date } satisfies TimerYield)),
      continueAsNew: vi.fn(),
      currentUtcDateTime: new Date('2026-07-11T12:00:00Z'),
      isReplaying: false,
    },
    log: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('archive mirror durable monitor', () => {
  it('groups eligible rows by case and acknowledges each exact generation after a full pass', () => {
    const ctx = context();
    const run = orchestrations.get('archiveMirrorMonitorOrchestrator')!(ctx);
    let step = run.next();
    expect(step.value).toMatchObject({ name: 'archiveMirrorOutboxList' });

    step = run.next({ rows: [
      { evidenceId: 'ev-1', caseId: 'case-1', generation: 3, mirrorEligible: true },
      { evidenceId: 'ev-2', caseId: 'case-1', generation: 7, mirrorEligible: true },
    ] });
    expect(step.value).toMatchObject({ name: 'boxArchiveEvidence', input: { caseId: 'case-1' } });

    step = run.next({ uploaded: 2, total: 2 });
    expect(step.value).toMatchObject({
      name: 'archiveMirrorOutboxComplete',
      input: { evidenceId: 'ev-1', generation: 3 },
    });
    step = run.next({ completed: true, pending: false });
    expect(step.value).toMatchObject({
      name: 'archiveMirrorOutboxComplete',
      input: { evidenceId: 'ev-2', generation: 7 },
    });
    step = run.next({ completed: true, pending: false });
    expect(step.value).toMatchObject({ kind: 'timer' });
    run.next();
    expect(ctx.df.continueAsNew).toHaveBeenCalledWith(undefined);
    expect(ctx.df.callActivityWithRetry.mock.calls.filter(([name]) => name === 'boxArchiveEvidence')).toHaveLength(1);
  });

  it.each([
    ['partial', { uploaded: 1, total: 2 }],
    ['gated', { uploaded: 0, total: 0, skipped: 'gated_off' }],
    ['no folder', { uploaded: 0, total: 0, skipped: 'no_folder' }],
  ])('keeps rows pending after a %s archive pass', (_label, result) => {
    const ctx = context();
    const run = orchestrations.get('archiveMirrorMonitorOrchestrator')!(ctx);
    run.next();
    let step = run.next({ rows: [
      { evidenceId: 'ev-1', caseId: 'case-1', generation: 1, mirrorEligible: true },
    ] });
    expect(step.value).toMatchObject({ name: 'boxArchiveEvidence' });
    step = run.next(result);
    expect(step.value).toMatchObject({ kind: 'timer' });
    expect(ctx.df.callActivityWithRetry).not.toHaveBeenCalledWith(
      'archiveMirrorOutboxComplete', expect.anything(), expect.anything(),
    );
  });

  it('sends an already-ineligible row directly to exact-row verification', () => {
    const ctx = context();
    const run = orchestrations.get('archiveMirrorMonitorOrchestrator')!(ctx);
    run.next();
    const step = run.next({ rows: [
      { evidenceId: 'ev-1', caseId: 'case-1', generation: 2, mirrorEligible: false },
    ] });
    expect(step.value).toMatchObject({
      name: 'archiveMirrorOutboxComplete',
      input: { evidenceId: 'ev-1', generation: 2 },
    });
  });

  it('always schedules a durable retry when listing exhausts its retries', () => {
    const ctx = context();
    const run = orchestrations.get('archiveMirrorMonitorOrchestrator')!(ctx);
    run.next();
    const step = run.throw(new Error('data API unavailable'));
    expect(step.value).toMatchObject({ kind: 'timer' });
    run.next();
    expect(ctx.df.continueAsNew).toHaveBeenCalled();
  });

  it('starts one fixed singleton and leaves a running instance alone', async () => {
    const running = {
      getStatus: vi.fn(async () => ({ runtimeStatus: 'Running' })),
      startNew: vi.fn(),
    };
    await expect(mod.ensureArchiveMirrorMonitor(running as never)).resolves.toEqual({
      started: false,
      status: 'Running',
    });
    expect(running.startNew).not.toHaveBeenCalled();

    const missing = {
      getStatus: vi.fn(async () => { throw new Error('404'); }),
      startNew: vi.fn(async () => 'instance'),
    };
    await expect(mod.ensureArchiveMirrorMonitor(missing as never)).resolves.toEqual({ started: true });
    expect(missing.startNew).toHaveBeenCalledWith('archiveMirrorMonitorOrchestrator', {
      instanceId: mod.ARCHIVE_MIRROR_MONITOR_INSTANCE_ID,
    });
  });

  it('registers a run-on-startup bootstrap in addition to intake self-healing', () => {
    expect(timers.get('archive-mirror-monitor-bootstrap')).toMatchObject({
      runOnStartup: true,
      schedule: '0 0 * * * *',
    });
    expect(activities.has('archiveMirrorOutboxList')).toBe(true);
    expect(activities.has('archiveMirrorOutboxComplete')).toBe(true);
  });
});

describe('archive mirror monitor helpers', () => {
  it('preserves multiple generations in one case group', () => {
    const grouped = mod.groupPendingArchiveMirrors([
      { evidenceId: 'a', caseId: 'case-1', generation: 1, mirrorEligible: true },
      { evidenceId: 'b', caseId: 'case-1', generation: 2, mirrorEligible: true },
    ]);
    expect(grouped.get('case-1')?.map((row) => row.generation)).toEqual([1, 2]);
  });

  it('requires no skip and a complete aggregate before exact-row verification', () => {
    expect(mod.canVerifyArchivePass({ uploaded: 1, total: 1 })).toBe(true);
    expect(mod.canVerifyArchivePass({ uploaded: 0, total: 0 })).toBe(true);
    expect(mod.canVerifyArchivePass({ uploaded: 0, total: 1 })).toBe(false);
    expect(mod.canVerifyArchivePass({ uploaded: 0, total: 0, skipped: 'no_folder' })).toBe(false);
  });
});
