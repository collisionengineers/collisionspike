/* ============================================================
   peek — PURE helpers for the ?peek=<caseId> quick-peek drawer route
   (reforge M-F, spec IA §3). No React, no history — the screens decide
   PUSH vs REPLACE:

     open       → PUSH   (Back closes the drawer)
     close/next/prev → REPLACE (paging never pollutes history)

   `?peek=` rides the CURRENT route's search string so the drawer is
   deep-linkable on every surface; /case/:id stays the canonical URL.
   ============================================================ */

const PEEK_PARAM = 'peek';

/** The peeked case id in a search string, or null. */
export function parsePeek(search: string): string | null {
  const value = new URLSearchParams(search).get(PEEK_PARAM);
  return value && value.trim() ? value : null;
}

/** Search string with ?peek=<caseId> set (other params preserved). */
export function withPeek(search: string, caseId: string): string {
  const params = new URLSearchParams(search);
  params.set(PEEK_PARAM, caseId);
  return params.toString();
}

/** Search string with the peek param removed (other params preserved). */
export function withoutPeek(search: string): string {
  const params = new URLSearchParams(search);
  params.delete(PEEK_PARAM);
  return params.toString();
}

/**
 * The neighbouring case id in the launch surface's snapshotted list, or null
 * at the boundary / when the current id has left the list (no wrap — the
 * Prev/Next buttons disable at the ends).
 */
export function nextPeekId(
  list: readonly string[],
  current: string,
  dir: 1 | -1,
): string | null {
  const idx = list.indexOf(current);
  if (idx === -1) return null;
  return list[idx + dir] ?? null;
}
