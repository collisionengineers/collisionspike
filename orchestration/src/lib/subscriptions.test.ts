/**
 * orchestration/src/lib/subscriptions.test.ts
 *
 * TKT-054: source_mailbox provenance — Graph change notifications canonicalise
 * `resource` to Users/<object-id-GUID>/Messages/<id>, so the mailbox must be
 * resolved back to its UPN via the subscription (which we created with the UPN).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./graph.js', () => ({
  graphFetch: vi.fn(),
}));

import { graphFetch } from './graph.js';
import {
  mailboxOfResource,
  looksLikeMailboxAddress,
  resolveSubscriptionMailbox,
  clearSubscriptionMailboxCache,
  runSubscriptionMaintenance,
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
      { id: 'sub-info', resource: "users/info@x.com/mailFolders('Inbox')/messages", notificationUrl: 'https://orch.example/api/graph-webhook', expirationDateTime: 'e' },
      ...extra,
    ],
  });

  it('DELETEs a subscription whose mailbox left GRAPH_INTAKE_MAILBOXES, renews the configured one', async () => {
    graphFetchMock.mockImplementation(async (path: string, init?: { method?: string }) => {
      const method = init?.method ?? 'GET';
      if (path === '/subscriptions' && method === 'GET') {
        return subs([{ id: 'sub-old', resource: "users/old@x.com/mailFolders('Inbox')/messages", notificationUrl: 'https://orch.example/api/graph-webhook', expirationDateTime: 'e' }]);
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
