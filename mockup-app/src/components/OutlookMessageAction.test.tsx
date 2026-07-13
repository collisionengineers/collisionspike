// @vitest-environment jsdom

import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { InboundEmail } from '@cs/domain';
import { OutlookMessageAction } from './OutlookMessageAction';

afterEach(cleanup);

function email(overrides: Partial<InboundEmail> = {}): InboundEmail {
  return {
    id: 'email-1',
    name: 'Email',
    sourceMessageId: '<message-1@example.test>',
    subject: 'Instruction',
    fromAddress: 'sender@example.test',
    senderDomain: 'example.test',
    sourceMailbox: 'info@collisionengineers.co.uk',
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
    bodyPreview: 'Saved email text',
    ...overrides,
  };
}

describe('OutlookMessageAction', () => {
  it('opens Graph\'s exact message target without giving the new tab opener control', () => {
    const outlookWebLink =
      'https://outlook.office365.com/owa/?ItemID=AAMk-message&exvsurl=1&viewmodel=ReadMessageItem';
    render(<OutlookMessageAction email={email({ outlookWebLink })} />);

    const link = screen.getByRole('link', { name: /View in Outlook/i });
    expect(link.getAttribute('href')).toBe(outlookWebLink);
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('keeps an honest saved-preview outcome when the row has no link', () => {
    render(<OutlookMessageAction email={email()} />);

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('status').textContent).toMatch(/saved preview is still available/i);
  });

  it('rejects an unexpected host at the final rendering boundary', () => {
    render(
      <OutlookMessageAction
        email={email({
          outlookWebLink: 'https://outlook.office365.com.evil.example/owa/?ItemID=message',
        })}
      />,
    );

    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('status')).toBeTruthy();
  });
});
