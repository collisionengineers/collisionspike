import { describe, expect, it } from 'vitest';
import { normalizeOutlookWebLink, OUTLOOK_WEB_LINK_HOSTS } from './outlook-link.js';

describe('normalizeOutlookWebLink — exact-message external target', () => {
  it.each(OUTLOOK_WEB_LINK_HOSTS)('keeps an authoritative HTTPS target on %s', (host) => {
    const value = `https://${host}/owa/?ItemID=AAMk-message&exvsurl=1&viewmodel=ReadMessageItem`;
    expect(normalizeOutlookWebLink(value)).toBe(value);
  });

  it.each([
    undefined,
    null,
    '',
    'not a URL',
    'http://outlook.office365.com/owa/?ItemID=message',
    'https://outlook.office365.com.evil.example/owa/?ItemID=message',
    'https://evil.example/owa/?ItemID=message',
    'https://user:password@outlook.office365.com/owa/?ItemID=message',
    'https://outlook.office365.com:444/owa/?ItemID=message',
  ])('rejects an absent or untrusted target: %s', (value) => {
    expect(normalizeOutlookWebLink(value)).toBeUndefined();
  });
});
