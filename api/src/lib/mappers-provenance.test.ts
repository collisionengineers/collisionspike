import { describe, expect, it } from 'vitest';

import { rowToEvaFields } from './mappers.js';

describe('rowToEvaFields provenance selection', () => {
  it('is deterministic and keeps a reviewed current-value source over stale/conflicting rows', () => {
    const record = { eva_claimant_name: 'Jane Example' };
    const stale = {
      id: 'a', field_name: 'claimantName', value: 'Other Person',
      source_type_code: 100000001, review_state_code: 100000001,
      updated_at: new Date('2026-07-12T12:00:00Z'), source_label: 'Old extraction',
    };
    const extracted = {
      id: 'b', field_name: 'claimantName', value: 'Jane Example',
      source_type_code: 100000001, review_state_code: 100000001,
      updated_at: new Date('2026-07-12T13:00:00Z'), source_label: 'Extraction',
    };
    const reviewed = {
      id: 'c', field_name: 'claimantName', value: 'Jane Example',
      source_type_code: 100000000, review_state_code: 100000002,
      updated_at: new Date('2026-07-12T11:00:00Z'), source_label: 'Manual edit (case page)',
    };

    for (const rows of [
      [stale, extracted, reviewed],
      [reviewed, stale, extracted],
      [extracted, reviewed, stale],
    ]) {
      const fields = rowToEvaFields(record, rows);
      expect(fields.claimantName).toMatchObject({
        value: 'Jane Example',
        reviewState: 'reviewed',
        provenance: { sourceType: 'staff', sourceLabel: 'Manual edit (case page)' },
      });
    }
  });

  it('does not attach provenance for a different stored value', () => {
    const fields = rowToEvaFields(
      { eva_claimant_name: 'Current Person' },
      [{
        id: 'a', field_name: 'claimantName', value: 'Previous Person',
        source_type_code: 100000000, review_state_code: 100000002,
        source_label: 'Manual edit (case page)',
      }],
    );
    expect(fields.claimantName.value).toBe('Current Person');
    expect(fields.claimantName.reviewState).toBe('needs_review');
  });
});
