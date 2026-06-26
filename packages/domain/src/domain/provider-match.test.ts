import { describe, it, expect } from 'vitest';
import {
  matchProviderByDomain,
  domainOf,
  type ProviderMatchRecord,
} from './provider-match';

/* ----------  Fixtures  ---------- */

const PROVIDERS: ProviderMatchRecord[] = [
  {
    workProviderId: 'wp-acme',
    principalCode: 'acme',
    knownEmailDomains: ['acme.co.uk', 'acme-claims.com'],
    active: true,
  },
  {
    workProviderId: 'wp-globex',
    principalCode: 'glbx',
    knownEmailDomains: ['globex.com'],
    active: true,
  },
  // Inactive provider — must never match even on an exact domain.
  {
    workProviderId: 'wp-old',
    principalCode: 'oldx',
    knownEmailDomains: ['legacy.co.uk'],
    active: false,
  },
  // Two ACTIVE providers sharing a domain -> ambiguous.
  {
    workProviderId: 'wp-share1',
    principalCode: 'sh1',
    knownEmailDomains: ['shared-domain.com'],
    active: true,
  },
  {
    workProviderId: 'wp-share2',
    principalCode: 'sh2',
    knownEmailDomains: ['shared-domain.com'],
    active: true,
  },
];

/* ----------  matched / unmatched / ambiguous  ---------- */

describe('matchProviderByDomain — outcomes', () => {
  it('matched: exact domain after @', () => {
    const r = matchProviderByDomain('claims@acme.co.uk', PROVIDERS);
    expect(r.outcome).toBe('matched');
    expect(r.workProviderId).toBe('wp-acme');
    expect(r.principalCode).toBe('acme');
    expect(r.matchedDomain).toBe('acme.co.uk');
  });

  it('matched: a provider can have multiple domains', () => {
    const r = matchProviderByDomain('intake@acme-claims.com', PROVIDERS);
    expect(r.outcome).toBe('matched');
    expect(r.workProviderId).toBe('wp-acme');
  });

  it('matched: case-insensitive on both sides', () => {
    const r = matchProviderByDomain('Claims@ACME.CO.UK', PROVIDERS);
    expect(r.outcome).toBe('matched');
    expect(r.workProviderId).toBe('wp-acme');
  });

  it('matched: parses a display-name address "<a@b>"', () => {
    const r = matchProviderByDomain('"Acme Claims" <claims@acme.co.uk>', PROVIDERS);
    expect(r.outcome).toBe('matched');
    expect(r.workProviderId).toBe('wp-acme');
  });

  it('unmatched: domain unknown to the corpus', () => {
    const r = matchProviderByDomain('someone@unknown.org', PROVIDERS);
    expect(r.outcome).toBe('unmatched');
    expect(r.workProviderId).toBeUndefined();
    expect(r.principalCode).toBeUndefined();
    expect(r.matchedDomain).toBe('unknown.org');
  });

  it('unmatched: inactive provider is never matched', () => {
    const r = matchProviderByDomain('hi@legacy.co.uk', PROVIDERS);
    expect(r.outcome).toBe('unmatched');
  });

  it('ambiguous: a domain mapping to >1 ACTIVE provider never auto-picks', () => {
    const r = matchProviderByDomain('jobs@shared-domain.com', PROVIDERS);
    expect(r.outcome).toBe('ambiguous');
    expect(r.workProviderId).toBeUndefined();
    expect(r.principalCode).toBeUndefined();
    expect(r.ambiguousProviderIds).toEqual(['wp-share1', 'wp-share2']);
  });
});

/* ----------  No alias / no fuzzy matching  ---------- */

describe('matchProviderByDomain — no alias matching', () => {
  it('does NOT match a subdomain of a known domain', () => {
    const r = matchProviderByDomain('a@mail.acme.co.uk', PROVIDERS);
    expect(r.outcome).toBe('unmatched');
  });

  it('does NOT match a superstring of a known domain', () => {
    const r = matchProviderByDomain('a@acme.co.uk.evil.com', PROVIDERS);
    expect(r.outcome).toBe('unmatched');
  });
});

/* ----------  domainOf edge cases  ---------- */

describe('domainOf', () => {
  it('returns the domain after the last @', () => {
    expect(domainOf('user@acme.co.uk')).toBe('acme.co.uk');
  });
  it('returns empty for an address with no @', () => {
    expect(domainOf('not-an-email')).toBe('');
  });
  it('returns empty for a trailing @', () => {
    expect(domainOf('user@')).toBe('');
  });
  it('returns empty for a domain with no dot', () => {
    expect(domainOf('user@localhost')).toBe('');
  });
  it('unmatched outcome for an unparseable address', () => {
    const r = matchProviderByDomain('garbage', PROVIDERS);
    expect(r.outcome).toBe('unmatched');
    expect(r.matchedDomain).toBe('');
  });
});
