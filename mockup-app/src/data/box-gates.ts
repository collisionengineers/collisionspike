/* ============================================================
   Collision Engineers — Code App: BOX_* feature-gate read (PURE core).

   Code Apps have NO native environment-variable mechanism (verified — Microsoft
   guidance is "store values in Dataverse … and read them at runtime"). So the
   BOX_* gates are read the SAME way the `finalize-eva-box` flow reads
   `EVA_API_ENABLED`: off the two platform tables that back every Power Platform
   env-var — the DEFINITION (schemaname + defaultvalue) and the VALUE (the current
   override). This module holds ONLY the pure coalescing math (rows -> BoxGates),
   so it is unit-testable with no SDK/React/Dataverse dependency. The Dataverse
   source (dataverse-source.ts) does the table fetch + caching and calls in here.

   Rules (load-bearing):
     - value ?? defaultvalue ?? 'false', case-insensitively === 'true'.
     - EVERY gate defaults FALSE; an unknown/missing definition is FALSE.
     - the whole object defaults all-false on a read failure (honest off).
     - fileRequestTemplateConfigured is a NON-BOOLEAN derive: the
       cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID value is a non-empty string.
   ============================================================ */

import {
  BOX_GATES_ALL_FALSE,
  LOCATION_ASSIST_GATE_ALL_OFF,
  type BoxGates,
  type LocationAssistGate,
} from './types';
import type {
  EnvironmentVariableDefinitionRecord,
  EnvironmentVariableValueRecord,
} from './types';

/** The five Boolean BOX_* gate schema names, mapped to their BoxGates key. */
export const BOX_GATE_SCHEMA_NAMES = {
  cr1bd_BOX_API_ENABLED: 'apiEnabled',
  cr1bd_BOX_FOLDER_AT_INTAKE_ENABLED: 'folderAtIntakeEnabled',
  cr1bd_BOX_FILEREQUEST_ENABLED: 'fileRequestEnabled',
  cr1bd_BOX_EMBED_ENABLED: 'embedEnabled',
  cr1bd_BOX_METADATA_ENABLED: 'metadataEnabled',
} as const satisfies Record<string, keyof BoxGates>;

/** The String config var whose non-empty value flips fileRequestTemplateConfigured. */
export const BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA = 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID';

/** All schema names the gate read needs to fetch (5 Booleans + 1 template-id). */
export const BOX_ENV_VAR_SCHEMA_NAMES: readonly string[] = [
  ...Object.keys(BOX_GATE_SCHEMA_NAMES),
  BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA,
];

/** Parse an env-var string to a strict boolean ('true', case-insensitive). */
export function envValueToBool(raw: string | undefined | null): boolean {
  return (raw ?? '').trim().toLowerCase() === 'true';
}

/** A resolved env-var: its schema name + the coalesced value (value ?? default ?? ''). */
export interface ResolvedEnvVar {
  schemaName: string;
  /** value ?? defaultvalue ?? '' — already coalesced; never null/undefined. */
  value: string;
}

/**
 * Coalesce definition + value rows into one resolved value per schema name.
 *
 * The VALUE row joins to its DEFINITION via
 * `_environmentvariabledefinitionid_value`. A definition with no value row falls
 * back to its `defaultvalue`; a missing default falls back to ''. Only the BOX_*
 * schema names are kept (others ignored). Robust to partial $select: any absent
 * field is treated as empty.
 */
export function resolveEnvVars(
  definitions: readonly EnvironmentVariableDefinitionRecord[],
  values: readonly EnvironmentVariableValueRecord[],
): ResolvedEnvVar[] {
  // Index value rows by their owning definition id (last write wins — there is at
  // most one value row per definition in a given environment).
  const valueByDefId = new Map<string, string | undefined>();
  for (const v of values) {
    const defId = v._environmentvariabledefinitionid_value;
    if (defId) valueByDefId.set(defId, v.value);
  }

  const resolved: ResolvedEnvVar[] = [];
  for (const def of definitions) {
    const schemaName = def.schemaname;
    if (!schemaName) continue;
    const defId = def.environmentvariabledefinitionid;
    const overridden = defId ? valueByDefId.get(defId) : undefined;
    // value ?? defaultvalue ?? '' — note '' is a VALID override (used to mean
    // "unset" for the template id), so only null/undefined fall through.
    const coalesced = overridden ?? def.defaultvalue ?? '';
    resolved.push({ schemaName, value: coalesced });
  }
  return resolved;
}

