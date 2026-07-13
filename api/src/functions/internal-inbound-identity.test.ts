import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.ENTRA_TENANT_ID = '858cf5b3-1111-2222-3333-444455556666';
  process.env.API_AUDIENCE = 'fa2fb28c-fef6-40a4-8d3b-ae6725891d72';
});

vi.mock('@azure/functions', () => ({ app: { http: () => {}, timer: () => {} } }));
const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../lib/db.js', () => ({
  query: db.query,
  tx: db.tx,
  getPool: () => { throw new Error('no pool in tests'); },
}));

import { resetSchemaIntrospectCacheForTests } from '../lib/schema-introspect.js';
import { upsertInboundEmail } from './internal.js';

const inserts: Array<[string, unknown[] | undefined]> = [];

beforeEach(() => {
  inserts.length = 0;
  db.query.mockReset();
  resetSchemaIntrospectCacheForTests();
  db.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (sql.includes('information_schema.columns')) {
      return [
        { column_name: 'body_jobref' },
        { column_name: 'conversation_id' },
        { column_name: 'graph_message_id' },
        { column_name: 'outlook_web_link' },
      ];
    }
    if (sql.includes('INSERT INTO inbound_email')) {
      inserts.push([sql, params]);
      return [{ id: `row-${inserts.length}` }];
    }
    return [];
  });
});

describe('upsertInboundEmail mailbox-qualified Outlook tuple', () => {
  it('keeps duplicate Internet-Message-Ids in different mailboxes as separate atomic tuples', async () => {
    const base = {
      messageId: 'notification-id',
      internetMessageId: '<duplicate@example.test>',
      subject: 'Same delivered message',
      senderAddress: 'sender@example.test',
      receivedAt: '2026-07-13T12:00:00Z',
      attachments: [],
      bodyPreview: 'saved',
      payloadHash: 'hash',
      candidateVrm: '',
      candidateRef: '',
    };
    await upsertInboundEmail({
      ...base,
      sourceMailbox: 'INFO@collisionengineers.co.uk',
      graphMessageId: 'graph-info',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=graph-info',
    }, null, null);
    await upsertInboundEmail({
      ...base,
      sourceMailbox: 'engineers@collisionengineers.co.uk',
      graphMessageId: 'graph-engineers',
      outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=graph-engineers',
    }, null, null);

    expect(inserts).toHaveLength(2);
    expect(inserts[0][0]).toContain('ON CONFLICT (source_mailbox, source_message_id)');
    expect(inserts[0][1]?.[5]).toBe('info@collisionengineers.co.uk');
    expect(inserts[0][1]?.slice(-2)).toEqual([
      'graph-info',
      'https://outlook.office365.com/owa/?ItemID=graph-info',
    ]);
    expect(inserts[1][1]?.[5]).toBe('engineers@collisionengineers.co.uk');
    expect(inserts[1][1]?.slice(-2)).toEqual([
      'graph-engineers',
      'https://outlook.office365.com/owa/?ItemID=graph-engineers',
    ]);
  });

  it('stores neither half when Graph does not provide a complete safe tuple', async () => {
    await upsertInboundEmail({
      messageId: 'notification-id',
      internetMessageId: '<partial@example.test>',
      sourceMailbox: 'info@collisionengineers.co.uk',
      graphMessageId: 'graph-without-safe-link',
      outlookWebLink: 'https://outlook.office365.com.evil.example/owa/',
      subject: 'Partial', senderAddress: 'sender@example.test',
      receivedAt: '2026-07-13T12:00:00Z', attachments: [], bodyPreview: 'saved',
      payloadHash: 'hash', candidateVrm: '', candidateRef: '',
    }, null, null);
    expect(inserts[0][1]?.slice(-2)).toEqual([null, null]);
  });
});
