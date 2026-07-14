import { describe, expect, it } from 'vitest';
import type { EvaField } from './types';

describe('EvaField conflict visibility', () => {
  it('keeps the saved value separate from each sourced alternative', () => {
    const field: EvaField = {
      value: 'Ms Existing Claimant',
      reviewState: 'conflict',
      provenance: {
        sourceType: 'staff',
        sourceLabel: 'Manual edit (case page)',
      },
      conflicts: [
        {
          candidateValue: 'Mr Different Candidate',
          provenance: {
            sourceType: 'email_text',
            sourceLabel: 'From email body',
          },
        },
      ],
    };

    expect(field.value).toBe('Ms Existing Claimant');
    expect(field.conflicts).toEqual([
      {
        candidateValue: 'Mr Different Candidate',
        provenance: {
          sourceType: 'email_text',
          sourceLabel: 'From email body',
        },
      },
    ]);
  });
});
