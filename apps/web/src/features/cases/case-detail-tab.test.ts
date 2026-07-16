import { describe, expect, it } from 'vitest';
import { caseDetailSearchForTab, caseDetailTabFromSearch } from './case-detail-tab';

describe('case detail tab query state', () => {
  it('opens the evidence tab from a shareable case URL', () => {
    expect(caseDetailTabFromSearch('?tab=evidence')).toBe('evidence');
  });

  it('falls back to fields for a missing or unknown tab', () => {
    expect(caseDetailTabFromSearch('')).toBe('fields');
    expect(caseDetailTabFromSearch('?tab=system-settings')).toBe('fields');
  });

  it('changes the tab without dropping unrelated query values', () => {
    const next = caseDetailSearchForTab('?from=inbox&tab=fields', 'chasers');
    expect(next.get('from')).toBe('inbox');
    expect(next.get('tab')).toBe('chasers');
  });
});
