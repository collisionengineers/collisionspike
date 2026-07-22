import { describe, it, expect } from 'vitest';
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadRegistry } from '../src/registry/loader.js';
import { DEFAULT_EMAIL_TYPE_RULES } from '../src/registry/defaults.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = resolve(HERE, '..', 'src', 'registry', 'providers');

/**
 * loader.ts uses STATIC IMPORTS rather than a directory scan, because a scan cannot
 * survive the esbuild deploy bundle (see the manifest comment there). The cost is that
 * a new provider JSON must be added to the manifest by hand. This test does the
 * directory scan at TEST time so a forgotten entry fails loudly here instead of
 * silently going missing in production.
 */
describe('provider manifest completeness', () => {
  it('every JSON file in providers/ is present in the loaded registry', () => {
    const onDisk = readdirSync(PROVIDERS_DIR)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort();
    const loaded = loadRegistry();
    expect(loaded.all.length).toBe(onDisk.length);
    // Each file is named <PRINCIPAL>.json, so the principal codes must match the files.
    const loadedCodes = loaded.all.map((entry) => entry.principalCode).sort();
    const fileCodes = onDisk.map((name) => name.replace(/\.json$/i, '')).sort();
    expect(loadedCodes).toEqual(fileCodes);
  });
});

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
