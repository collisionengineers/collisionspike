import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../adapters/graph.js', () => ({
  graphFetch: vi.fn(),
  odataQuote: (value: string) => `'${value.replace(/'/g, "''")}'`,
}));

import { graphFetch } from '../adapters/graph.js';
import {
  classifyOutlookReadError,
  findStoredMessageLink,
  readMessageLinkByImmutableId,
} from './outlook-links.js';

const graphFetchMock = vi.mocked(graphFetch);

beforeEach(() => graphFetchMock.mockReset());

describe('readMessageLinkByImmutableId', () => {
  it('uses mailbox + immutable id and requests immutable-id response semantics', async () => {
    graphFetchMock.mockResolvedValue({
      id: 'AAMk-immutable',
      webLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-immutable',
    });
    await expect(readMessageLinkByImmutableId('info@collisionengineers.co.uk', 'AAMk-immutable'))
      .resolves.toMatchObject({ status: 'available' });
    expect(graphFetchMock).toHaveBeenCalledWith(
      '/users/info%40collisionengineers.co.uk/messages/AAMk-immutable?$select=id,webLink',
      { headers: { Prefer: 'IdType="ImmutableId"' } },
    );
  });

  it.each([
    ['graph GET → 404: ErrorItemNotFound', 'not_found'],
    ['graph GET → 403: ErrorAccessDenied', 'not_accessible'],
    ['fetch failed', 'unavailable'],
  ] as const)('maps %s to %s without throwing', (detail, status) => {
    expect(classifyOutlookReadError(new Error(detail))).toEqual({ status });
  });
});

describe('findStoredMessageLink', () => {
  it('uses a mailbox-qualified exact filter and returns one immutable tuple', async () => {
    graphFetchMock.mockResolvedValue({ value: [{
      id: 'AAMk-old',
      webLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-old',
    }] });
    await expect(findStoredMessageLink('desk@collisionengineers.co.uk', '<same@example.test>'))
      .resolves.toEqual({
        status: 'resolved',
        graphMessageId: 'AAMk-old',
        outlookWebLink: 'https://outlook.office365.com/owa/?ItemID=AAMk-old',
      });
    expect(graphFetchMock.mock.calls[0]?.[0]).toContain('/users/desk%40collisionengineers.co.uk/messages?');
    expect(graphFetchMock.mock.calls[0]?.[1]).toEqual({ headers: { Prefer: 'IdType="ImmutableId"' } });
  });

  it('abstains when Graph returns two exact hits', async () => {
    graphFetchMock.mockResolvedValue({ value: [{ id: '1' }, { id: '2' }] });
    await expect(findStoredMessageLink('desk@example.test', '<same@example.test>'))
      .resolves.toEqual({ status: 'ambiguous', reason: 'multiple_exact_matches' });
  });
});
