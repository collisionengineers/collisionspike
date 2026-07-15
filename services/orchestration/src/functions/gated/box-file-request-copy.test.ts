import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface Registration {
  methods: string[];
  authLevel: string;
  route: string;
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, registration: Registration) => registrations.set(name, registration),
  },
}));

await import('./box-file-request-copy.js');

const CASE_ID = '11111111-1111-4111-8111-111111111111';

function request(body: unknown): HttpRequest {
  return { json: async () => body } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return { warn: vi.fn() } as unknown as InvocationContext;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('retired box-file-request-copy starter', () => {
  it('keeps the legacy route without registering a Durable or Box-copy worker', () => {
    const registration = registrations.get('box-file-request-copy-start');
    expect(registration).toMatchObject({
      methods: ['POST'],
      authLevel: 'anonymous',
      route: 'box-file-request-copy',
    });
    expect([...registrations.keys()]).toEqual(['box-file-request-copy-start']);
  });

  it('returns an explicit 410 and the API-owned durable replacement for valid legacy work', async () => {
    const ctx = context();
    const response = await registrations.get('box-file-request-copy-start')!.handler(
      request({ caseId: CASE_ID, folderId: 'legacy-folder-id' }),
      ctx,
    );
    expect(response.status).toBe(410);
    expect(response.jsonBody).toEqual({
      error: 'retired_starter',
      message: 'Create the image-upload link from the case page.',
      replacement: {
        method: 'POST',
        path: `/api/cases/${CASE_ID}/box/copy-file-request`,
      },
    });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('no remote work started'));
  });

  it('rejects a missing or malformed case identifier without claiming success', async () => {
    const response = await registrations.get('box-file-request-copy-start')!.handler(
      request({ folderId: 'legacy-folder-id' }),
      context(),
    );
    expect(response.status).toBe(400);
    expect(response.jsonBody).toEqual({ error: 'caseId must be a valid case identifier' });
  });
});
