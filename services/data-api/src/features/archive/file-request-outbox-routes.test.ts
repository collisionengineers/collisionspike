import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  methods?: string[];
  authLevel?: string;
  route?: string;
  schedule?: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
const outbox = vi.hoisted(() => ({ pending: vi.fn(), process: vi.fn() }));
const auth = vi.hoisted(() => ({ withServiceAuth: vi.fn() }));

vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: Registration) => registrations.set(name, options),
    timer: (name: string, options: Registration) => registrations.set(name, options),
  },
}));
vi.mock('./file-request-outbox.js', () => ({
  pendingBoxFileRequestCaseIds: outbox.pending,
  processBoxFileRequestIntent: outbox.process,
}));
vi.mock('../settings/gates.js', () => ({
  gates: { boxApi: () => true, boxFileRequest: () => true },
}));
vi.mock('../inbound/internal/service-support.js', () => ({
  withServiceAuth: auth.withServiceAuth,
}));

await import('./file-request-outbox-routes.js');

beforeEach(() => {
  outbox.pending.mockReset();
  outbox.process.mockReset();
  auth.withServiceAuth.mockReset();
  auth.withServiceAuth.mockImplementation(
    async (req: HttpRequest, ctx: InvocationContext, next: Registration['handler']) =>
      next(req, ctx),
  );
});

describe('wake-safe Box File Request outbox drain', () => {
  it('registers a service-authenticated internal POST while retaining the timer fallback', () => {
    expect(registrations.get('internalBoxFileRequestOutboxDrain')).toMatchObject({
      methods: ['POST'],
      authLevel: 'anonymous',
      route: 'internal/box-file-request-outbox/drain',
    });
    expect(registrations.get('box-file-request-outbox-drain')).toMatchObject({
      schedule: '30 * * * * *',
    });
  });

  it('drains through the API owner and reports replay-safe aggregate truth', async () => {
    outbox.pending.mockResolvedValue(['case-1', 'case-2']);
    outbox.process
      .mockResolvedValueOnce({ kind: 'ok', fileRequestUrl: 'https://app.box.com/f/a', reused: false })
      .mockResolvedValueOnce({ kind: 'pending', reason: 'transient' });
    const registration = registrations.get('internalBoxFileRequestOutboxDrain')!;
    const req = {} as HttpRequest;
    const ctx = {} as InvocationContext;

    const response = await registration.handler(req, ctx);

    expect(auth.withServiceAuth).toHaveBeenCalledOnce();
    expect(outbox.process.mock.calls.map(([caseId]) => caseId)).toEqual(['case-1', 'case-2']);
    expect(response).toEqual({
      status: 200,
      jsonBody: { processed: 2, completed: 1 },
    });
  });
});
