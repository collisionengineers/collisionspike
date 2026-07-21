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

import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_PROVIDER_ENTRY, DEFAULT_EMAIL_TYPE_RULES } from './defaults.js';
import {
  providerRegistryEntryInputSchema,
  type EmailTypeRules,
  type ProviderRegistryEntry,
  type ProviderRegistryEntryInput,
} from './schema.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const PROVIDERS_DIR = join(HERE, 'providers');

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

/** Reads registry/providers/*.json, merges each over the defaults layer, and returns
 * both a lookup Map and a plain array. Throws only on a malformed PRESENT file (bad
 * JSON or schema violation) or an unreadable providers/ directory — never for an
 * absent/unknown provider code. */
export function loadRegistry(): ProviderRegistry {
  let files: string[];
  try {
    files = readdirSync(PROVIDERS_DIR).filter((name) => name.toLowerCase().endsWith('.json'));
  } catch (err) {
    throw new Error(
      `intake-engine: cannot read provider registry directory at ${PROVIDERS_DIR}: ${(err as Error).message}`,
    );
  }

  const all: ProviderRegistryEntry[] = [];
  for (const file of files) {
    const path = join(PROVIDERS_DIR, file);
    const raw = readFileSync(path, 'utf8');

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      throw new Error(`intake-engine: ${file} is not valid JSON: ${(err as Error).message}`);
    }

    const result = providerRegistryEntryInputSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error(`intake-engine: ${file} failed provider registry schema validation: ${result.error.message}`);
    }

    all.push(mergeEntry(result.data));
  }

  const byPrincipalCode = new Map(all.map((entry) => [entry.principalCode, entry]));
  return { byPrincipalCode, all };
}
