import { describe, it, expect } from 'vitest';
import {
  BOX_ENV_VAR_SCHEMA_NAMES,
  BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA,
  BOX_GATE_SCHEMA_NAMES,
  boxFileRequestTemplateIdFromRows,
  boxGatesFromResolved,
  boxGatesFromRows,
  envValueToBool,
  resolveEnvVars,
  type ResolvedEnvVar,
} from './box-gates';
import { BOX_GATES_ALL_FALSE } from './types';
import type {
  EnvironmentVariableDefinitionRecord,
  EnvironmentVariableValueRecord,
} from './types';

/* The BOX_* gate read is the Code App's ONLY env-var mechanism (Code Apps have no
   native one). These tests pin the load-bearing rules: strict 'true' parsing,
   value-over-default coalescing, all-false-by-default, the non-empty-string
   template derive, and falsy-zero/empty safety. */

describe('envValueToBool', () => {
  it('is true only for the literal "true" (case-insensitive, trimmed)', () => {
    expect(envValueToBool('true')).toBe(true);
    expect(envValueToBool('TRUE')).toBe(true);
    expect(envValueToBool('  True  ')).toBe(true);
  });
  it('is false for anything else — including "1", "yes", "", null, undefined', () => {
    expect(envValueToBool('1')).toBe(false);
    expect(envValueToBool('yes')).toBe(false);
    expect(envValueToBool('false')).toBe(false);
    expect(envValueToBool('')).toBe(false);
    expect(envValueToBool(null)).toBe(false);
    expect(envValueToBool(undefined)).toBe(false);
  });
});

describe('resolveEnvVars — value ?? default ?? ""', () => {
  it('prefers the value-row override over the definition default', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'd1', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'false' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'd1', value: 'true' },
    ];
    expect(resolveEnvVars(defs, vals)).toEqual([
      { schemaName: 'cr1bd_BOX_API_ENABLED', value: 'true' },
    ]);
  });

  it('falls back to the default when no value row joins', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'd1', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'false' },
    ];
    expect(resolveEnvVars(defs, [])).toEqual([
      { schemaName: 'cr1bd_BOX_API_ENABLED', value: 'false' },
    ]);
  });

  it('falls back to "" when neither value nor default is present', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'd1', schemaname: 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID' },
    ];
    expect(resolveEnvVars(defs, [])).toEqual([
      { schemaName: 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID', value: '' },
    ]);
  });

  it('treats an explicit empty-string override as a real value (not a fallthrough)', () => {
    // '' is a valid "unset" override for the template id; only null/undefined fall through.
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'd1', schemaname: 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID', defaultvalue: 'SHOULD_NOT_WIN' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'd1', value: '' },
    ];
    expect(resolveEnvVars(defs, vals)[0].value).toBe('');
  });

  it('skips definitions with no schema name and ignores orphan value rows', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'd1' /* no schemaname */ },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'orphan', value: 'true' },
    ];
    expect(resolveEnvVars(defs, vals)).toEqual([]);
  });
});

describe('boxGatesFromResolved — defaults all-false, maps known names only', () => {
  it('returns the all-false baseline for empty input', () => {
    expect(boxGatesFromResolved([])).toEqual(BOX_GATES_ALL_FALSE);
  });

  it('maps each Boolean gate schema name to its BoxGates key', () => {
    const resolved: ResolvedEnvVar[] = Object.keys(BOX_GATE_SCHEMA_NAMES).map((schemaName) => ({
      schemaName,
      value: 'true',
    }));
    const gates = boxGatesFromResolved(resolved);
    expect(gates.apiEnabled).toBe(true);
    expect(gates.folderAtIntakeEnabled).toBe(true);
    expect(gates.fileRequestEnabled).toBe(true);
    expect(gates.embedEnabled).toBe(true);
    expect(gates.metadataEnabled).toBe(true);
    // The template-id gate is NOT a boolean var, so it stays false here.
    expect(gates.fileRequestTemplateConfigured).toBe(false);
  });

  it('keeps an absent gate FALSE (partial input never enables by accident)', () => {
    const gates = boxGatesFromResolved([{ schemaName: 'cr1bd_BOX_API_ENABLED', value: 'true' }]);
    expect(gates.apiEnabled).toBe(true);
    expect(gates.fileRequestEnabled).toBe(false);
    expect(gates.embedEnabled).toBe(false);
  });

  it('ignores unknown schema names', () => {
    const gates = boxGatesFromResolved([{ schemaName: 'cr1bd_SOMETHING_ELSE', value: 'true' }]);
    expect(gates).toEqual(BOX_GATES_ALL_FALSE);
  });

  it('fileRequestTemplateConfigured is true only for a non-empty template id', () => {
    expect(
      boxGatesFromResolved([{ schemaName: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, value: '12345' }])
        .fileRequestTemplateConfigured,
    ).toBe(true);
    expect(
      boxGatesFromResolved([{ schemaName: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, value: '   ' }])
        .fileRequestTemplateConfigured,
    ).toBe(false);
    expect(
      boxGatesFromResolved([{ schemaName: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, value: '' }])
        .fileRequestTemplateConfigured,
    ).toBe(false);
  });
});

