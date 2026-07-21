import { describe, it, expect } from 'vitest';
import { loadRegistry } from '../src/registry/loader.js';
import { DEFAULT_EMAIL_TYPE_RULES } from '../src/registry/defaults.js';

describe('loadRegistry', () => {
  it('loads both seeded providers', () => {
    const registry = loadRegistry();
    expect(registry.all.length).toBe(2);
    expect(registry.byPrincipalCode.has('QDOS')).toBe(true);
    expect(registry.byPrincipalCode.has('CNX')).toBe(true);
  });

  it('QDOS: identity fields from its own file, dual-commissioning phrase inherited from defaults', () => {
    const registry = loadRegistry();
    const qdos = registry.byPrincipalCode.get('QDOS')!;
    expect(qdos.relationship).toBe('direct');
    expect(qdos.knownEmailDomains).toEqual(['qdosassist.co.uk']);
    // QDOS.json does not set dualCommissioningPhrases -> falls back to the default.
    expect(qdos.emailTypeRules.dualCommissioningPhrases).toEqual(DEFAULT_EMAIL_TYPE_RULES.dualCommissioningPhrases);
    // QDOS.json DOES set its own audit signal/verdict phrases.
    expect(qdos.emailTypeRules.auditSignalPhrases.length).toBeGreaterThan(0);
  });

  it('CNX: a provider entry with only identity fields set still gets a fully typed, defaulted emailTypeRules without throwing', () => {
    const registry = loadRegistry();
    const cnx = registry.byPrincipalCode.get('CNX')!;
    expect(cnx.relationship).toBe('intermediary');
    expect(cnx.emailTypeRules).toEqual(DEFAULT_EMAIL_TYPE_RULES);
    expect(cnx.caseTypeMarkers).toEqual([]);
    expect(cnx.candidatePrincipals.map((c) => c.principalCode).sort()).toEqual(['PCH', 'SBL']);
  });

  it('an unknown/missing provider code is simply absent, not an error', () => {
    const registry = loadRegistry();
    expect(() => registry.byPrincipalCode.get('DOES_NOT_EXIST')).not.toThrow();
    expect(registry.byPrincipalCode.get('DOES_NOT_EXIST')).toBeUndefined();
  });
});
