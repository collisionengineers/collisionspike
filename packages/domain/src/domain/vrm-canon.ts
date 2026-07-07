/* ============================================================
   Collision Engineers — the ONE UK-registration canonicaliser (PLAN-001).

   `canonicalizeVrm` is the single source of truth for reducing a registration
   mark (or a Case/PO reference) to its comparison form: UPPER-CASE, alpha-numeric
   only (every space, hyphen, dot and other separator stripped). Intake stores
   VRMs compacted (the vrm-filter `extractVrm` strips spaces), so a user typing a
   spaced mark ("YT13 UTV") or a lower-case one ("yt13 utv") must canonicalise to
   the same token as storage ("YT13UTV") before any comparison.

   Consolidated call-sites (previously three divergent local copies):
     - orchestration/src/lib/image-classify.ts  (was local `normalizeVrm`)
     - packages/domain/src/domain/vrm-filter.ts  (was `replace(/\s+/g,'')` outputs)
     - api openVrmTwins / assistant lookup / global search  (new call-sites)

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O, no live calls.
   ============================================================ */

/**
 * Canonicalise a UK registration mark (or Case/PO reference) for comparison:
 * upper-case, alpha-numeric only. Null/undefined/empty → ''.
 *
 *   canonicalizeVrm('YT13 UTV')  === 'YT13UTV'
 *   canonicalizeVrm('yt13 utv')  === 'YT13UTV'
 *   canonicalizeVrm('YT13UTV')   === 'YT13UTV'
 *   canonicalizeVrm('CCPY 26050')=== 'CCPY26050'   // Case/PO refs too
 */
export function canonicalizeVrm(s: string | null | undefined): string {
  if (!s) return '';
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}