/**
 * Build a `BoxGates` from resolved env-vars. Unknown schema names are ignored;
 * any BOX_* gate absent from the input stays FALSE (the all-false baseline). The
 * template-id gate is non-empty-string truthiness, NOT boolean parsing.
 */
export function boxGatesFromResolved(resolved: readonly ResolvedEnvVar[]): BoxGates {
  const gates: BoxGates = { ...BOX_GATES_ALL_FALSE };
  for (const { schemaName, value } of resolved) {
    if (schemaName === BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA) {
      gates.fileRequestTemplateConfigured = value.trim().length > 0;
      continue;
    }
    const key = (BOX_GATE_SCHEMA_NAMES as Record<string, keyof BoxGates>)[schemaName];
    if (key) gates[key] = envValueToBool(value);
  }
  return gates;
}

/** Definition + value rows -> BoxGates, in one call (the dataverse-source path). */
export function boxGatesFromRows(
  definitions: readonly EnvironmentVariableDefinitionRecord[],
  values: readonly EnvironmentVariableValueRecord[],
): BoxGates {
  return boxGatesFromResolved(resolveEnvVars(definitions, values));
}

/* ----------  Location-assist gate (Phase 4a) — same env-var coalescing core ----------
   The reviewer-invoked "Suggest location" assist is shown ONLY when its master
   gate, the paired Maps gate, AND the per-env API-base config var are all set.
   Read off the same DEFINITION/VALUE platform tables as the BOX_* gates; every
   part defaults off, and the whole gate is off on any read failure (honest off).
   The Code App READS this (never writes it); the Function never reads it. */
export const LOCATION_ASSIST_ENABLED_SCHEMA = 'cr1bd_LOCATION_ASSIST_ENABLED';
/** The PAIRED Maps gate — reused (not overloaded into AZURE_VISION) per spec. */
export const AZURE_MAPS_ENABLED_SCHEMA = 'cr1bd_AZURE_MAPS_ENABLED';
/** Per-env config var whose non-empty value flips apiBaseConfigured. */
export const LOCATION_ASSIST_API_BASE_SCHEMA = 'cr1bd_LOCATION_ASSIST_API_BASE';

/** All schema names the location-assist gate read needs (2 Booleans + 1 base). */
export const LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES: readonly string[] = [
  LOCATION_ASSIST_ENABLED_SCHEMA,
  AZURE_MAPS_ENABLED_SCHEMA,
  LOCATION_ASSIST_API_BASE_SCHEMA,
];

/**
 * Build a `LocationAssistGate` from resolved env-vars. `enabled` is the AND of the
 * two Boolean gates and a non-empty API base; any missing part keeps the gate off.
 */
export function locationAssistGateFromResolved(
  resolved: readonly ResolvedEnvVar[],
): LocationAssistGate {
  const gate: LocationAssistGate = { ...LOCATION_ASSIST_GATE_ALL_OFF };
  for (const { schemaName, value } of resolved) {
    if (schemaName === LOCATION_ASSIST_ENABLED_SCHEMA) gate.assistEnabled = envValueToBool(value);
    else if (schemaName === AZURE_MAPS_ENABLED_SCHEMA) gate.mapsEnabled = envValueToBool(value);
    else if (schemaName === LOCATION_ASSIST_API_BASE_SCHEMA) {
      gate.apiBaseConfigured = value.trim().length > 0;
    }
  }
  gate.enabled = gate.assistEnabled && gate.mapsEnabled && gate.apiBaseConfigured;
  return gate;
}

/** Definition + value rows -> LocationAssistGate, in one call (dataverse-source path). */
export function locationAssistGateFromRows(
  definitions: readonly EnvironmentVariableDefinitionRecord[],
  values: readonly EnvironmentVariableValueRecord[],
): LocationAssistGate {
  return locationAssistGateFromResolved(resolveEnvVars(definitions, values));
}

/* ----------  App intake preference: hold new cases by default  ----------
   Unlike the BOX_* gates (read-only), the Code App also WRITES this one (the
   Admin toggle upserts its value). The read path reuses the same coalescing core. */
export const HOLD_NEW_CASES_SCHEMA = 'cr1bd_HOLD_NEW_CASES_BY_DEFAULT';

/** Resolve the hold-new-cases preference from env-var rows (false on absence). */
export function holdNewCasesFromRows(
  definitions: readonly EnvironmentVariableDefinitionRecord[],
  values: readonly EnvironmentVariableValueRecord[],
): boolean {
  const row = resolveEnvVars(definitions, values).find(
    (r) => r.schemaName === HOLD_NEW_CASES_SCHEMA,
  );
  return envValueToBool(row?.value);
}
