/* ============================================================
   eva-export-zip — PURE helpers for the "Export for EVA" .zip (TKT-126).

   One artifact: the 12-field EVA JSON + every included image, named so a
   filename sort reproduces the EVA photo-order rule (2 previews first —
   overview then main-damage closeup — then ALL accepted photos in sequence,
   INCLUDING those two again; excluded images never ship). The order itself
   comes from buildEvaImageOrder (ImageOrderList.tsx) — optionally re-ordered
   by the reviewer's drag order — so the on-screen list and the zip can never
   disagree.

   No React, no fetch, no zip library here: these helpers produce the MANIFEST
   (which evidence id lands under which name); CaseDetail fetches the bytes
   through the authenticated seam and fflate packs them.
   ============================================================ */

import type { ImageOrderEntry } from '../../shared/ui/ImageOrderList';

/** One image member of the zip: where the bytes come from + the zip entry name. */
export interface EvaZipImageSpec {
  /** Evidence id to fetch bytes for (the seam's evidenceContentBlob). */
  evidenceId: string;
  /** Entry name inside the zip — numeric prefix preserves the EVA drag-drop order. */
  name: string;
  /** Original file name (for honest error messages). */
  fileName: string;
}

/** Zip (and JSON) base name: EVA-<Case/PO or case id>. */
export function evaExportBaseName(casePoOrId: string): string {
  const base = (casePoOrId || 'case').trim().replace(/[^A-Za-z0-9._-]+/g, '_');
  return `EVA-${base}`;
}

/** Keep zip entry names filesystem-safe without losing the original stem. */
function safeName(fileName: string, fallback: string): string {
  const cleaned = (fileName || '').trim().replace(/[\\/:*?"<>|]+/g, '_');
  return cleaned || fallback;
}

/**
 * Re-apply the reviewer's drag order (ImageOrderList onOrderChange keys) to the
 * seeded entries. Unknown/stale keys are ignored; entries missing from `keys`
 * keep their seeded position appended at the end — so a stale capture can never
 * DROP a photo from the export.
 */
export function orderEntriesByKeys(
  seed: readonly ImageOrderEntry[],
  keys: readonly string[] | null | undefined,
): ImageOrderEntry[] {
  if (!keys || keys.length === 0) return [...seed];
  const byKey = new Map(seed.map((e) => [e.key, e]));
  const ordered: ImageOrderEntry[] = [];
  for (const k of keys) {
    const hit = byKey.get(k);
    if (hit) {
      ordered.push(hit);
      byKey.delete(k);
    }
  }
  // Anything the captured order didn't cover (e.g. images that landed after the
  // last drag) keeps its seeded relative order at the tail.
  for (const e of seed) if (byKey.has(e.key)) ordered.push(e);
  return ordered;
}

/**
 * The image manifest for the zip, in EVA order: `NNN-<original name>` so a
 * name sort in the file picker reproduces the drag-drop sequence (the two
 * preview slots are the same bytes under their own leading numbers).
 */
export function buildEvaZipImageSpecs(entries: readonly ImageOrderEntry[]): EvaZipImageSpec[] {
  return entries.map((e, i) => {
    const seq = String(i + 1).padStart(3, '0');
    return {
      evidenceId: e.evidence.id,
      name: `${seq}-${safeName(e.evidence.fileName, `photo-${seq}.jpg`)}`,
      fileName: e.evidence.fileName,
    };
  });
}
