/**
 * retro-case-force-restart.test.ts — PR-review fix (CHANGE 10): the keyed manual starter's
 * force=true is SCOPED to prior runs whose recorded outcome is in the FAILURE family. A
 * Completed instance that created or linked a case is finished business — force returns
 * the prior outcome instead of re-driving it. Failed/Terminated stay restartable as today.
 *
 * The HTTP handler is captured from the mocked @azure/functions registry and driven
 * directly (no Functions host); the durable client is the mock seam.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, InvocationContext } from '@azure/functions';

type HttpHandler = (req: HttpRequest, ctx: InvocationContext) => Promise<{
  status?: number;
  jsonBody?: Record<string, unknown>;
}>;
const httpHandlers = vi.hoisted(() => new Map<string, HttpHandler>());
const client = vi.hoisted(() => ({
  getStatus: vi.fn(),
  startNew: vi.fn(),
  createCheckStatusResponse: vi.fn(() => ({ status: 202, jsonBody: { accepted: true } })),
}));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, opts: { handler: HttpHandler }) => httpHandlers.set(name, opts.handler),
  },
}));
vi.mock('durable-functions', () => ({
  app: { orchestration: vi.fn(), activity: vi.fn() },
  input: { durableClient: vi.fn(() => ({})) },
  getClient: vi.fn(() => client),
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public readonly firstRetryIntervalInMilliseconds: number,
      public readonly maxNumberOfAttempts: number,
    ) {}
  },
}));

const gates = vi.hoisted(() => ({ retroCase: vi.fn(() => true) }));
vi.mock('@cs/domain/gates', () => ({ gates }));
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

const handler = () => httpHandlers.get('retro-case-start')!;
const ctx = { log: vi.fn() } as unknown as InvocationContext;
const req = (body: Record<string, unknown>): HttpRequest =>
  ({ json: async () => body } as unknown as HttpRequest);

// instanceId derivation: '<x@y>' strips to 'xy' → 'retro-xy'.
const BODY = { internetMessageId: '<x@y>', mailbox: 'info@ce.test' };

beforeEach(() => {
  vi.clearAllMocks();
  gates.retroCase.mockReturnValue(true);
  client.createCheckStatusResponse.mockReturnValue({ status: 202, jsonBody: { accepted: true } });
});

describe('retro-case-start — force restart scoping (PR-review CHANGE 10)', () => {
  it("REFUSES force on a Completed run whose outcome LINKED a case — the prior outcome is returned, no re-drive", async () => {
    client.getStatus.mockResolvedValue({
      runtimeStatus: 'Completed',
      output: { outcome: 'linked', caseId: 'case-1' },
    });
    const res = await handler()(req({ ...BODY, force: true }), ctx);
    expect(res.jsonBody).toEqual({
      instanceId: 'retro-xy',
      deduped: true,
      runtimeStatus: 'Completed',
      outcome: 'linked',
    });
    expect(client.startNew).not.toHaveBeenCalled();
  });

  it("REFUSES force on a Completed 'created' (and 'already_exists_linked') run", async () => {
    for (const outcome of ['created', 'already_exists_linked']) {
      client.startNew.mockClear();
      client.getStatus.mockResolvedValue({ runtimeStatus: 'Completed', output: { outcome } });
      const res = await handler()(req({ ...BODY, force: true }), ctx);
      expect(res.jsonBody).toMatchObject({ deduped: true, outcome });
      expect(client.startNew).not.toHaveBeenCalled();
    }
  });

  it("ALLOWS force on a Completed run whose outcome is in the failure family ('trigger_not_found')", async () => {
    client.getStatus.mockResolvedValue({
      runtimeStatus: 'Completed',
      output: { outcome: 'trigger_not_found' },
    });
    const res = await handler()(req({ ...BODY, force: true }), ctx);
    expect(client.startNew).toHaveBeenCalledWith('retroCaseOrchestrator', {
      instanceId: 'retro-xy',
      input: expect.objectContaining({ force: true }),
    });
    expect(res).toEqual({ status: 202, jsonBody: { accepted: true } });
  });

  it("ALLOWS force on the other failure-family outcomes ('no_source', 'not_eligible', 'ambiguous')", async () => {
    for (const outcome of ['no_source', 'not_eligible', 'ambiguous']) {
      client.startNew.mockClear();
      client.getStatus.mockResolvedValue({ runtimeStatus: 'Completed', output: { outcome } });
      await handler()(req({ ...BODY, force: true }), ctx);
      expect(client.startNew).toHaveBeenCalledTimes(1);
    }
  });

  it('a Completed run WITHOUT force stays refused with the pre-existing response shape', async () => {
    client.getStatus.mockResolvedValue({
      runtimeStatus: 'Completed',
      output: { outcome: 'no_source' },
    });
    const res = await handler()(req(BODY), ctx);
    expect(res.jsonBody).toEqual({
      instanceId: 'retro-xy',
      deduped: true,
      runtimeStatus: 'Completed',
    });
    expect(client.startNew).not.toHaveBeenCalled();
  });

  it('Failed/Terminated stay restartable WITHOUT force (unchanged behaviour)', async () => {
    for (const runtimeStatus of ['Failed', 'Terminated']) {
      client.startNew.mockClear();
      client.getStatus.mockResolvedValue({ runtimeStatus });
      await handler()(req(BODY), ctx);
      expect(client.startNew).toHaveBeenCalledTimes(1);
    }
  });

  it('a LIVE instance is never restarted, force or not', async () => {
    for (const runtimeStatus of ['Running', 'Pending']) {
      client.startNew.mockClear();
      client.getStatus.mockResolvedValue({ runtimeStatus });
      const res = await handler()(req({ ...BODY, force: true }), ctx);
      expect(res.jsonBody).toMatchObject({ deduped: true, runtimeStatus });
      expect(client.startNew).not.toHaveBeenCalled();
    }
  });
});
