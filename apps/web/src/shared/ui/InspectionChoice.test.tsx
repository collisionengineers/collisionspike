// @vitest-environment jsdom

import { useState } from 'react';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InspectionChoiceControl,
  inspectionChoiceForCase,
  type InspectionChoice,
} from './InspectionChoice';

afterEach(cleanup);

function Harness({ initial }: { initial: InspectionChoice }) {
  const [choice, setChoice] = useState(initial);
  const [reason, setReason] = useState('');
  const [changed, setChanged] = useState(false);
  return (
    <InspectionChoiceControl
      choice={choice}
      onChoiceChange={(next) => {
        setChoice(next);
        setChanged(next === 'image_based');
      }}
      reason={reason}
      onReasonChange={setReason}
      requireReason={changed && choice === 'image_based'}
    >
      <label>
        Search locations
        <input />
      </label>
    </InspectionChoiceControl>
  );
}

describe('InspectionChoiceControl', () => {
  it('shows address controls by default without inferring Image Based Assessment', () => {
    expect(inspectionChoiceForCase({ inspectionDecision: 'unknown' })).toBe('address');
    expect(inspectionChoiceForCase({ inspectionDecision: 'manual' })).toBe('address');

    render(<Harness initial="address" />);
    expect((screen.getByRole('radio', { name: 'Inspection address' }) as HTMLInputElement).checked)
      .toBe(true);
    expect(screen.getByLabelText('Search locations')).toBeTruthy();
    expect(screen.queryByLabelText(/^Reason/)).toBeNull();
  });

  it('reflects a saved image-based decision and hides every address control', () => {
    expect(inspectionChoiceForCase({ inspectionDecision: 'image_based' })).toBe('image_based');

    render(<Harness initial="image_based" />);
    expect(
      (screen.getByRole('radio', { name: 'Image Based Assessment' }) as HTMLInputElement).checked,
    ).toBe(true);
    expect(screen.queryByLabelText('Search locations')).toBeNull();
    expect(screen.queryByLabelText(/^Reason/)).toBeNull();
  });

  it('switches reversibly and retains the assessment reason until Save owns persistence', async () => {
    const user = userEvent.setup();
    render(<Harness initial="address" />);

    await user.click(screen.getByRole('radio', { name: 'Image Based Assessment' }));
    const reason = screen.getByLabelText(/^Reason/);
    await user.type(reason, 'Requested for this case');
    expect(screen.queryByLabelText('Search locations')).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Inspection address' }));
    expect(screen.getByLabelText('Search locations')).toBeTruthy();
    expect(screen.queryByLabelText(/^Reason/)).toBeNull();

    await user.click(screen.getByRole('radio', { name: 'Image Based Assessment' }));
    expect((screen.getByLabelText(/^Reason/) as HTMLTextAreaElement).value)
      .toBe('Requested for this case');
  });
});
