/* ============================================================
   Pins the 2026-07-09 ASSISTANT_TOOLSET_V2 live incident closed:
   the OpenAPI-3.0 zod-to-json-schema target emitted a BOOLEAN
   `exclusiveMinimum: true` for `.positive()` limit fields, and AOAI
   (draft-2020-12) rejected the WHOLE tools array with
   "True is not of type 'number'" (invalid_function_parameters),
   400-ing every POST /api/assistant/chat. These tests fail if the
   poison shape can ever be emitted again.
   ============================================================ */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import { CAPABILITIES, capabilityByName } from './registry';
import { toJsonSchema } from './schemas';

/** Recursively collect every (path, value) where key is an exclusive bound. */
function findExclusiveBounds(
  node: unknown,
  path = '$',
  out: Array<{ path: string; key: string; value: unknown }> = [],
): Array<{ path: string; key: string; value: unknown }> {
  if (Array.isArray(node)) {
    node.forEach((item, i) => findExclusiveBounds(item, `${path}[${i}]`, out));
    return out;
  }
  if (node === null || typeof node !== 'object') return out;
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    if (key === 'exclusiveMinimum' || key === 'exclusiveMaximum') {
      out.push({ path: `${path}.${key}`, key, value });
    }
    findExclusiveBounds(value, `${path}.${key}`, out);
  }
  return out;
}

describe('capability tool schemas are AOAI-acceptable (2026-07-09 incident pin)', () => {
  it('NO capability parameters contain a boolean exclusiveMinimum/exclusiveMaximum', () => {
    for (const c of CAPABILITIES) {
      const bounds = findExclusiveBounds(c.parameters);
      for (const b of bounds) {
        expect(
          typeof b.value,
          `${c.name} ${b.path} must be numeric (draft-2020-12), got ${String(b.value)}`,
        ).toBe('number');
      }
    }
  });

  it.each(['case_activity', 'list_queue_cases', 'aging_exceptions'])(
    '%s limit field emits a plain numeric minimum (the three tools the flip broke)',
    (name) => {
      const cap = capabilityByName(name)!;
      expect(cap).toBeDefined();
      const props = cap.parameters.properties as Record<string, Record<string, unknown>>;
      const limit = props.limit;
      expect(limit).toBeDefined();
      expect(limit.type).toBe('integer');
      expect(limit.minimum).toBe(1);
      expect(limit.maximum).toBe(50);
      // the poison shape: exclusiveMinimum must be absent or numeric, never boolean
      expect(typeof limit.exclusiveMinimum).not.toBe('boolean');
      expect(typeof limit.exclusiveMaximum).not.toBe('boolean');
    },
  );

  it('toJsonSchema normalises a boolean exclusive bound into the numeric draft-2020-12 form', () => {
    // .gt()/.positive() are exactly what emitted the boolean form under openApi3
    const schema = z.object({ n: z.number().gt(5), m: z.number().lt(9) }).strict();
    const json = toJsonSchema(schema) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(json.properties.n.exclusiveMinimum).toBe(5);
    expect(json.properties.n.minimum).toBeUndefined();
    expect(json.properties.m.exclusiveMaximum).toBe(9);
    expect(json.properties.m.maximum).toBeUndefined();
  });

  it('toJsonSchema leaves inclusive bounds untouched', () => {
    const schema = z.object({ limit: z.number().int().min(1).max(50) }).strict();
    const json = toJsonSchema(schema) as {
      properties: Record<string, Record<string, unknown>>;
    };
    expect(json.properties.limit.minimum).toBe(1);
    expect(json.properties.limit.maximum).toBe(50);
    expect('exclusiveMinimum' in json.properties.limit).toBe(false);
  });
});
