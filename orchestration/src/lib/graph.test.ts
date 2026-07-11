import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const { getMessageWithAttachments } = await import('./graph.js');

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

beforeEach(() => {
  process.env.GRAPH_TENANT_ID = 'tenant';
  process.env.GRAPH_CLIENT_ID = 'client';
  process.env.GRAPH_CLIENT_SECRET = 'secret';
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.GRAPH_TENANT_ID;
  delete process.env.GRAPH_CLIENT_ID;
  delete process.env.GRAPH_CLIENT_SECRET;
});

describe('getMessageWithAttachments attachment recovery results', () => {
  it('returns successful siblings and surfaces a failed $value fetch instead of silently dropping it', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return json({ access_token: 'token', expires_in: 3600 });
      }
      if (url.endsWith('/attachments')) {
        return json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'att-ok',
              name: 'document.pdf',
              contentType: 'application/pdf',
              size: 3,
              contentBytes: Buffer.from('pdf').toString('base64'),
            },
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'att-failed',
              name: 'large.pdf',
              contentType: 'application/pdf',
              size: 10_000_000,
            },
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: 'att-inline',
              name: 'logo.png',
              contentType: 'image/png',
              size: 5,
              isInline: true,
            },
          ],
        });
      }
      if (url.includes('/attachments/att-failed/$value')) {
        return new Response('unavailable', { status: 503 });
      }
      if (url.includes('/messages/message-1')) {
        return json({ id: 'message-1', hasAttachments: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await getMessageWithAttachments('mailbox@example.test', 'message-1');

    expect(result.attachments.map((a) => a.id)).toEqual(['att-ok']);
    expect(result.attachmentFailures).toEqual([expect.objectContaining({ id: 'att-failed', name: 'large.pdf' })]);
    expect(result.attachmentFailures[0].reason).toMatch(/503/);
    expect(result.attachmentFailures.some((f) => f.id === 'att-inline')).toBe(false);
  });

  it('treats a non-inline attachment with no Graph identity as a retrieval failure', async () => {
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) {
        return json({ access_token: 'token', expires_in: 3600 });
      }
      if (url.endsWith('/attachments')) {
        return json({
          value: [
            {
              '@odata.type': '#microsoft.graph.fileAttachment',
              id: '',
              name: 'photo.jpg',
              contentType: 'image/jpeg',
              size: 3,
              contentBytes: Buffer.from('img').toString('base64'),
            },
          ],
        });
      }
      if (url.includes('/messages/message-2')) {
        return json({ id: 'message-2', hasAttachments: true });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await getMessageWithAttachments('mailbox@example.test', 'message-2');

    expect(result.attachments).toEqual([]);
    expect(result.attachmentFailures).toEqual([
      expect.objectContaining({
        id: '',
        reason: 'attachment identity missing',
      }),
    ]);
  });
});
