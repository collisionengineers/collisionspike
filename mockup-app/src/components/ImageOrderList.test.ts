import { describe, it, expect } from 'vitest';
import { arrayMove } from '@dnd-kit/sortable';
import { buildEvaImageOrder, type ImageOrderEntry } from './ImageOrderList';
import type { Evidence } from '../mock';

/* Pure ordering tests for the EVA photo-order seam.

   The DOM (drag handles, aria-live, buttons) is exercised by the app itself;
   here we cover only the pure logic that decides the EVA upload order:
     - buildEvaImageOrder seeds the 2 previews first
       [overview-with-registration, then damage_closeup], then ALL accepted +
       non-excluded images in sequence (including those two again);
     - excluded / not-accepted images are dropped from the seed entirely;
     - the reorder primitive (arrayMove, shared by move() and onDragEnd)
       reorders and emits the new key order the component reports upstream. */

/* ----------  Fixtures  ---------- */

function img(over: Partial<Evidence> = {}): Evidence {
  return {
    id: 'e1',
    fileName: 'IMG_0001.jpg',
    kind: 'image',
    imageRole: 'additional',
    registrationVisible: false,
    acceptedForEva: true,
    sourceLabel: 'message',
    ...over,
  };
}

/** The key order the component would emit upstream after a reorder. */
function keyOrder(entries: ImageOrderEntry[]): string[] {
  return entries.map((e) => e.key);
}

describe('buildEvaImageOrder', () => {
  it('seeds the 2 previews [overview, damage_closeup] then all accepted images', () => {
    const overview = img({ id: 'ov', imageRole: 'overview', registrationVisible: true });
    const closeup = img({ id: 'cu', imageRole: 'damage_closeup' });
    const extra = img({ id: 'ex', imageRole: 'additional' });

    const order = buildEvaImageOrder([overview, closeup, extra]);

    // Two leading preview slots, in overview-then-closeup order.
    expect(order.slice(0, 2).map((e) => e.isPreview)).toEqual([true, true]);
    expect(order[0].previewLabel).toBe('Overview');
    expect(order[0].evidence.id).toBe('ov');
    expect(order[1].previewLabel).toBe('Damage closeup');
    expect(order[1].evidence.id).toBe('cu');

    // Then ALL accepted images in sequence — including the two previews again.
    const tail = order.slice(2);
    expect(tail.every((e) => !e.isPreview)).toBe(true);
    expect(tail.map((e) => e.evidence.id)).toEqual(['ov', 'cu', 'ex']);

    // Length: 2 previews + 3 accepted.
    expect(order).toHaveLength(5);
  });

  it('gives preview duplicates distinct keys from the full-sequence rows', () => {
    const overview = img({ id: 'ov', imageRole: 'overview', registrationVisible: true });
    const order = buildEvaImageOrder([overview]);

    // Preview slot and the same image's full-sequence row carry different keys.
    expect(order[0].key).toBe('preview-ov');
    expect(order[1].key).toBe('all-ov');
    // All keys are unique within the list.
    expect(new Set(keyOrder(order)).size).toBe(order.length);
  });

  it('drops excluded and not-accepted images from the seed', () => {
    const overview = img({ id: 'ov', imageRole: 'overview', registrationVisible: true });
    const closeup = img({ id: 'cu', imageRole: 'damage_closeup' });
    const excluded = img({ id: 'rx', imageRole: 'additional', excluded: true });
    const rejected = img({ id: 'rj', imageRole: 'additional', acceptedForEva: false });

    const order = buildEvaImageOrder([overview, closeup, excluded, rejected]);
    const ids = order.map((e) => e.evidence.id);

    // The dropped images appear nowhere — not in previews, not in the sequence.
    expect(ids).not.toContain('rx');
    expect(ids).not.toContain('rj');
    // Only the two accepted, non-excluded images survive: 2 previews + 2 rows.
    expect(order).toHaveLength(4);
  });

  it('does not seed the overview preview when no overview shows the registration', () => {
    // An overview without a legible registration cannot be the preview overview.
    const overview = img({ id: 'ov', imageRole: 'overview', registrationVisible: false });
    const closeup = img({ id: 'cu', imageRole: 'damage_closeup' });

    const order = buildEvaImageOrder([overview, closeup]);
    const previews = order.filter((e) => e.isPreview);

    // Only the closeup preview seeds; the overview still appears in the sequence.
    expect(previews).toHaveLength(1);
    expect(previews[0].previewLabel).toBe('Damage closeup');
    expect(order.filter((e) => !e.isPreview).map((e) => e.evidence.id)).toEqual(['ov', 'cu']);
  });

  it('seeds no previews when neither an eligible overview nor a closeup exists', () => {
    const a = img({ id: 'a', imageRole: 'additional' });
    const b = img({ id: 'b', imageRole: 'additional' });

    const order = buildEvaImageOrder([a, b]);

    expect(order.every((e) => !e.isPreview)).toBe(true);
    expect(order.map((e) => e.evidence.id)).toEqual(['a', 'b']);
  });
});

describe('reorder primitive (arrayMove)', () => {
  // move() and onDragEnd both reorder via arrayMove, then emit next.map(i => i.key).
  const seed = buildEvaImageOrder([
    img({ id: 'ov', imageRole: 'overview', registrationVisible: true }),
    img({ id: 'cu', imageRole: 'damage_closeup' }),
    img({ id: 'ex', imageRole: 'additional' }),
  ]);

  it('moving a row down shifts it past its neighbour and emits the new key order', () => {
    const baseline = keyOrder(seed);
    const moved = keyOrder(arrayMove(seed, 0, 1));

    expect(moved).toEqual([baseline[1], baseline[0], ...baseline.slice(2)]);
    // Same membership, only the order differs.
    expect([...moved].sort()).toEqual([...baseline].sort());
  });

  it('moving a row up is the inverse of moving it down', () => {
    const baseline = keyOrder(seed);
    const down = arrayMove(seed, 1, 2);
    const restored = keyOrder(arrayMove(down, 2, 1));

    expect(restored).toEqual(baseline);
  });
});
