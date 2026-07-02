import { describe, it, expect } from 'vitest';
import { matchSenderIdentity, type ImageSourceMatchRecord } from './sender-identity-match';
import type { ProviderMatchRecord } from './provider-match';

/* ----------  Fixtures  ---------- */

const PROVIDERS: ProviderMatchRecord[] = [
  { workProviderId: 'wp-pch', principalCode: 'PCH', knownEmailDomains: ['pch-ltd.com'], active: true },
  { workProviderId: 'wp-sbl', principalCode: 'SBL', knownEmailDomains: ['sbl-claims.co.uk'], active: true },
  { workProviderId: 'wp-acme', principalCode: 'ACME', knownEmailDomains: ['acme.co.uk'], active: true },
  // Two ACTIVE providers sharing a domain, with NO registered intermediary for it ->
  // matchProviderByDomain's own 'ambiguous' outcome should still surface.
  { workProviderId: 'wp-share1', principalCode: 'SH1', knownEmailDomains: ['shared-domain.com'], active: true },
  { workProviderId: 'wp-share2', principalCode: 'SH2', knownEmailDomains: ['shared-domain.com'], active: true },
];

// ADR-0011's own worked example: Connexus routes for PCH and SBL.
const IMAGE_SOURCES: ImageSourceMatchRecord[] = [
  {
    imageSourceId: 'is-connexus',
    name: 'Connexus',
    emailDomain: 'connexus.co.uk',
    kind: 'intermediary',
    candidateProviderIds: ['wp-pch', 'wp-sbl'],
  },
];

/* ----------  Table-driven: top-level kind by sender  ---------- */

describe.each([
  ['a direct provider domain with no intermediary registered', 'claims@pch-ltd.com', 'provider'],
  ['a registered intermediary domain', 'claims@connexus.co.uk', 'intermediary'],
  ['a domain matching neither corpus', 'someone@unknown.org', 'none'],
  ['an unparseable sender address', 'garbage', 'none'],
])('matchSenderIdentity — %s', (_label, sender, expectedKind) => {
  it(`resolves kind = '${expectedKind}'`, () => {
    const r = matchSenderIdentity(sender, PROVIDERS, IMAGE_SOURCES);
    expect(r.kind).toBe(expectedKind);
  });
});

/* ----------  Direct provider match (as today)  ---------- */

describe('matchSenderIdentity — direct provider (wraps matchProviderByDomain verbatim)', () => {
  it('a direct provider domain match carries the full ProviderMatchResult through', () => {
    const r = matchSenderIdentity('claims@pch-ltd.com', PROVIDERS, IMAGE_SOURCES);
    expect(r.kind).toBe('provider');
    if (r.kind !== 'provider') throw new Error('expected provider');
    expect(r.result.outcome).toBe('matched');
    expect(r.result.workProviderId).toBe('wp-pch');
    expect(r.result.principalCode).toBe('PCH');
    expect(r.result.matchedBy).toBe('domain');
  });

  it('a domain-level ambiguous provider match (no registered intermediary) still surfaces as provider/ambiguous', () => {
    const r = matchSenderIdentity('jobs@shared-domain.com', PROVIDERS, IMAGE_SOURCES);
    expect(r.kind).toBe('provider');
    if (r.kind !== 'provider') throw new Error('expected provider');
    expect(r.result.outcome).toBe('ambiguous');
    expect(r.result.ambiguousProviderIds).toEqual(['wp-share1', 'wp-share2']);
  });
});

/* ----------  Intermediary resolution + candidates  ---------- */

