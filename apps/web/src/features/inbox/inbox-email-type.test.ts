/**
 * inbox-email-type.test.ts — the single-list inbox's URL-backed type filters.
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_ORDER,
  EMAIL_TYPE_ALL,
  SUBTYPE_LABEL,
  SUBTYPES_BY_CATEGORY,
  emailTypeDisplayLabel,
  emailTypeParam,
  matchesEmailType,
  parseEmailType,
  readInboxFilterParams,
} from './inbox-email-type';

describe('SUBTYPE_LABEL — staff-visible wording pins', () => {
  it('retro_related reads Related (retro-linked) and sits under Case updates (TKT-226)', () => {
    expect(SUBTYPE_LABEL.retro_related).toBe('Related (retro-linked)');
    expect(SUBTYPES_BY_CATEGORY.case_update).toContain('retro_related');
  });
});

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

describe('readInboxFilterParams', () => {
  const p = (q: string) => new URLSearchParams(q);

  it('reads the supported type and dismissed parameters', () => {
    expect(readInboxFilterParams(p('type=billing&dismissed=1'))).toEqual({
      emailType: { kind: 'category', category: 'billing' },
      showDismissed: true,
    });
  });

  it('uses safe defaults and leaves unrelated parameters untouched', () => {
    const params = p('peek=case-1&unrelated=value');
    expect(readInboxFilterParams(params)).toEqual({
      emailType: EMAIL_TYPE_ALL,
      showDismissed: false,
    });
    expect(params.get('peek')).toBe('case-1');
    expect(params.get('unrelated')).toBe('value');
  });
});
