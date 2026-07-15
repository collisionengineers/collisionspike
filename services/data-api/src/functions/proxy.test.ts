/**
 * api/src/functions/proxy.test.ts — enrichLocationRequest photo-bytes trust boundary (TKT-077).
 *
 * The location-assist proxy must resolve inline image bytes ONLY from on-case `evidence` rows
 * via the RLS-scoped, count/size-capped resolver — and must never trust a caller-supplied
 * `image_base64`. These tests pin that: caller bytes are stripped whether or not an id resolves.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

/* resolveAssistImageBase64 is the only collaborator — mock it to a controllable map. */
const resolver = vi.hoisted(() => ({ resolveAssistImageBase64: vi.fn() }));
vi.mock('../lib/evidence-bytes.js', () => resolver);
/* proxy.ts registers routes at import; stub the host + the other libs it pulls in. */
vi.mock('@azure/functions', () => ({ app: { http: () => {} } }));
vi.mock('../lib/auth.js', () => ({ withRole: (_r: string, h: unknown) => h }));
vi.mock('../lib/gates.js', () => ({ gates: {} }));
vi.mock('../lib/functions-client.js', () => ({ callLocationSuggest: vi.fn(), callParser: vi.fn() }));

import { enrichLocationRequest } from './proxy.js';

beforeEach(() => resolver.resolveAssistImageBase64.mockReset());

const refsOf = (r: unknown) => (r as { photo_refs: Array<Record<string, unknown>> }).photo_refs;

describe('enrichLocationRequest — caller image_base64 is never trusted', () => {
  it('strips a caller image_base64 on a ref that does resolve, replacing it with resolved bytes', async () => {
    resolver.resolveAssistImageBase64.mockResolvedValue(new Map([['ev1', 'RESOLVED_BYTES']]));
    const out = await enrichLocationRequest({
      photo_refs: [{ evidence_id: 'ev1', image_base64: 'ATTACKER_BYTES' }],
    });
    expect(refsOf(out)[0].image_base64).toBe('RESOLVED_BYTES');
  });

  it('strips a caller image_base64 on a ref that does NOT resolve (no bytes forwarded)', async () => {
    resolver.resolveAssistImageBase64.mockResolvedValue(new Map()); // nothing resolves
    const out = await enrichLocationRequest({
      photo_refs: [{ evidence_id: 'off-case', image_base64: 'ATTACKER_BYTES' }],
    });
    expect(refsOf(out)[0]).not.toHaveProperty('image_base64');
    expect(refsOf(out)[0].evidence_id).toBe('off-case'); // metadata preserved
  });

  it('strips inline bytes on a ref with NO evidence_id at all', async () => {
    resolver.resolveAssistImageBase64.mockResolvedValue(new Map([['ev1', 'RESOLVED_BYTES']]));
    const out = await enrichLocationRequest({
      photo_refs: [{ image_base64: 'ATTACKER_BYTES' }, { evidence_id: 'ev1' }],
    });
    expect(refsOf(out)[0]).not.toHaveProperty('image_base64');
    expect(refsOf(out)[1].image_base64).toBe('RESOLVED_BYTES');
  });

  it('leaves a malformed / photo-ref-less body untouched', async () => {
    resolver.resolveAssistImageBase64.mockResolvedValue(new Map());
    expect(await enrichLocationRequest({ foo: 1 })).toEqual({ foo: 1 });
    expect(await enrichLocationRequest(null)).toBeNull();
  });
});