describe('boxGatesFromRows — the dataverse-source path', () => {
  it('coalesces and maps a realistic mixed set', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'false' },
      { environmentvariabledefinitionid: 'f', schemaname: 'cr1bd_BOX_FILEREQUEST_ENABLED', defaultvalue: 'false' },
      { environmentvariabledefinitionid: 't', schemaname: 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID', defaultvalue: '' },
      { environmentvariabledefinitionid: 'e', schemaname: 'cr1bd_BOX_EMBED_ENABLED', defaultvalue: 'false' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 'a', value: 'true' },
      { _environmentvariabledefinitionid_value: 'f', value: 'true' },
      { _environmentvariabledefinitionid_value: 't', value: 'fr_987' },
      // embed has no value row -> stays default false
    ];
    const gates = boxGatesFromRows(defs, vals);
    expect(gates.apiEnabled).toBe(true);
    expect(gates.fileRequestEnabled).toBe(true);
    expect(gates.fileRequestTemplateConfigured).toBe(true);
    expect(gates.embedEnabled).toBe(false);
    expect(gates.metadataEnabled).toBe(false);
  });

  it('returns all-false when there are no definitions at all', () => {
    expect(boxGatesFromRows([], [])).toEqual(BOX_GATES_ALL_FALSE);
  });
});

describe('schema-name registry', () => {
  it('the fetch list is the 5 Booleans + the template id', () => {
    expect(BOX_ENV_VAR_SCHEMA_NAMES).toHaveLength(6);
    expect(BOX_ENV_VAR_SCHEMA_NAMES).toContain('cr1bd_BOX_API_ENABLED');
    expect(BOX_ENV_VAR_SCHEMA_NAMES).toContain(BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA);
  });
});

describe('boxFileRequestTemplateIdFromRows — the STRING value getter (Item B)', () => {
  it('returns the coalesced value (override over default)', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 't', schemaname: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, defaultvalue: '' },
    ];
    const vals: EnvironmentVariableValueRecord[] = [
      { _environmentvariabledefinitionid_value: 't', value: 'fr_template_123' },
    ];
    expect(boxFileRequestTemplateIdFromRows(defs, vals)).toBe('fr_template_123');
  });

  it('falls back to the definition default when no value row joins', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 't', schemaname: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, defaultvalue: 'fr_default' },
    ];
    expect(boxFileRequestTemplateIdFromRows(defs, [])).toBe('fr_default');
  });

  it('returns undefined for an empty/whitespace value (never a blank template id)', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 't', schemaname: BOX_FILE_REQUEST_TEMPLATE_ID_SCHEMA, defaultvalue: '' },
    ];
    expect(boxFileRequestTemplateIdFromRows(defs, [])).toBeUndefined();
    expect(
      boxFileRequestTemplateIdFromRows(defs, [
        { _environmentvariabledefinitionid_value: 't', value: '   ' },
      ]),
    ).toBeUndefined();
  });

  it('returns undefined when the template var is absent entirely', () => {
    const defs: EnvironmentVariableDefinitionRecord[] = [
      { environmentvariabledefinitionid: 'a', schemaname: 'cr1bd_BOX_API_ENABLED', defaultvalue: 'true' },
    ];
    expect(boxFileRequestTemplateIdFromRows(defs, [])).toBeUndefined();
  });
});
