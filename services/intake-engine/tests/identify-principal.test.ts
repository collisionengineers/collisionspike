import { describe, it, expect } from 'vitest';
import { identifyPrincipal } from '../src/pipeline/identify-principal.js';
import type { ProviderRegistryEntry } from '../src/registry/schema.js';

function entry(overrides: Partial<ProviderRegistryEntry> & { principalCode: string }): ProviderRegistryEntry {
  return {
    relationship: 'direct',
    active: true,
    knownEmailDomains: [],
    knownEmailAddresses: [],
    candidatePrincipals: [],
    caseTypeMarkers: [],
    emailTypeRules: {
      dualCommissioningPhrases: [],
      auditSignalPhrases: [],
      auditRepairableVerdictPhrases: [],
      auditTotalLossVerdictPhrases: [],
    },
    ...overrides,
  };
}

describe('identifyPrincipal', () => {
  it('direct match: exact domain after @', () => {
    const registry = [entry({ principalCode: 'ACME', knownEmailDomains: ['acme.co.uk'] })];
    const result = identifyPrincipal('claims@acme.co.uk', registry);
    expect(result.outcome).toBe('matched');
    expect(result.principalCode).toBe('ACME');
    expect(result.matchedBy).toBe('domain');
  });

  it('ambiguous: 2 active providers share the same domain', () => {
    const registry = [
      entry({ principalCode: 'SH1', knownEmailDomains: ['shared.com'] }),
      entry({ principalCode: 'SH2', knownEmailDomains: ['shared.com'] }),
    ];
    const result = identifyPrincipal('claims@shared.com', registry);
    expect(result.outcome).toBe('ambiguous');
    expect(result.ambiguousPrincipalCodes?.sort()).toEqual(['SH1', 'SH2']);
  });

  it('an inactive provider never matches, even on an exact domain', () => {
    const registry = [entry({ principalCode: 'OLD', knownEmailDomains: ['legacy.co.uk'], active: false })];
    const result = identifyPrincipal('claims@legacy.co.uk', registry);
    expect(result.outcome).toBe('unmatched');
  });

  it('intermediary detection: >1 candidate principals -> "intermediary" outcome, never auto-picked', () => {
    const registry = [
      entry({
        principalCode: 'CNX',
        relationship: 'intermediary',
        knownEmailDomains: ['connexus.co.uk'],
        candidatePrincipals: [
          { principalCode: 'PCH', contentSignals: ['PCH'] },
          { principalCode: 'SBL', contentSignals: ['SBL'] },
        ],
      }),
    ];
    const result = identifyPrincipal('ops@connexus.co.uk', registry);
    expect(result.outcome).toBe('intermediary');
    expect(result.intermediaryCode).toBe('CNX');
    expect(result.candidatePrincipalCodes?.sort()).toEqual(['PCH', 'SBL']);
    expect(result.principalCode).toBeUndefined();
  });

  it('an intermediary with exactly 1 candidate resolves directly, no ambiguity', () => {
    const registry = [
      entry({
        principalCode: 'SOLO',
        relationship: 'intermediary',
        knownEmailDomains: ['solo-portal.com'],
        candidatePrincipals: [{ principalCode: 'ONLYCO', contentSignals: [] }],
      }),
    ];
    const result = identifyPrincipal('ops@solo-portal.com', registry);
    expect(result.outcome).toBe('matched');
    expect(result.principalCode).toBe('ONLYCO');
  });

  it('an intermediary with 0 candidates is a misconfiguration -> needs_review', () => {
    const registry = [
      entry({
        principalCode: 'BROKEN',
        relationship: 'intermediary',
        knownEmailDomains: ['broken-portal.com'],
        candidatePrincipals: [],
      }),
    ];
    const result = identifyPrincipal('ops@broken-portal.com', registry);
    expect(result.outcome).toBe('needs_review');
    expect(result.intermediaryCode).toBe('BROKEN');
  });

  it('unmatched sender: no registry entry claims the domain', () => {
    const registry = [entry({ principalCode: 'ACME', knownEmailDomains: ['acme.co.uk'] })];
    const result = identifyPrincipal('claims@nowhere.example', registry);
    expect(result.outcome).toBe('unmatched');
    expect(result.matchedDomain).toBe('nowhere.example');
  });

  it('a full-address match takes precedence over a domain match', () => {
    const registry = [
      entry({ principalCode: 'GMAIL_PROVIDER', knownEmailDomains: [], knownEmailAddresses: ['ops@gmail.com'] }),
      entry({ principalCode: 'GENERIC', knownEmailDomains: ['gmail.com'] }),
    ];
    const result = identifyPrincipal('ops@gmail.com', registry);
    expect(result.outcome).toBe('matched');
    expect(result.principalCode).toBe('GMAIL_PROVIDER');
    expect(result.matchedBy).toBe('address');
  });
});
