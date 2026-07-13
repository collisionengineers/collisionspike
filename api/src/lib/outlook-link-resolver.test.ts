import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveCurrentOutlookLink } from './outlook-link-resolver.js';

const realFetch = globalThis.fetch;

beforeEach(() => {
  process.env.OUTLOOK_LINK_RESOLVER_URL = 'https://orch.example/api/outlook-link-resolve';
  process.env.OUTLOOK_LINK_RESOLVER_KEY = 'secret';
});

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.OUTLOOK_LINK_RESOLVER_URL;
  delete process.env.OUTLOOK_LINK_RESOLVER_KEY;
  vi.restoreAllMocks();
});

describe('resolveCurrentOutlookLink', () => {
  it('posts the server-owned mailbox + immutable id to the function-key protected reader', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      status: 'available',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-current',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    globalThis.fetch = fetchMock as typeof fetch;

    await expect(resolveCurrentOutlookLink({
      sourceMailbox: 'info@collisionengineers.co.uk',
      graphMessageId: 'AAMk-immutable',
    })).resolves.toEqual({
      status: 'available',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-current',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://orch.example/api/outlook-link-resolve',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-functions-key': 'secret' }),
        body: JSON.stringify({
          sourceMailbox: 'info@collisionengineers.co.uk',
          graphMessageId: 'AAMk-immutable',
        }),
      }),
    );
  });

  it.each(['not_found', 'not_accessible'] as const)('preserves the explicit %s outcome', async (status) => {
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ status }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof fetch;
    await expect(resolveCurrentOutlookLink({ sourceMailbox: 'desk@example.test', graphMessageId: 'id' }))
      .resolves.toEqual({ status });
  });

  it('fails closed when configuration or the returned host is unsafe', async () => {
    delete process.env.OUTLOOK_LINK_RESOLVER_KEY;
    await expect(resolveCurrentOutlookLink({ sourceMailbox: 'desk@example.test', graphMessageId: 'id' }))
      .resolves.toEqual({ status: 'unavailable' });

    process.env.OUTLOOK_LINK_RESOLVER_KEY = 'secret';
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({
      status: 'available',
      outlookWebLink: 'https://outlook.office365.com.evil.example/owa/',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })) as typeof fetch;
    await expect(resolveCurrentOutlookLink({ sourceMailbox: 'desk@example.test', graphMessageId: 'id' }))
      .resolves.toEqual({ status: 'unavailable' });
  });
});
