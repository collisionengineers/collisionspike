import { describe, expect, it } from 'vitest';
import { shouldLinkReplyToCase } from './reply-link-eligibility.js';

describe('shouldLinkReplyToCase', () => {
  it('keeps ordinary replies on the existing-case link lane', () => {
    expect(shouldLinkReplyToCase({ category: 'query', isReply: true })).toBe(true);
    expect(shouldLinkReplyToCase({ category: 'case_update', isReply: true })).toBe(true);
  });

  it('never links a website enquiry even if a threading header is present', () => {
    expect(shouldLinkReplyToCase({ category: 'website_enquiry', isReply: true })).toBe(false);
  });

  it('does not link a fresh non-reply', () => {
    expect(shouldLinkReplyToCase({ category: 'query', isReply: false })).toBe(false);
  });
});
