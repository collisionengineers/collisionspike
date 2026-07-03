import { describe, it, expect } from 'vitest';
import { mailboxChipLabel, mailboxFacets, matchesMailboxFilter } from './inbox-mailbox-filter';

/* ============================================================
   inbox-mailbox-filter — the inbox's source-mailbox facet chips (TKT-025).
   ============================================================ */

describe('mailboxChipLabel', () => {
  it('shows the local part + "@" for a real address', () => {
    expect(mailboxChipLabel('info@collisionengineers.co.uk')).toBe('info@');
    expect(mailboxChipLabel('engineers@collisionengineers.co.uk')).toBe('engineers@');
    expect(mailboxChipLabel('desk@collisionengineers.co.uk')).toBe('desk@');
  });

  it('never renders a value that does not read as an address', () => {
    expect(mailboxChipLabel('mailbox-guid-1234')).toBe('Other source');
    expect(mailboxChipLabel('')).toBe('Other source');
    // An "@" with no local part in front of it is not a usable address either.
    expect(mailboxChipLabel('@collisionengineers.co.uk')).toBe('Other source');
  });
});

describe('mailboxFacets', () => {
  it('returns [] for no rows', () => {
    expect(mailboxFacets([])).toEqual([]);
  });

  it('counts distinct mailboxes and sorts alphabetically by address', () => {
    const rows = [
      { sourceMailbox: 'engineers@collisionengineers.co.uk' },
      { sourceMailbox: 'info@collisionengineers.co.uk' },
      { sourceMailbox: 'info@collisionengineers.co.uk' },
      { sourceMailbox: 'desk@collisionengineers.co.uk' },
      { sourceMailbox: 'info@collisionengineers.co.uk' },
    ];
    expect(mailboxFacets(rows)).toEqual([
      { mailbox: 'desk@collisionengineers.co.uk', label: 'desk@', count: 1 },
      { mailbox: 'engineers@collisionengineers.co.uk', label: 'engineers@', count: 1 },
      { mailbox: 'info@collisionengineers.co.uk', label: 'info@', count: 3 },
    ]);
  });

  it('excludes rows with a blank or whitespace-only sourceMailbox', () => {
    const rows = [
      { sourceMailbox: 'info@collisionengineers.co.uk' },
      { sourceMailbox: '' },
      { sourceMailbox: '   ' },
    ];
    expect(mailboxFacets(rows)).toEqual([
      { mailbox: 'info@collisionengineers.co.uk', label: 'info@', count: 1 },
    ]);
  });

  it('follows whatever mailboxes the rows actually carry — no hard-coded set', () => {
    // A mailbox absent from the "canonical" three-mailbox live set still
    // produces a facet — TKT-025's acceptance: the list follows the data.
    const rows = [{ sourceMailbox: 'archive@collisionengineers.co.uk' }];
    expect(mailboxFacets(rows)).toEqual([
      { mailbox: 'archive@collisionengineers.co.uk', label: 'archive@', count: 1 },
    ]);
  });
});

describe('matchesMailboxFilter', () => {
  const row = { sourceMailbox: 'info@collisionengineers.co.uk' };

  it('null (the "All" selection) matches every row', () => {
    expect(matchesMailboxFilter(row, null)).toBe(true);
  });

  it('a selected mailbox matches only rows whose mailbox is that one', () => {
    expect(matchesMailboxFilter(row, 'info@collisionengineers.co.uk')).toBe(true);
    expect(matchesMailboxFilter(row, 'engineers@collisionengineers.co.uk')).toBe(false);
  });

  it('trims the row value to match its own facet chip (whitespace parity with mailboxFacets)', () => {
    // A row whose sourceMailbox carries surrounding whitespace still produces the chip
    // 'info@collisionengineers.co.uk' (mailboxFacets trims). The filter must match it against
    // that trimmed chip, not the raw padded value — otherwise selecting the chip empties the list.
    const padded = { sourceMailbox: '  info@collisionengineers.co.uk  ' };
    const chip = mailboxFacets([padded])[0].mailbox; // 'info@collisionengineers.co.uk'
    expect(matchesMailboxFilter(padded, chip)).toBe(true);
  });
});
