import { describe, it, expect } from 'vitest';
import {
  AZURE_MAPS_ENABLED_SCHEMA,
  LOCATION_ASSIST_API_BASE_SCHEMA,
  LOCATION_ASSIST_ENABLED_SCHEMA,
  LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES,
  locationAssistGateFromResolved,
  locationAssistGateFromRows,
  type ResolvedEnvVar,
} from './box-gates';
import { LOCATION_ASSIST_GATE_ALL_OFF } from './types';
import type {
  EnvironmentVariableDefinitionRecord,
  EnvironmentVariableValueRecord,
} from './types';

/* The location-assist gate is read off the SAME env-var platform tables as the
   BOX_* gates (Code Apps have no native env-var read). These tests pin the
   load-bearing rule: the action shows ONLY when the master gate, the paired Maps
   gate, AND the per-env API base are all set — and everything defaults OFF. */

function resolved(parts: Partial<Record<string, string>>): ResolvedEnvVar[] {
  return Object.entries(parts).map(([schemaName, value]) => ({ schemaName, value: value ?? '' }));
}

describe('locationAssistGateFromResolved — enabled is the AND of all three', () => {
  it('returns all-off for empty input', () => {
    expect(locationAssistGateFromResolved([])).toEqual(LOCATION_ASSIST_GATE_ALL_OFF);
  });

  it('is enabled only when gate + Maps + API base are all set', () => {
    const gate = locationAssistGateFromResolved(
      resolved({
        [LOCATION_ASSIST_ENABLED_SCHEMA]: 'true',
        [AZURE_MAPS_ENABLED_SCHEMA]: 'true',
        [LOCATION_ASSIST_API_BASE_SCHEMA]: 'https://fn.example/api',
      }),
    );
    expect(gate.assistEnabled).toBe(true);
    expect(gate.mapsEnabled).toBe(true);
    expect(gate.apiBaseConfigured).toBe(true);
    expect(gate.enabled).toBe(true);
  });

  it('stays OFF when the paired Maps gate is false (both Booleans required)', () => {
    const gate = locationAssistGateFromResolved(
      resolved({
        [LOCATION_ASSIST_ENABLED_SCHEMA]: 'true',
        [AZURE_MAPS_ENABLED_SCHEMA]: 'false',
        [LOCATION_ASSIST_API_BASE_SCHEMA]: 'https://fn.example/api',
      }),
    );
    expect(gate.assistEnabled).toBe(true);
    expect(gate.mapsEnabled).toBe(false);
    expect(gate.enabled).toBe(false);
  });

  it('stays OFF when the API base is empty (both Booleans on but no base)', () => {
    const gate = locationAssistGateFromResolved(
      resolved({
        [LOCATION_ASSIST_ENABLED_SCHEMA]: 'true',
        [AZURE_MAPS_ENABLED_SCHEMA]: 'true',
        [LOCATION_ASSIST_API_BASE_SCHEMA]: '   ',
      }),
    );
    expect(gate.apiBaseConfigured).toBe(false);
    expect(gate.enabled).toBe(false);
  });

  it('stays OFF when the master assist gate is false', () => {
    const gate = locationAssistGateFromResolved(
      resolved({
        [LOCATION_ASSIST_ENABLED_SCHEMA]: 'false',
        [AZURE_MAPS_ENABLED_SCHEMA]: 'true',
        [LOCATION_ASSIST_API_BASE_SCHEMA]: 'https://fn.example/api',
      }),
    );
    expect(gate.enabled).toBe(false);
  });

  it('treats only the literal "true" as on (1/yes/blank are off)', () => {
    const gate = locationAssistGateFromResolved(
      resolved({
        [LOCATION_ASSIST_ENABLED_SCHEMA]: '1',
        [AZURE_MAPS_ENABLED_SCHEMA]: 'yes',
        [LOCATION_ASSIST_API_BASE_SCHEMA]: 'https://fn.example/api',
      }),
    );
    expect(gate.assistEnabled).toBe(false);
    expect(gate.mapsEnabled).toBe(false);
    expect(gate.enabled).toBe(false);
  });
});

describe('locationAssistGateFromRows — the dataverse-source path', () => {
  it('coalesces value-over-default and ANDs to enabled', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: LOCATION_ASSIST_ENABLED_SCHEMA, defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'm', schemaname: AZURE_MAPS_ENABLED_SCHEMA, defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'b', schemaname: LOCATION_ASSIST_API_BASE_SCHEMA, defaultvalue: '' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'a', value: 'true' },
      { _environmentvariabledefinitionid_value: 'm', value: 'true' },
      { _environmentvariabledefinitionid_value: 'b', value: 'https://loc.example/api' },
    ];
    expect(locationAssistGateFromRows(defs, vals).enabled).toBe(true);
  });

  it('ships dark on the default rows (all off/empty)', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: LOCATION_ASSIST_ENABLED_SCHEMA, defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'm', schemaname: AZURE_MAPS_ENABLED_SCHEMA, defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'b', schemaname: LOCATION_ASSIST_API_BASE_SCHEMA, defaultvalue: '' },
    ];
    expect(locationAssistGateFromRows(defs, [])).toEqual(LOCATION_ASSIST_GATE_ALL_OFF);
  });

  it('returns all-off when there are no definitions at all', () => {
    expect(locationAssistGateFromRows([], [])).toEqual(LOCATION_ASSIST_GATE_ALL_OFF);
  });
});

describe('schema-name registry', () => {
  it('the fetch list is the 2 Booleans + the API base', () => {
    expect(LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES).toHaveLength(3);
    expect(LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES).toContain(LOCATION_ASSIST_ENABLED_SCHEMA);
    expect(LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES).toContain(AZURE_MAPS_ENABLED_SCHEMA);
    expect(LOCATION_ASSIST_ENV_VAR_SCHEMA_NAMES).toContain(LOCATION_ASSIST_API_BASE_SCHEMA);
  });
});
