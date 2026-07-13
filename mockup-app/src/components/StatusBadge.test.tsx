// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { REASON_LABELS } from '@cs/domain';
import { StatusBadge, statusLabel } from './StatusBadge';

afterEach(cleanup);

describe('case status handler language', () => {
  it('renders the generic incomplete status as Not ready', () => {
    render(<StatusBadge status="needs_review" />);
    expect(screen.getByText('Not ready')).toBeTruthy();
    expect(statusLabel('needs_review')).toBe('Not ready');
    expect(REASON_LABELS.needs_review).toBe('Not ready');
    expect(screen.queryByText('Needs review')).toBeNull();
  });

  it('retains specific blocker labels', () => {
    expect(statusLabel('missing_required_fields')).toBe('Missing fields');
    expect(statusLabel('missing_images')).toBe('Missing images');
    expect(statusLabel('duplicate_risk')).toBe('Duplicate risk');
    expect(statusLabel('error')).toBe('Error');
  });
});
