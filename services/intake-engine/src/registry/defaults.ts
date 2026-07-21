/* ============================================================
   Collision Engineers — intake-engine registry FALLBACK LAYER.

   Ships mostly empty on purpose: no general classification rules are confirmed yet
   for this from-scratch rebuild. What IS here:
     - A typed, structurally-complete default for every field a provider entry may
       omit, so loader.ts (and every pipeline stage downstream of it) never has to
       special-case a missing field or throw.
     - ONE seeded default: `dualCommissioningPhrases` ships with QDOS's real
       real-world template phrase ("REPORT + AUDIT REPORT") as the generic default —
       confirmed during the original scoping for this rebuild. Any provider can
       override/extend it; QDOS.json currently doesn't need to, since it wants exactly
       this phrase.

   Choice of "defaults as pure TS" vs. "a _defaults.json under providers/": this
   package uses pure TS (this file). A JSON default file living inside providers/
   would need to be excluded from "every *.json under providers/ is a provider" by
   loader.ts, which is an easy rule to get wrong later (miss the exclusion once and a
   defaults file silently becomes a phantom provider entry). A plain TS module has no
   such failure mode and gives full type-checking on the default values themselves.
   ============================================================ */

import type { EmailTypeRules, ProviderRegistryEntry } from './schema.js';

export const DEFAULT_EMAIL_TYPE_RULES: EmailTypeRules = {
  dualCommissioningPhrases: ['REPORT + AUDIT REPORT'],
  auditSignalPhrases: [],
  auditRepairableVerdictPhrases: [],
  auditTotalLossVerdictPhrases: [],
};

/** Every field a provider entry may omit, with its fallback value. Deliberately
 * excludes `principalCode` and `knownEmailDomains` — those are identity fields with no
 * meaningful universal default; a provider JSON file must state its own domains (it
 * may state an empty list explicitly if it truly has none, e.g. an intermediary
 * matched only by content signals downstream). */
export const DEFAULT_PROVIDER_ENTRY: Omit<ProviderRegistryEntry, 'principalCode' | 'knownEmailDomains'> = {
  relationship: 'direct',
  active: true,
  knownEmailAddresses: [],
  candidatePrincipals: [],
  caseTypeMarkers: [],
  emailTypeRules: DEFAULT_EMAIL_TYPE_RULES,
};

/**
 * Build a fully-defaulted entry for a principal code the registry has no JSON file
 * for at all (e.g. an intermediary's candidate principal that hasn't been onboarded
 * with its own file yet — see resolve-intermediary-principal.ts / pipeline.ts). This
 * is the "entry omits EVERY field" case, handled the same way a partial entry is.
 */
export function defaultEntryFor(principalCode: string): ProviderRegistryEntry {
  return {
    principalCode,
    knownEmailDomains: [],
    ...DEFAULT_PROVIDER_ENTRY,
  };
}
