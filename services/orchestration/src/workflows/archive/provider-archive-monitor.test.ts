import { beforeEach, describe, expect, it, vi } from 'vitest';

interface TestContext {
  df: {
    callActivityWithRetry: ReturnType<typeof vi.fn>;
    callSubOrchestratorWithRetry: ReturnType<typeof vi.fn>;
    createTimer: ReturnType<typeof vi.fn>;
    continueAsNew: ReturnType<typeof vi.fn>;
    currentUtcDateTime: Date;
    isReplaying: boolean;
  };
  log: ReturnType<typeof vi.fn>;
}

const orchestrations = vi.hoisted(() => new Map<string, (ctx: TestContext) => Generator>());
const activities = vi.hoisted(() => new Map<string, Record<string, unknown>>());
const timers = vi.hoisted(() => new Map<string, Record<string, unknown>>());

vi.mock('@azure/functions', () => ({
  app: { timer: (name: string, options: Record<string, unknown>) => timers.set(name, options) },
}));
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, options: Record<string, unknown>) => activities.set(name, options),
    orchestration: (name: string, handler: (ctx: TestContext) => Generator) => orchestrations.set(name, handler),
  },
  input: { durableClient: () => ({}) },
  getClient: vi.fn(),
  RetryOptions: class {
    backoffCoefficient?: number;
    maxRetryIntervalInMilliseconds?: number;
    constructor(_first: number, _attempts: number) {}
  },
}));
vi.mock('../../adapters/provider-archive-api.js', () => ({
  providerArchiveApi: { pending: vi.fn(), complete: vi.fn(), defer: vi.fn() },
}));

const mod = await import('./provider-archive-monitor.js');

function context(): TestContext {
  return {
    df: {
      callActivityWithRetry: vi.fn((name: string, _retry: unknown, input?: unknown) => ({
        kind: 'activity', name, input,
      })),
      callSubOrchestratorWithRetry: vi.fn((name: string, _retry: unknown, input?: unknown) => ({
        kind: 'sub', name, input,
      })),
      createTimer: vi.fn((date: Date) => ({ kind: 'timer', date })),
      continueAsNew: vi.fn(),
      currentUtcDateTime: new Date('2026-07-14T12:00:00Z'),
      isReplaying: false,
    },
    log: vi.fn(),
  };
}

beforeEach(() => vi.clearAllMocks());

describe('provider Archive durable monitor', () => {
  it('runs the existing folder orchestrator then asks the API for exact completion proof', () => {
    const ctx = context();
    const run = orchestrations.get('providerArchiveMonitorOrchestrator')!(ctx);
    run.next();
    let step = run.next({ rows: [{ caseId: 'case-1', generation: 2, archiveRequired: true }] });
    expect(step.value).toMatchObject({
      name: 'boxFolderCreateOrchestrator',
      input: { caseId: 'case-1' },
    });
    step = run.next({ providerRecoveryCompleted: true });
    expect(step.value).toMatchObject({
      name: 'providerArchiveOutboxComplete',
      input: { caseId: 'case-1', generation: 2 },
    });
    step = run.next({ completed: true, pending: false });
    expect(step.value).toMatchObject({ kind: 'timer' });
  });

  it('never acknowledges a failed folder ensure and leaves the generation deferred', () => {
    const ctx = context();
    const run = orchestrations.get('providerArchiveMonitorOrchestrator')!(ctx);
    run.next();
    run.next({ rows: [{ caseId: 'case-1', generation: 3, archiveRequired: true }] });
    const step = run.throw(new Error('root not pinned'));
    expect(step.value).toMatchObject({
      name: 'providerArchiveOutboxDefer',
      input: { caseId: 'case-1', generation: 3, reason: 'Archive folder ensure failed' },
    });
    expect(ctx.df.callActivityWithRetry).not.toHaveBeenCalledWith(
      'providerArchiveOutboxComplete', expect.anything(), expect.anything(),
    );
  });

  it('defers when exact API verification says completion is still pending', () => {
    const ctx = context();
    const run = orchestrations.get('providerArchiveMonitorOrchestrator')!(ctx);
    run.next();
    let step = run.next({ rows: [{ caseId: 'case-1', generation: 4, archiveRequired: false }] });
    expect(step.value).toMatchObject({ name: 'providerArchiveOutboxComplete' });
    step = run.next({ completed: false, pending: true });
    expect(step.value).toMatchObject({
      name: 'providerArchiveOutboxDefer',
      input: {
        caseId: 'case-1', generation: 4,
        reason: 'Archive completion is not yet verified',
      },
    });
  });

  it.each(['manual', 'cleared'])('still runs folder ensure after a staff hold is %s', (_state) => {
    const ctx = context();
    const run = orchestrations.get('providerArchiveMonitorOrchestrator')!(ctx);
    run.next();
    const step = run.next({
      rows: [{ caseId: 'case-1', generation: 6, archiveRequired: true }],
    });
    expect(step.value).toMatchObject({
      name: 'boxFolderCreateOrchestrator',
      input: { caseId: 'case-1' },
    });
  });

  it('registers a run-on-startup singleton bootstrap', async () => {
    expect(timers.get('provider-archive-monitor-bootstrap')).toMatchObject({
      runOnStartup: true,
      schedule: '0 0 * * * *',
    });
    expect(activities.has('providerArchiveOutboxList')).toBe(true);
    const client = { getStatus: vi.fn(async () => null), startNew: vi.fn(async () => 'id') };
    await expect(mod.ensureProviderArchiveMonitor(client as never)).resolves.toEqual({ started: true });
    expect(client.startNew).toHaveBeenCalledWith('providerArchiveMonitorOrchestrator', {
      instanceId: mod.PROVIDER_ARCHIVE_MONITOR_INSTANCE_ID,
    });
  });
});
