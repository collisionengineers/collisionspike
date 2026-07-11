import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const { getMessageWithAttachments, searchMessages } = await import('./graph.js');

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

  it('follows an absolute @odata.nextLink and aggregates attachments from both pages', async () => {
    const page2 =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages/message-pages/attachments?$skiptoken=page-2';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url.endsWith('/messages/message-pages')) return json({ id: 'message-pages', hasAttachments: true });
      if (url.endsWith('/messages/message-pages/attachments')) {
        return json({
          value: [{
            '@odata.type': '#microsoft.graph.fileAttachment',
            id: 'page-1', name: 'one.pdf', contentType: 'application/pdf', size: 3,
            contentBytes: Buffer.from('one').toString('base64'),
          }],
          '@odata.nextLink': page2,
        });
      }
      if (url === page2) {
        return json({ value: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          id: 'page-2', name: 'two.pdf', contentType: 'application/pdf', size: 3,
          contentBytes: Buffer.from('two').toString('base64'),
        }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await getMessageWithAttachments('mailbox@example.test', 'message-pages');
    expect(result.attachments.map((a) => a.id)).toEqual(['page-1', 'page-2']);
    expect(result.attachmentFailures).toEqual([]);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === page2)).toBe(true);
  });

  it('also follows a relative @odata.nextLink', async () => {
    const page2 = '/users/mailbox%40example.test/messages/message-relative/attachments?$skiptoken=page-2';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url.endsWith('/messages/message-relative')) return json({ id: 'message-relative', hasAttachments: true });
      if (url.endsWith('/messages/message-relative/attachments')) {
        return json({ value: [], '@odata.nextLink': page2 });
      }
      if (url.endsWith(page2)) {
        return json({ value: [{
          '@odata.type': '#microsoft.graph.fileAttachment',
          id: 'relative-2', name: 'relative.pdf', contentType: 'application/pdf', size: 3,
          contentBytes: Buffer.from('pdf').toString('base64'),
        }] });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const result = await getMessageWithAttachments('mailbox@example.test', 'message-relative');
    expect(result.attachments.map((a) => a.id)).toEqual(['relative-2']);
  });

  it('rejects a repeated nextLink instead of silently truncating a cyclic collection', async () => {
    const firstPage =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages/message-cycle/attachments';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url.endsWith('/messages/message-cycle')) return json({ id: 'message-cycle', hasAttachments: true });
      if (url === firstPage) return json({ value: [], '@odata.nextLink': firstPage });
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(getMessageWithAttachments('mailbox@example.test', 'message-cycle')).rejects.toThrow(
      /attachment pagination cycle/i,
    );
  });

  it('throws a page-2 Graph failure so the queue can retry instead of false-completing', async () => {
    const page2 =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages/message-page-fail/attachments?$skiptoken=page-2';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url.endsWith('/messages/message-page-fail')) return json({ id: 'message-page-fail', hasAttachments: true });
      if (url.endsWith('/messages/message-page-fail/attachments')) {
        return json({ value: [], '@odata.nextLink': page2 });
      }
      if (url === page2) return new Response('unavailable', { status: 503 });
      throw new Error(`unexpected fetch ${url}`);
    });

    await expect(getMessageWithAttachments('mailbox@example.test', 'message-page-fail')).rejects.toThrow(/503/);
  });
});

describe('searchMessages bounded pagination', () => {
  it('follows page 2 so an exact candidate at overall position 26 is returned', async () => {
    const page2 =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages?$search=subject&$skiptoken=page-2';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url === page2) {
        return json({
          value: [{ id: 'exact-26', subject: 'Subject', hasAttachments: true }],
        });
      }
      if (url.includes('/messages?$search=')) {
        return json({
          value: Array.from({ length: 25 }, (_unused, i) => ({
            id: `noise-${i + 1}`,
            subject: 'Subject',
          })),
          '@odata.nextLink': page2,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const rows = await searchMessages('mailbox@example.test', '"Subject"', 100);
    expect(rows).toHaveLength(26);
    expect(rows[25]).toMatchObject({ id: 'exact-26', hasAttachments: true });
    expect(fetchMock.mock.calls.some(([input]) => String(input) === page2)).toBe(true);
  });

  it('stops at the caller total bound and rejects a repeated nextLink cycle', async () => {
    const page2 =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages?$search=subject&$skiptoken=bounded-2';
    const page3 =
      'https://graph.microsoft.com/v1.0/users/mailbox%40example.test/messages?$search=subject&$skiptoken=bounded-3';
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/oauth2/v2.0/token')) return json({ access_token: 'token', expires_in: 3600 });
      if (url === page2) {
        return json({
          value: Array.from({ length: 10 }, (_unused, i) => ({ id: `page2-${i}` })),
          '@odata.nextLink': page3,
        });
      }
      if (url.includes('/messages?$search=')) {
        return json({
          value: Array.from({ length: 25 }, (_unused, i) => ({ id: `page1-${i}` })),
          '@odata.nextLink': page2,
        });
      }
      throw new Error(`unexpected fetch ${url}`);
    });

    const bounded = await searchMessages('mailbox@example.test', '"Subject"', 26);
    expect(bounded).toHaveLength(26);
    expect(fetchMock.mock.calls.some(([input]) => String(input) === page3)).toBe(false);

    fetchMock.mockReset();
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/messages?$search=')) {
        return json({ value: [], '@odata.nextLink': url });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
    await expect(searchMessages('mailbox@example.test', '"Cycle"', 100)).rejects.toThrow(
      /message search pagination cycle/i,
    );
  });
});
