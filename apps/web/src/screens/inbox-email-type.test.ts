/**
 * inbox-email-type.test.ts — the single-list inbox's type filter + legacy-URL
 * migration (TKT-054 / 020726 E1).
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  EMAIL_TYPE_ALL,
  SUBTYPES_BY_CATEGORY,
  emailTypeDisplayLabel,
  emailTypeParam,
  matchesEmailType,
  migrateLegacyInboxParams,
  parseEmailType,
} from './inbox-email-type';

describe('parseEmailType / emailTypeParam — round trip', () => {
  it('parses a category id', () => {
    expect(parseEmailType('receiving_work')).toEqual({ kind: 'category', category: 'receiving_work' });
  });

  it('parses a subtype id', () => {
    expect(parseEmailType('billing_request')).toEqual({ kind: 'subtype', subtype: 'billing_request' });
  });

  it('junk / null / empty -> all (stale bookmarks never throw)', () => {
    expect(parseEmailType(null)).toEqual(EMAIL_TYPE_ALL);
    expect(parseEmailType('')).toEqual(EMAIL_TYPE_ALL);
    expect(parseEmailType('nonsense')).toEqual(EMAIL_TYPE_ALL);
  });

  it('round-trips every category and subtype through emailTypeParam', () => {
    for (const c of CATEGORY_ORDER) {
      expect(parseEmailType(emailTypeParam({ kind: 'category', category: c }) ?? null)).toEqual({
        kind: 'category',
        category: c,
      });
      for (const s of SUBTYPES_BY_CATEGORY[c]) {
        if (s === 'other') continue; // the one collision: 'other' parses as the (equivalent) category
        expect(parseEmailType(emailTypeParam({ kind: 'subtype', subtype: s }) ?? null)).toEqual({
          kind: 'subtype',
          subtype: s,
        });
      }
    }
    expect(emailTypeParam(EMAIL_TYPE_ALL)).toBeUndefined();
  });

  it("resolves the 'other' collision to the category (the broader, equivalent filter)", () => {
    expect(parseEmailType('other')).toEqual({ kind: 'category', category: 'other' });
  });
});

describe('matchesEmailType', () => {
  it('a category filter matches every subtype under it (and only those)', () => {
    for (const c of CATEGORY_ORDER) {
      for (const s of SUBTYPES_BY_CATEGORY[c]) {
        expect(matchesEmailType({ category: c, subtype: s }, { kind: 'category', category: c })).toBe(true);
      }
    }
    expect(
      matchesEmailType({ category: 'billing', subtype: 'billing_request' }, { kind: 'category', category: 'query' }),
    ).toBe(false);
  });

  it('a subtype filter is exact; all matches everything', () => {
    expect(
      matchesEmailType(
        { category: 'receiving_work', subtype: 'new_client_work' },
        { kind: 'subtype', subtype: 'new_client_work' },
      ),
    ).toBe(true);
    expect(
      matchesEmailType(
        { category: 'receiving_work', subtype: 'existing_provider_audit' },
        { kind: 'subtype', subtype: 'new_client_work' },
      ),
    ).toBe(false);
    expect(matchesEmailType({ category: 'other', subtype: 'other' }, EMAIL_TYPE_ALL)).toBe(true);
  });
});

describe('emailTypeDisplayLabel', () => {
  it('labels all/category/subtype', () => {
    expect(emailTypeDisplayLabel(EMAIL_TYPE_ALL)).toBe('All types');
    expect(emailTypeDisplayLabel({ kind: 'category', category: 'receiving_work' })).toBe('Receiving work');
    expect(emailTypeDisplayLabel({ kind: 'subtype', subtype: 'query_new_enquiry' })).toBe('New enquiry');
    expect(emailTypeDisplayLabel({ kind: 'category', category: 'website_enquiry' })).toBe('Website enquiries');
    expect(emailTypeDisplayLabel({ kind: 'subtype', subtype: 'website_general_enquiry' })).toBe('Website enquiry');
  });
});

describe('migrateLegacyInboxParams — old dashboard tiles + bookmarks keep working', () => {
  const p = (q: string) => new URLSearchParams(q);

  it('category=receiving_work&view=active -> type filter, dismissed hidden, legacy flagged', () => {
    expect(migrateLegacyInboxParams(p('category=receiving_work&view=active'))).toEqual({
      emailType: { kind: 'category', category: 'receiving_work' },
      showDismissed: false,
      hadLegacy: true,
    });
  });

  it('view=all and triageState=dismissed both reveal dismissed rows', () => {
    expect(migrateLegacyInboxParams(p('view=all')).showDismissed).toBe(true);
    expect(migrateLegacyInboxParams(p('triageState=dismissed')).showDismissed).toBe(true);
  });

  it('view=active&triageState=new folds into the plain list', () => {
    expect(migrateLegacyInboxParams(p('view=active&triageState=new'))).toEqual({
      emailType: EMAIL_TYPE_ALL,
      showDismissed: false,
      hadLegacy: true,
    });
  });

  it('new-scheme params pass through untouched (hadLegacy false) and win over legacy', () => {
    expect(migrateLegacyInboxParams(p('type=billing&dismissed=1'))).toEqual({
      emailType: { kind: 'category', category: 'billing' },
      showDismissed: true,
      hadLegacy: false,
    });
    expect(migrateLegacyInboxParams(p('type=billing&category=query&view=all'))).toEqual({
      emailType: { kind: 'category', category: 'billing' },
      showDismissed: true, // view=all still honoured because ?dismissed absent
      hadLegacy: true,
    });
  });

  it('never consumes ?peek=', () => {
    const params = p('peek=case-1&category=query');
    migrateLegacyInboxParams(params);
    expect(params.get('peek')).toBe('case-1');
  });
});
