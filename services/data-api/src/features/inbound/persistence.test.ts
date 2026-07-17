/**
 * services/data-api/src/features/inbound/persistence.test.ts — TKT-226.
 *
 * Pins the LOUD unmapped-taxonomy guard (a non-empty classification name with no
 * code-table mapping logs the `inboundTaxonomyUnmapped` marker instead of nulling
 * silently — the `retro_related` incident) and the ON CONFLICT pair-refresh rule
 * (subtype refreshes together with category on a non-human re-upsert; SQL-text
 * pin in the CASE_SELECT_WITH_ACTIVITY shape-test style).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('../../platform/db/client.js', () => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/schema-introspection.js', () => ({
  planOptionalColumns: vi.fn(() => ({ cols: [], placeholders: [], updateSets: [], values: [] })),
  tableColumns: vi.fn(async () => new Set<string>()),
}));
vi.mock('./internal/service-support.js', () => ({
  senderDomain: (address: string) => address.split('@')[1] ?? '',
}));

import {
  INBOUND_SUBTYPE_PAIR_REFRESH_SQL,
  categoryCodeFor,
  subtypeCodeFor,
} from './persistence.js';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('subtypeCodeFor / categoryCodeFor — the loud unmapped guard (TKT-226)', () => {
  it('maps known names to their frozen codes (silently)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(categoryCodeFor('case_update')).toBe(100000005);
    expect(subtypeCodeFor('images_received')).toBe(100000010);
    expect(subtypeCodeFor('update_general')).toBe(100000012);
    expect(spy).not.toHaveBeenCalled();
  });

  it('retro_related now maps to 100000016 (the incident subtype)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(subtypeCodeFor('retro_related')).toBe(100000016);
    expect(spy).not.toHaveBeenCalled();
  });

  it('a non-empty unmapped name returns null AND logs the inboundTaxonomyUnmapped marker', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(subtypeCodeFor('made_up_subtype')).toBeNull();
    expect(spy).toHaveBeenCalledTimes(1);
    const logged = String(spy.mock.calls[0]?.[0] ?? '');
    expect(logged).toContain('inboundTaxonomyUnmapped');
    expect(JSON.parse(logged)).toEqual({
      evt: 'inboundTaxonomyUnmapped',
      field: 'subtype',
      value: 'made_up_subtype',
    });
  });

  it('the category guard logs field=category', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(categoryCodeFor('made_up_category')).toBeNull();
    expect(JSON.parse(String(spy.mock.calls[0]?.[0] ?? ''))).toEqual({
      evt: 'inboundTaxonomyUnmapped',
      field: 'category',
      value: 'made_up_category',
    });
  });

  it('empty/absent names return null QUIETLY (no marker — nothing was named)', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(subtypeCodeFor('')).toBeNull();
    expect(subtypeCodeFor('   ')).toBeNull();
    expect(subtypeCodeFor(null)).toBeNull();
    expect(subtypeCodeFor(undefined)).toBeNull();
    expect(categoryCodeFor('')).toBeNull();
    expect(spy).not.toHaveBeenCalled();
  });

  it('the guard never throws (intake must not block)', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => subtypeCodeFor('anything_at_all')).not.toThrow();
    expect(() => categoryCodeFor('anything_at_all')).not.toThrow();
  });
});

describe('INBOUND_SUBTYPE_PAIR_REFRESH_SQL — subtype refreshes with category (TKT-226)', () => {
  it('freezes a human decision', () => {
    expect(INBOUND_SUBTYPE_PAIR_REFRESH_SQL).toContain(
      "WHEN inbound_email.classifier_mode = 'human'",
    );
    expect(INBOUND_SUBTYPE_PAIR_REFRESH_SQL).toContain('THEN inbound_email.subtype_code');
  });

  it('takes the incoming subtype VERBATIM (NULL included) when the write carries a classification', () => {
    // A mapped category with NULL subtype means "unmapped subtype name" — persisting
    // the stale pair (case_update, billing_request) would be a lie; the honest state
    // is (case_update, NULL) → 'Unidentified', now surfaced by the loud guard.
    expect(INBOUND_SUBTYPE_PAIR_REFRESH_SQL).toContain('WHEN EXCLUDED.category_code IS NOT NULL');
    expect(INBOUND_SUBTYPE_PAIR_REFRESH_SQL).toContain('THEN EXCLUDED.subtype_code');
  });

  it('keeps the fill-if-present fallback for classification-free writes', () => {
    expect(INBOUND_SUBTYPE_PAIR_REFRESH_SQL).toContain(
      'ELSE COALESCE(EXCLUDED.subtype_code, inbound_email.subtype_code)',
    );
  });
});
