import { describe, it, expect } from 'vitest';

import { CASE_MINTING_CATEGORIES, categoryMintsCase } from './intake-routing';
import type { InboundCategory } from '../dto/index.js';

/* The primary intake path mints a Case ONLY from receiving_work. This pins the
   invariant that a non_actionable acknowledgement (TKT-081 s2, which minted a blank
   case) — and every other non-work category — can never open a Case. */
describe('CASE_MINTING_CATEGORIES', () => {
  it('is exactly [receiving_work] — no other category mints a Case', () => {
    expect(CASE_MINTING_CATEGORIES).toEqual(['receiving_work']);
    expect(CASE_MINTING_CATEGORIES).not.toContain('non_actionable');
  });

  it('receiving_work mints', () => {
    expect(categoryMintsCase('receiving_work')).toBe(true);
  });

  it.each(
    ['query', 'billing', 'non_actionable', 'cancellation', 'case_update', 'website_enquiry', 'other'] as const,
  )(
    'category %s never mints a Case (a non_actionable acknowledgement must not open a blank case)',
    (category: InboundCategory) => {
      expect(categoryMintsCase(category)).toBe(false);
    },
  );
});
