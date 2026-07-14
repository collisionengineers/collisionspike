// @vitest-environment jsdom
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { EvaField } from '@cs/domain';
import { EvaFieldRow } from './EvaFields';

afterEach(cleanup);

describe('EvaFieldRow claimant conflict visibility', () => {
  it('shows the retained candidate and a plain-language source without replacing the saved name', () => {
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
            sourceLabel: 'parser_email_text_internal',
          },
        },
      ],
    };

    render(
      <FluentProvider theme={webLightTheme}>
        <EvaFieldRow
          fieldKey="claimantName"
          label="Claimant Name"
          required
          field={field}
          onChange={vi.fn()}
        />
      </FluentProvider>,
    );

    expect((screen.getByRole('textbox', { name: /Claimant Name/i }) as HTMLInputElement).value)
      .toBe('Ms Existing Claimant');
    const conflict = screen.getByRole('note', { name: 'Claimant name conflict' });
    expect(conflict.textContent).toContain('Another claimant name was found');
    expect(conflict.textContent).toContain('Other value: Mr Different Candidate');
    expect(conflict.textContent).toContain('Source: Email');
    expect(conflict.textContent).not.toContain('parser_email_text_internal');

    expect(screen.getByLabelText(/Another value: Mr Different Candidate\. Source: From the email/))
      .toBeTruthy();
  });

  it('uses handler-facing vehicle wording for a vehicle-record conflict', () => {
    const field: EvaField = {
      value: 'Ms Existing Claimant',
      reviewState: 'conflict',
      provenance: { sourceType: 'staff', sourceLabel: 'Manual edit (case page)' },
      conflicts: [{
        candidateValue: 'Mr Different Candidate',
        provenance: { sourceType: 'dvla_dvsa', sourceLabel: 'internal source label' },
      }],
    };

    render(
      <FluentProvider theme={webLightTheme}>
        <EvaFieldRow
          fieldKey="claimantName"
          label="Claimant Name"
          required
          field={field}
          onChange={vi.fn()}
        />
      </FluentProvider>,
    );

    const conflict = screen.getByRole('note', { name: 'Claimant name conflict' });
    expect(conflict.textContent).toContain('Source: Vehicle record');
    expect(screen.getByLabelText(/Source: From vehicle records/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/DVLA|DVSA/);
  });

  it('does not render a stored internal source label for the saved value', () => {
    const field: EvaField = {
      value: '12345',
      reviewState: 'needs_review',
      provenance: {
        sourceType: 'dvla_dvsa',
        sourceLabel: 'DVLA API endpoint payload',
      },
    };

    render(
      <FluentProvider theme={webLightTheme}>
        <EvaFieldRow
          fieldKey="mileage"
          label="Mileage"
          required
          field={field}
          onChange={vi.fn()}
        />
      </FluentProvider>,
    );

    expect(screen.getByLabelText(/From vehicle records/)).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/DVLA|endpoint|payload/i);
  });
});