describe('matchSenderIdentity — intermediary', () => {
  it('resolves a registered intermediary domain with its N:N candidate providers', () => {
    const r = matchSenderIdentity('claims@connexus.co.uk', PROVIDERS, IMAGE_SOURCES);
    expect(r).toEqual({
      kind: 'intermediary',
      imageSourceId: 'is-connexus',
      name: 'Connexus',
      candidateProviderIds: ['wp-pch', 'wp-sbl'],
      matchedDomain: 'connexus.co.uk',
    });
  });

  it('matches case-insensitively and tolerates stray whitespace on the stored emailDomain', () => {
    const messy: ImageSourceMatchRecord[] = [
      {
        imageSourceId: 'is-connexus',
        name: 'Connexus',
        emailDomain: '  CONNEXUS.CO.UK  ',
        kind: 'intermediary',
        candidateProviderIds: ['wp-pch'],
      },
    ];
    const r = matchSenderIdentity('Claims@Connexus.CO.UK', PROVIDERS, messy);
    expect(r.kind).toBe('intermediary');
  });

  it('tolerates an intermediary with an empty candidateProviderIds (N:N not yet linked)', () => {
    const bare: ImageSourceMatchRecord[] = [
      {
        imageSourceId: 'is-newco',
        name: 'NewCo Claims',
        emailDomain: 'newco-claims.example',
        kind: 'intermediary',
        candidateProviderIds: [],
      },
    ];
    const r = matchSenderIdentity('hello@newco-claims.example', PROVIDERS, bare);
    expect(r).toEqual({
      kind: 'intermediary',
      imageSourceId: 'is-newco',
      name: 'NewCo Claims',
      candidateProviderIds: [],
      matchedDomain: 'newco-claims.example',
    });
  });

  it('ignores an image_source row whose kind is not intermediary, even on a domain hit (defensive re-assertion)', () => {
    const nonIntermediary: ImageSourceMatchRecord[] = [
      {
        imageSourceId: 'is-repairer',
        name: "Smith's Garage",
        emailDomain: 'smithsgarage.example',
        kind: 'repairer',
        candidateProviderIds: [],
      },
    ];
    const r = matchSenderIdentity('info@smithsgarage.example', PROVIDERS, nonIntermediary);
    expect(r).toEqual({ kind: 'none', matchedDomain: 'smithsgarage.example' });
  });
});

/* ----------  Precedence (documented + tested per the ADR-0011 build note)  ----------
   address-level provider match > intermediary > domain-level provider match. */

describe('matchSenderIdentity — precedence', () => {
  it('an intermediary domain resolves to intermediary even if ERRONEOUSLY also present on a WorkProvider (defensive de-collision)', () => {
    // A de-collision miss: some WorkProvider's knownEmailDomains still (wrongly) lists
    // the intermediary's own domain. ADR-0011 says this should never happen post
    // de-collision (see the seed delta), but matchSenderIdentity must not mis-resolve
    // the sender as a direct provider if it does.
    const dirtyProviders: ProviderMatchRecord[] = [
      ...PROVIDERS,
      { workProviderId: 'wp-bad', principalCode: 'BAD', knownEmailDomains: ['connexus.co.uk'], active: true },
    ];
    const r = matchSenderIdentity('claims@connexus.co.uk', dirtyProviders, IMAGE_SOURCES);
    expect(r.kind).toBe('intermediary');
  });

  it('an ADDRESS-LEVEL provider match beats a domain-level intermediary match on the SAME domain (915 precedent)', () => {
    // 915_corpus_email_address_match.sql shows address-level overrides are a real, live
    // signal (curated exceptions for a specific sender address) — they must out-rank
    // even a genuine intermediary domain match.
    const providersWithAddressOverride: ProviderMatchRecord[] = [
      ...PROVIDERS,
      {
        workProviderId: 'wp-vip',
        principalCode: 'VIP',
        knownEmailDomains: [],
        knownEmailAddresses: ['vip@connexus.co.uk'],
        active: true,
      },
    ];
    const r = matchSenderIdentity('vip@connexus.co.uk', providersWithAddressOverride, IMAGE_SOURCES);
    expect(r.kind).toBe('provider');
    if (r.kind !== 'provider') throw new Error('expected provider');
    expect(r.result.matchedBy).toBe('address');
    expect(r.result.workProviderId).toBe('wp-vip');
  });

  it('an ambiguous ADDRESS-LEVEL provider match still beats a domain-level intermediary match', () => {
    const twoAddressHits: ProviderMatchRecord[] = [
      { workProviderId: 'a1', principalCode: 'A1', knownEmailDomains: [], knownEmailAddresses: ['vip@connexus.co.uk'], active: true },
      { workProviderId: 'a2', principalCode: 'A2', knownEmailDomains: [], knownEmailAddresses: ['vip@connexus.co.uk'], active: true },
    ];
    const r = matchSenderIdentity('vip@connexus.co.uk', twoAddressHits, IMAGE_SOURCES);
    expect(r.kind).toBe('provider');
    if (r.kind !== 'provider') throw new Error('expected provider');
    expect(r.result.outcome).toBe('ambiguous');
    expect(r.result.matchedBy).toBe('address');
  });
});

/* ----------  None  ---------- */

describe('matchSenderIdentity — none', () => {
  it('an unparseable sender address resolves to none with an empty matchedDomain', () => {
    const r = matchSenderIdentity('garbage', PROVIDERS, IMAGE_SOURCES);
    expect(r).toEqual({ kind: 'none', matchedDomain: '' });
  });

  it('a domain matching neither corpus resolves to none, carrying the parsed domain', () => {
    const r = matchSenderIdentity('someone@unknown.org', PROVIDERS, IMAGE_SOURCES);
    expect(r).toEqual({ kind: 'none', matchedDomain: 'unknown.org' });
  });
});
