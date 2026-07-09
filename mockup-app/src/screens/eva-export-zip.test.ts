import { describe, expect, it } from 'vitest';
import type { Evidence } from '@cs/domain';
import { buildEvaImageOrder } from '../components/ImageOrderList';
import {
  buildEvaZipImageSpecs,
  evaExportBaseName,
  orderEntriesByKeys,
} from './eva-export-zip';

/* TKT-126 — the EVA-export zip manifest: photo order per the EVA rule (2 previews
   first, then ALL accepted photos including those two again), numeric-prefix names
   so a filename sort reproduces the drag-drop order, excluded images absent. */

const img = (id: string, over: Partial<Evidence> = {}): Evidence => ({
  id,
  fileName: `${id}.jpg`,
  kind: 'image',
  imageRole: 'additional',
  registrationVisible: false,
  acceptedForEva: true,
  sourceLabel: 'test',
  ...over,
});

const overview = img('overview', { imageRole: 'overview', registrationVisible: true });
const closeup = img('closeup', { imageRole: 'damage_closeup' });
const extra = img('extra');
const excluded = img('excluded', { excluded: true, exclusionReason: 'person reflection' });
const rejected = img('rejected', { acceptedForEva: false });

describe('buildEvaZipImageSpecs over the seeded EVA order', () => {
  it('previews first, then ALL accepted photos including the two previews again', () => {
    const specs = buildEvaZipImageSpecs(buildEvaImageOrder([overview, closeup, extra]));
    expect(specs.map((s) => s.evidenceId)).toEqual([
      'overview', // preview 1
      'closeup', // preview 2
      'overview', // full sequence — previews REPEAT
      'closeup',
      'extra',
    ]);
  });

  it('names carry a sortable numeric prefix that preserves the order', () => {
    const specs = buildEvaZipImageSpecs(buildEvaImageOrder([overview, closeup, extra]));
    expect(specs.map((s) => s.name)).toEqual([
      '001-overview.jpg',
      '002-closeup.jpg',
      '003-overview.jpg',
      '004-closeup.jpg',
      '005-extra.jpg',
    ]);
    // A plain lexicographic sort (what a file picker does) keeps the same order.
    expect([...specs.map((s) => s.name)].sort()).toEqual(specs.map((s) => s.name));
  });

  it('excluded and not-accepted images never ship', () => {
    const specs = buildEvaZipImageSpecs(
      buildEvaImageOrder([overview, closeup, excluded, rejected]),
    );
    const ids = specs.map((s) => s.evidenceId);
    expect(ids).not.toContain('excluded');
    expect(ids).not.toContain('rejected');
  });

  it('sanitises hostile file names but keeps the stem', () => {
    const nasty = img('n1', { fileName: 'a/b\\c:d*e?.jpg' });
    const specs = buildEvaZipImageSpecs(buildEvaImageOrder([overview, closeup, nasty]));
    const spec = specs.find((s) => s.evidenceId === 'n1')!;
    expect(spec.name).toMatch(/^\d{3}-a_b_c_d_e_\.jpg$/);
  });
});

describe('orderEntriesByKeys — the reviewer drag order', () => {
  const seed = buildEvaImageOrder([overview, closeup, extra]);

  it('re-applies a captured key order', () => {
    const keys = [...seed.map((e) => e.key)].reverse();
    expect(orderEntriesByKeys(seed, keys).map((e) => e.key)).toEqual(keys);
  });

  it('a missing/empty capture keeps the seeded order', () => {
    expect(orderEntriesByKeys(seed, null).map((e) => e.key)).toEqual(seed.map((e) => e.key));
    expect(orderEntriesByKeys(seed, []).map((e) => e.key)).toEqual(seed.map((e) => e.key));
  });

  it('a stale capture can never DROP a photo (uncovered entries append in seed order)', () => {
    const partial = [seed[2].key]; // reviewer only ever dragged one row
    const out = orderEntriesByKeys(seed, partial).map((e) => e.key);
    expect(out[0]).toBe(seed[2].key);
    expect(out).toHaveLength(seed.length);
    expect(new Set(out).size).toBe(seed.length);
  });

  it('unknown keys are ignored', () => {
    const out = orderEntriesByKeys(seed, ['nope', seed[0].key]);
    expect(out).toHaveLength(seed.length);
    expect(out[0].key).toBe(seed[0].key);
  });
});

describe('evaExportBaseName', () => {
  it('uses the Case/PO verbatim and sanitises anything odd', () => {
    expect(evaExportBaseName('CCPY26050')).toBe('EVA-CCPY26050');
    expect(evaExportBaseName('a b/c')).toBe('EVA-a_b_c');
    expect(evaExportBaseName('')).toBe('EVA-case');
  });
});
