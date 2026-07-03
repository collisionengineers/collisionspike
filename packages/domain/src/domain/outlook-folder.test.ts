import { describe, expect, it } from 'vitest';
import { INBOUND_SUBTYPES } from '../dto/index.js';
import { outlookFolderSegments, suggestedOutlookFolder } from './outlook-folder.js';

describe('suggestedOutlookFolder — one folder per e-mail type (TKT-054 / 020726 E6)', () => {
  it('maps the taxonomy exhaustively (every subtype gets an Inbox/* path)', () => {
    for (const s of INBOUND_SUBTYPES) {
      const folder = suggestedOutlookFolder(s);
      expect(folder.startsWith('Inbox/'), `${s} -> ${folder}`).toBe(true);
    }
  });

  it('pins the operator-visible mappings', () => {
    expect(suggestedOutlookFolder('existing_provider_instruction')).toBe('Inbox/Instructions');
    expect(suggestedOutlookFolder('new_client_work')).toBe('Inbox/New clients');
    expect(suggestedOutlookFolder('query_existing_work')).toBe('Inbox/Queries/Case queries');
    expect(suggestedOutlookFolder('billing_request')).toBe('Inbox/Billing');
    expect(suggestedOutlookFolder('cancellation_notice')).toBe('Inbox/Cancellations');
    expect(suggestedOutlookFolder('other')).toBe('Inbox/Other');
  });
});

describe('outlookFolderSegments — Inbox child walk for the mover', () => {
  it('drops the well-known Inbox root and keeps nesting order', () => {
    expect(outlookFolderSegments('Inbox/Queries/Case queries')).toEqual(['Queries', 'Case queries']);
    expect(outlookFolderSegments('Inbox/Instructions')).toEqual(['Instructions']);
    expect(outlookFolderSegments('Inbox')).toEqual([]);
  });

  it('tolerates stray slashes/spaces and a missing Inbox prefix', () => {
    expect(outlookFolderSegments(' Inbox / Billing ')).toEqual(['Billing']);
    expect(outlookFolderSegments('Billing')).toEqual(['Billing']);
    expect(outlookFolderSegments('')).toEqual([]);
  });
});
