// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { InboundEmail } from '@cs/domain';

vi.mock('../data', () => ({
  useInbox: () => ({ data: [], loading: false, error: undefined }),
}));

const { LinkedEmailsPanel } = await import('./LinkedEmailsPanel');

afterEach(cleanup);

function linkedEmail(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    id: 'email-1',
    name: 'Email',
    sourceMessageId: '<message-1@example.test>',
    subject: 'Instruction subject',
    fromAddress: 'sender@example.test',
    senderDomain: 'example.test',
    sourceMailbox: 'desk@collisionengineers.co.uk',
    receivedOn: '2026-07-13T09:00:00Z',
    hasAttachments: false,
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 1,
    classifierMode: 'deterministic',
    signals: [],
    triageState: 'routed',
    bodyVrm: '',
    bodyCaseref: '',
    bodyPreview: 'The saved message text remains readable.',
    caseId: 'case-1',
    ...overrides,
  };
}

describe('LinkedEmailsPanel Outlook fallback', () => {
  it('retains the internal preview when no Outlook target is available', () => {
    render(<LinkedEmailsPanel caseId="case-1" emails={[linkedEmail()]} />);

    fireEvent.click(screen.getByText('Instruction subject'));

    expect(screen.getByText('The saved message text remains readable.')).toBeTruthy();
    expect(screen.queryByRole('link', { name: /View in Outlook/i })).toBeNull();
    expect(screen.getByText(/saved preview is still available/i)).toBeTruthy();
  });
});
