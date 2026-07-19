import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import * as fnClient from './functions-client.js';

// TKT-265 (PLAN-008): the orchestration `callParser` / `callLocationSuggest` exports and the
// `LOCATION_FN_*` target were dead — the parser and location capabilities are served by the
// staff BFF (POST /api/parser/parse, /api/location-assist/suggest), not by orchestration. This
// guard fails if either dead export or the retired setting is reintroduced.
describe('functions-client — retired dead exports stay retired (TKT-265)', () => {
  it('does not export callParser or callLocationSuggest', () => {
    expect('callParser' in fnClient).toBe(false);
    expect('callLocationSuggest' in fnClient).toBe(false);
  });

  it('does not reference the retired LOCATION_FN_* app-settings', () => {
    const source = readFileSync(fileURLToPath(new URL('./functions-client.ts', import.meta.url)), 'utf8');
    expect(source).not.toMatch(/LOCATION_FN_(URL|KEY)/);
  });

  it('keeps the active parser and EVA submit exports', () => {
    expect(typeof fnClient.callClassifyEmail).toBe('function');
    expect(typeof fnClient.callEvaSubmit).toBe('function');
  });
});
