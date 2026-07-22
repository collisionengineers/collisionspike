/* ============================================================
   Collision Engineers — intake-engine registry LOADER.

   `loadRegistry()` is the ONLY function anywhere in this package that reads provider
   config off disk. Every pipeline stage receives an already-merged, already-typed
   `ProviderRegistryEntry` (or the whole `ProviderRegistry`) — never a raw JSON file.
   If a future stage needs a new provider field, it goes through schema.ts +
   defaults.ts + this file first; it must never grow its own `readFileSync`.

   Merge contract: for each *.json file under registry/providers/, parse -> validate
   against `providerRegistryEntryInputSchema` -> merge every omitted field from
   defaults.ts (registry/defaults.ts's `DEFAULT_PROVIDER_ENTRY` /
   `DEFAULT_EMAIL_TYPE_RULES`). A provider file supplying only identity fields
   (principalCode + knownEmailDomains) still comes out the other end with a complete,
   typed `emailTypeRules` etc. — never throws for an omitted field.

   A provider code with NO file present is simply absent from the returned registry —
   not an error. Only a PRESENT file that fails to parse as JSON or fails schema
   validation throws (that's a real authoring mistake, not "unregistered").
   ============================================================ */

import CNX from './providers/CNX.json';
import QDOS from './providers/QDOS.json';
import { DEFAULT_PROVIDER_ENTRY, DEFAULT_EMAIL_TYPE_RULES } from './defaults.js';
import {
  providerRegistryEntryInputSchema,
  type EmailTypeRules,
  type ProviderRegistryEntry,
  type ProviderRegistryEntryInput,
} from './schema.js';

/**
 * The provider registry manifest. STATIC IMPORTS, not a directory scan.
 *
 * A `readdirSync(join(import.meta.url, 'providers'))` scan cannot survive deployment:
 * the orchestration service ships as a single esbuild bundle, so that path resolves to
 * `<wwwroot>/providers` — which does not exist, and the JSON is not copied into the
 * artifact — making every registry read throw in production while CI stays green
 * (ci.yml only `require`s the bundle). Static imports are inlined by esbuild, so the
 * registry data travels inside the bundle itself.
 *
 * ADDING A PROVIDER: drop the JSON in providers/ AND add it here. `registry.test.ts`
 * scans the directory at TEST time and fails if any file is missing from this list, so
 * a forgotten entry cannot slip through silently.
 */
const PROVIDER_FILES: ReadonlyArray<{ file: string; data: unknown }> = [
  { file: 'CNX.json', data: CNX },
  { file: 'QDOS.json', data: QDOS },
];

function mergeEmailTypeRules(input: ProviderRegistryEntryInput['emailTypeRules']): EmailTypeRules {
  return {
    dualCommissioningPhrases: input?.dualCommissioningPhrases ?? DEFAULT_EMAIL_TYPE_RULES.dualCommissioningPhrases,
    auditSignalPhrases: input?.auditSignalPhrases ?? DEFAULT_EMAIL_TYPE_RULES.auditSignalPhrases,
    auditRepairableVerdictPhrases:
      input?.auditRepairableVerdictPhrases ?? DEFAULT_EMAIL_TYPE_RULES.auditRepairableVerdictPhrases,
    auditTotalLossVerdictPhrases:
      input?.auditTotalLossVerdictPhrases ?? DEFAULT_EMAIL_TYPE_RULES.auditTotalLossVerdictPhrases,
  };
}

function mergeEntry(input: ProviderRegistryEntryInput): ProviderRegistryEntry {
  return {
    principalCode: input.principalCode,
    relationship: input.relationship ?? DEFAULT_PROVIDER_ENTRY.relationship,
    active: input.active ?? DEFAULT_PROVIDER_ENTRY.active,
    knownEmailDomains: input.knownEmailDomains ?? [],
    knownEmailAddresses: input.knownEmailAddresses ?? DEFAULT_PROVIDER_ENTRY.knownEmailAddresses,
    candidatePrincipals: input.candidatePrincipals ?? DEFAULT_PROVIDER_ENTRY.candidatePrincipals,
    caseTypeMarkers: input.caseTypeMarkers ?? DEFAULT_PROVIDER_ENTRY.caseTypeMarkers,
    emailTypeRules: mergeEmailTypeRules(input.emailTypeRules),
  };
}

export interface ProviderRegistry {
  byPrincipalCode: Map<string, ProviderRegistryEntry>;
  all: ProviderRegistryEntry[];
}

/** Merges each manifest provider over the defaults layer and returns both a lookup Map
 * and a plain array. Pure — no I/O, so it behaves identically in the repo, in tests, and
 * inside the deployed single-file bundle. Throws only on a provider that fails schema
 * validation (a real authoring mistake) — never for an absent/unknown provider code.
 * A malformed-JSON case can no longer occur at runtime: the imports are parsed at build
 * time, so bad JSON is a compile error instead. */
export function loadRegistry(): ProviderRegistry {
  const all: ProviderRegistryEntry[] = [];
  for (const { file, data } of PROVIDER_FILES) {
    const result = providerRegistryEntryInputSchema.safeParse(data);
    if (!result.success) {
      throw new Error(`intake-engine: ${file} failed provider registry schema validation: ${result.error.message}`);
    }

    all.push(mergeEntry(result.data));
  }

  const byPrincipalCode = new Map(all.map((entry) => [entry.principalCode, entry]));
  return { byPrincipalCode, all };
}
