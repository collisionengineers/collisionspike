/* ============================================================
   inbox-deep-link — PURE helpers for the inbox's `?item=<inbound email id>`
   deep link (TKT-072: a global-search EMAIL hit must open THAT email's
   preview, not the bare inbox). No React — Inbox.tsx consumes these in a
   one-shot effect once the list has loaded.

   Semantics: the param is CONSUMED (removed from the URL, replace) whether or
   not the row was found — an unknown/stale id degrades honestly to the plain
   inbox, never an error flash, and Back returns to the search results rather
   than re-opening the preview in a loop.
   ============================================================ */

/** Read `?item=` out of a query string ('' / absent / blank → null). */
export function parseInboxItem(search: string): string | null {
  const v = new URLSearchParams(search).get('item');
  const trimmed = (v ?? '').trim();
  return trimmed ? trimmed : null;
}

/** The loaded row the deep link points at, or undefined (unknown id / no param). */
export function resolveInboxItem<T extends { id: string }>(
  rows: readonly T[],
  itemId: string | null | undefined,
): T | undefined {
  if (!itemId) return undefined;
  return rows.find((r) => r.id === itemId);
}

/** The same query string without `item` — what the URL is rewritten to once the
 *  deep link has been consumed. */
export function withoutInboxItem(search: string): string {
  const params = new URLSearchParams(search);
  params.delete('item');
  return params.toString();
}
