/** *
 * TKT-054: source_mailbox provenance — Graph change notifications canonicalise
 * `resource` to Users/<object-id-GUID>/Messages/<id>, so the mailbox must be
 * resolved back to its UPN via the subscription (which we created with the UPN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../adapters/graph.js', () => ({
  graphFetch: vi.fn(),
}));

import { graphFetch } from '../adapters/graph.js';
import {
  mailboxOfResource,
  folderOfResource,
  isSentItemsResource,
  looksLikeMailboxAddress,
  resolveSubscriptionMailbox,
  clearSubscriptionMailboxCache,
  runSubscriptionMaintenance,
  createSubscription,
} from './subscriptions.js';

const graphFetchMock = vi.mocked(graphFetch);

beforeEach(() => {
  clearSubscriptionMailboxCache();
  graphFetchMock.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('mailboxOfResource', () => {
  it('parses the UPN out of the subscription resource form', () => {
    expect(mailboxOfResource("users/info@collisionengineers.co.uk/mailFolders('Inbox')/messages")).toBe(
      'info@collisionengineers.co.uk',
    );
  });

  it('parses the GUID out of the canonicalised notification form (case-insensitive)', () => {
    expect(mailboxOfResource('Users/1f0287c2-8bc9-4de0-a11e-000000000000/Messages/AAMkAD=')).toBe(
      '1f0287c2-8bc9-4de0-a11e-000000000000',
    );
  });

  it('returns empty for junk', () => {
    expect(mailboxOfResource('')).toBe('');
    expect(mailboxOfResource('subscriptions/abc')).toBe('');
  });
});

describe('looksLikeMailboxAddress', () => {
  it('accepts a real address', () => {
    expect(looksLikeMailboxAddress('desk@collisionengineers.co.uk')).toBe(true);
  });

  it('rejects a directory GUID, empty, and @-prefixed values', () => {
    expect(looksLikeMailboxAddress('1f0287c2-8bc9-4de0-a11e-000000000000')).toBe(false);
    expect(looksLikeMailboxAddress('')).toBe(false);
    expect(looksLikeMailboxAddress('@nolocal.example')).toBe(false);
    expect(looksLikeMailboxAddress('two@ats@bad')).toBe(false);
  });
});

describe('resolveSubscriptionMailbox', () => {
  it('resolves the UPN from the subscription resource', async () => {
    graphFetchMock.mockResolvedValueOnce({
      id: 'sub-1',
      resource: "users/engineers@collisionengineers.co.uk/mailFolders('Inbox')/messages",
    });
    await expect(resolveSubscriptionMailbox('sub-1')).resolves.toBe('engineers@collisionengineers.co.uk');
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions/sub-1');
  });

  it('memoises per subscription id (one Graph GET per process lifetime)', async () => {
    graphFetchMock.mockResolvedValueOnce({
      id: 'sub-1',
      resource: "users/info@collisionengineers.co.uk/mailFolders('Inbox')/messages",
    });
    await resolveSubscriptionMailbox('sub-1');
    await expect(resolveSubscriptionMailbox('sub-1')).resolves.toBe('info@collisionengineers.co.uk');
    expect(graphFetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns '' when the subscription is gone (404) — never throws", async () => {
    graphFetchMock.mockRejectedValueOnce(new Error('graph GET /subscriptions/sub-x → 404: gone'));
    await expect(resolveSubscriptionMailbox('sub-x')).resolves.toBe('');
  });

  it("returns '' (uncached) when the subscription resource itself is not address-shaped", async () => {
    graphFetchMock.mockResolvedValue({
      id: 'sub-2',
      resource: 'Users/1f0287c2-8bc9-4de0-a11e-000000000000/Messages',
    });
    await expect(resolveSubscriptionMailbox('sub-2')).resolves.toBe('');
    // Not memoised — a later (fixed) subscription read should be attempted again.
    await resolveSubscriptionMailbox('sub-2');
    expect(graphFetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns '' for a blank subscription id without calling Graph", async () => {
    await expect(resolveSubscriptionMailbox('')).resolves.toBe('');
    expect(graphFetchMock).not.toHaveBeenCalled();
  });
});

describe('immutable-id subscription creation and routine-maintenance safety', () => {
  const OLD_ENV = {
    base: process.env.ORCH_PUBLIC_BASE_URL,
    mbx: process.env.GRAPH_INTAKE_MAILBOXES,
    cs: process.env.GRAPH_CLIENT_STATE,
  };
  beforeEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = 'https://orch.example';
    process.env.GRAPH_CLIENT_STATE = 'test-client-state';
    process.env.GRAPH_INTAKE_MAILBOXES = JSON.stringify([
      { mailbox: 'info@x.com', minIntakeDate: '2026-01-01T00:00:00Z' },
    ]);
  });
  afterEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = OLD_ENV.base;
    process.env.GRAPH_INTAKE_MAILBOXES = OLD_ENV.mbx;
    process.env.GRAPH_CLIENT_STATE = OLD_ENV.cs;
  });
  const logger = { log: () => {}, warn: () => {}, error: () => {} };

  it('sends Prefer IdType=ImmutableId on subscription creation', async () => {
    graphFetchMock.mockResolvedValue({ id: 'new', expirationDateTime: 'later' });
    await createSubscription('info@x.com');
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions', expect.objectContaining({
      method: 'POST',
      headers: { Prefer: 'IdType="ImmutableId"' },
    }));
    const init = graphFetchMock.mock.calls[0]?.[1] as { body?: string };
    const body = JSON.parse(init.body ?? '{}');
    expect(body.notificationUrl).toContain('idType=immutable-v1');
  });

  it('treats an alternate-id subscription as present, reports controlled rotation, and only renews it', async () => {
    const methods: string[] = [];
    graphFetchMock.mockImplementation(async (path: string, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') {
        return { value: [{
          id: 'alternate',
          resource: "users/info@x.com/mailFolders('Inbox')/messages",
          notificationUrl: 'https://orch.example/api/graph-webhook',
          expirationDateTime: 'e',
        }] };
      }
      if (path === '/subscriptions' && method === 'POST') {
        methods.push('POST');
        throw new Error('graph POST /subscriptions → 409: ExtensionError');
      }
      if (path === '/subscriptions/alternate' && method === 'DELETE') {
        methods.push('DELETE');
        return undefined;
      }
      if (path === '/subscriptions/alternate' && method === 'PATCH') {
        methods.push('PATCH');
        return { id: 'alternate', expirationDateTime: 'renewed' };
      }
      return undefined;
    });
    const summary = await runSubscriptionMaintenance(logger);
    expect(methods).toEqual(['PATCH']);
    expect(summary.rotated).toEqual([]);
    expect(summary.rotationRequired).toEqual(['info@x.com']);
    expect(summary.created).toEqual([]);
    expect(summary.renewed.map((entry) => entry.subId)).toEqual(['alternate']);
  });

  it('never attempts the Graph-409 duplicate create while renewing an alternate-id subscription', async () => {
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') {
        return { value: [{
          id: 'alternate',
          resource: "users/info@x.com/mailFolders('Inbox')/messages",
          notificationUrl: 'https://orch.example/api/graph-webhook',
          expirationDateTime: 'e',
        }] };
      }
      if (path === '/subscriptions' && method === 'POST') throw new Error('create failed');
      if (path === '/subscriptions/alternate' && method === 'PATCH') {
        return { id: 'alternate', expirationDateTime: 'renewed' };
      }
      return undefined;
    });
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.rotated).toEqual([]);
    expect(summary.rotationRequired).toEqual(['info@x.com']);
    expect(summary.renewed.map((entry) => entry.subId)).toEqual(['alternate']);
    expect(graphFetchMock).not.toHaveBeenCalledWith('/subscriptions', expect.objectContaining({ method: 'POST' }));
    expect(graphFetchMock).not.toHaveBeenCalledWith('/subscriptions/alternate', { method: 'DELETE' });
  });

});

describe('runSubscriptionMaintenance — prune de-scoped mailboxes', () => {
  const OLD_ENV = { base: process.env.ORCH_PUBLIC_BASE_URL, mbx: process.env.GRAPH_INTAKE_MAILBOXES };
  beforeEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = 'https://orch.example';
    process.env.GRAPH_INTAKE_MAILBOXES = JSON.stringify([{ mailbox: 'info@x.com', minIntakeDate: '2026-01-01T00:00:00Z' }]);
  });
  afterEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = OLD_ENV.base;
    process.env.GRAPH_INTAKE_MAILBOXES = OLD_ENV.mbx;
  });
  const logger = { log: () => {}, warn: () => {}, error: () => {} };
  const subs = (extra: Record<string, unknown>[] = []) => ({
    value: [
      { id: 'sub-info', resource: "users/info@x.com/mailFolders('Inbox')/messages", notificationUrl: 'https://orch.example/api/graph-webhook?idType=immutable-v1', expirationDateTime: 'e' },
      ...extra,
    ],
  });

  it('DELETEs a subscription whose mailbox left GRAPH_INTAKE_MAILBOXES, renews the configured one', async () => {
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') {
        return subs([{ id: 'sub-old', resource: "users/old@x.com/mailFolders('Inbox')/messages", notificationUrl: 'https://orch.example/api/graph-webhook?idType=immutable-v1', expirationDateTime: 'e' }]);
      }
      if (method === 'DELETE') return undefined;
      if (method === 'PATCH') return { id: path.split('/').pop(), expirationDateTime: 'renewed' };
      return {};
    });
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.pruned).toEqual(['old@x.com']);
    expect(summary.renewed.map((r) => r.subId)).toEqual(['sub-info']);
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions/sub-old', { method: 'DELETE' });
  });

  it('does NOT prune when the config is empty (guard against wiping every sub)', async () => {
    process.env.GRAPH_INTAKE_MAILBOXES = '[]';
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') return subs();
      if (method === 'PATCH') return { id: path.split('/').pop(), expirationDateTime: 'renewed' };
      return {};
    });
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.pruned).toEqual([]);
    expect(graphFetchMock).not.toHaveBeenCalledWith('/subscriptions/sub-info', { method: 'DELETE' });
  });
});

describe('folderOfResource / isSentItemsResource (TKT-095 detector (a))', () => {
  it('parses the folder out of a subscription resource', () => {
    expect(folderOfResource("users/info@x.com/mailFolders('Inbox')/messages")).toBe('Inbox');
    expect(folderOfResource("users/info@x.com/mailFolders('SentItems')/messages")).toBe('SentItems');
  });

  it("returns '' for the canonicalised notification form (no folder visible)", () => {
    expect(folderOfResource('Users/1f0287c2-8bc9-4de0-a11e-000000000000/Messages/AAMkAD=')).toBe('');
    expect(folderOfResource('')).toBe('');
  });

  it('isSentItemsResource is folder- and case-keyed, never true for Inbox/unknown', () => {
    expect(isSentItemsResource("users/a@x.com/mailFolders('SentItems')/messages")).toBe(true);
    expect(isSentItemsResource("users/a@x.com/mailFolders('sentitems')/messages")).toBe(true);
    expect(isSentItemsResource("users/a@x.com/mailFolders('Inbox')/messages")).toBe(false);
    expect(isSentItemsResource('Users/GUID/Messages/AAMkAD=')).toBe(false);
  });
});

describe('runSubscriptionMaintenance — SentItems lifecycle (TKT-095 detector (a), DONE_SENT_EMAIL_ENABLED)', () => {
  const OLD_ENV = {
    base: process.env.ORCH_PUBLIC_BASE_URL,
    mbx: process.env.GRAPH_INTAKE_MAILBOXES,
    cs: process.env.GRAPH_CLIENT_STATE,
    gate: process.env.DONE_SENT_EMAIL_ENABLED,
  };
  beforeEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = 'https://orch.example';
    process.env.GRAPH_INTAKE_MAILBOXES = JSON.stringify([{ mailbox: 'info@x.com', minIntakeDate: '2026-01-01T00:00:00Z' }]);
    process.env.GRAPH_CLIENT_STATE = 'test-client-state';
    delete process.env.DONE_SENT_EMAIL_ENABLED;
  });
  afterEach(() => {
    process.env.ORCH_PUBLIC_BASE_URL = OLD_ENV.base;
    process.env.GRAPH_INTAKE_MAILBOXES = OLD_ENV.mbx;
    process.env.GRAPH_CLIENT_STATE = OLD_ENV.cs;
    if (OLD_ENV.gate === undefined) delete process.env.DONE_SENT_EMAIL_ENABLED;
    else process.env.DONE_SENT_EMAIL_ENABLED = OLD_ENV.gate;
  });
  const logger = { log: () => {}, warn: () => {}, error: () => {} };

  const inboxSub = {
    id: 'sub-info',
    resource: "users/info@x.com/mailFolders('Inbox')/messages",
    notificationUrl: 'https://orch.example/api/graph-webhook?idType=immutable-v1',
    expirationDateTime: 'e',
  };
  const sentSub = {
    id: 'sub-info-sent',
    resource: "users/info@x.com/mailFolders('SentItems')/messages",
    notificationUrl: 'https://orch.example/api/graph-webhook-sent?idType=immutable-v1',
    expirationDateTime: 'e',
  };

  function wire(existing: Record<string, unknown>[], captureCreates: unknown[]) {
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') return { value: existing };
      if (path === '/subscriptions' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        captureCreates.push(body);
        return { id: `new-${captureCreates.length}`, resource: body.resource, expirationDateTime: 'n' };
      }
      if (method === 'DELETE') return undefined;
      if (method === 'PATCH') return { id: path.split('/').pop(), expirationDateTime: 'renewed' };
      return {};
    });
  }

  it('gate OFF + no SentItems subs → behaviour identical to today (renew only, no creates/prunes)', async () => {
    const creates: unknown[] = [];
    wire([inboxSub], creates);
    const summary = await runSubscriptionMaintenance(logger);
    expect(creates).toEqual([]);
    expect(summary.created).toEqual([]);
    expect(summary.pruned).toEqual([]);
    expect(summary.renewed.map((r) => r.subId)).toEqual(['sub-info']);
  });

  it('gate ON → creates a SentItems subscription per configured mailbox, routed to the sent endpoints', async () => {
    process.env.DONE_SENT_EMAIL_ENABLED = 'true';
    const creates: Array<{ resource?: string; notificationUrl?: string; lifecycleNotificationUrl?: string; changeType?: string }> = [];
    wire([inboxSub], creates);
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.created).toEqual(['sentitems:info@x.com']);
    expect(creates).toHaveLength(1);
    expect(creates[0].resource).toBe("users/info@x.com/mailFolders('SentItems')/messages");
    expect(creates[0].notificationUrl).toBe('https://orch.example/api/graph-webhook-sent?idType=immutable-v1');
    expect(creates[0].lifecycleNotificationUrl).toBe('https://orch.example/api/graph-lifecycle-sent?idType=immutable-v1');
    expect(creates[0].changeType).toBe('created');
    // The existing Inbox sub is renewed, never touched otherwise.
    expect(summary.renewed.map((r) => r.subId)).toEqual(['sub-info']);
  });

  it('gate ON + SentItems sub already present → no duplicate create; both subs renewed', async () => {
    process.env.DONE_SENT_EMAIL_ENABLED = 'true';
    const creates: unknown[] = [];
    wire([inboxSub, sentSub], creates);
    const summary = await runSubscriptionMaintenance(logger);
    expect(creates).toEqual([]);
    expect(summary.renewed.map((r) => r.subId)).toEqual(['sub-info', 'sub-info-sent']);
  });

  it('gate OFF + a SentItems sub exists (flip-off) → the SentItems sub is PRUNED, Inbox untouched', async () => {
    const creates: unknown[] = [];
    wire([inboxSub, sentSub], creates);
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.pruned).toEqual(['sentitems:info@x.com']);
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions/sub-info-sent', { method: 'DELETE' });
    expect(graphFetchMock).not.toHaveBeenCalledWith('/subscriptions/sub-info', { method: 'DELETE' });
    expect(summary.renewed.map((r) => r.subId)).toEqual(['sub-info']);
    expect(creates).toEqual([]); // gate off never creates
  });

  it('gate ON + a gone SentItems sub (renew 404) → recreated as SentItems, not Inbox', async () => {
    process.env.DONE_SENT_EMAIL_ENABLED = 'true';
    const creates: Array<{ resource?: string }> = [];
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string; body?: unknown }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') return { value: [inboxSub, sentSub] };
      if (path === '/subscriptions' && method === 'POST') {
        const body = JSON.parse(String(init?.body ?? '{}'));
        creates.push(body);
        return { id: 'recreated', resource: body.resource, expirationDateTime: 'n' };
      }
      if (method === 'PATCH' && path.endsWith('sub-info-sent')) throw new Error('graph PATCH → 404: gone');
      if (method === 'PATCH') return { id: path.split('/').pop(), expirationDateTime: 'renewed' };
      return {};
    });
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.recreated).toEqual(['sentitems:info@x.com']);
    expect(creates.map((c) => c.resource)).toEqual(["users/info@x.com/mailFolders('SentItems')/messages"]);
  });

  it('a de-scoped mailbox prunes BOTH its Inbox and SentItems subscriptions', async () => {
    process.env.DONE_SENT_EMAIL_ENABLED = 'true';
    const creates: unknown[] = [];
    wire(
      [
        inboxSub,
        sentSub,
        { id: 'sub-old', resource: "users/old@x.com/mailFolders('Inbox')/messages", notificationUrl: 'https://orch.example/api/graph-webhook?idType=immutable-v1', expirationDateTime: 'e' },
        { id: 'sub-old-sent', resource: "users/old@x.com/mailFolders('SentItems')/messages", notificationUrl: 'https://orch.example/api/graph-webhook-sent?idType=immutable-v1', expirationDateTime: 'e' },
      ],
      creates,
    );
    const summary = await runSubscriptionMaintenance(logger);
    expect(summary.pruned.sort()).toEqual(['old@x.com', 'sentitems:old@x.com']);
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions/sub-old', { method: 'DELETE' });
    expect(graphFetchMock).toHaveBeenCalledWith('/subscriptions/sub-old-sent', { method: 'DELETE' });
  });
});
