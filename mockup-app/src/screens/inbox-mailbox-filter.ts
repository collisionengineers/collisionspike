/* ============================================================
   inbox-mailbox-filter — PURE helpers for the inbox's source-mailbox facet
   chips (TKT-025). No React — Inbox.tsx renders whatever these return.

   CLIENT-SIDE ONLY: facets + filtering are derived from the rows already
   loaded for the current category/view (no new API call, no hard-coded
   mailbox list — TKT-025's acceptance criterion). A server-side facet/count
   param is the scale follow-up once the inbox routinely holds more rows than
   a single page comfortably loads.
   ============================================================ */

/** The minimal shape these helpers need from an inbound-email row. */
export interface MailboxFacetSource {
  sourceMailbox: string;
}

export interface MailboxFacet {
  /** The row value ITSELF — what the filter Set keys on (exact match). */
  mailbox: string;
  /** Display label — e.g. "info@" — see {@link mailboxChipLabel}. */
  label: string;
  count: number;
}

/** True when `value` "reads as an address" (has a non-empty local part before
 *  the "@") — the SAME guard the case grid's channel cell and the case peek
 *  drawer already apply before rendering a `sourceMailbox` value, so an
 *  internal, non-address value is never shown verbatim. */
function looksLikeAddress(value: string): boolean {
  const at = value.indexOf('@');
  return at > 0;
}

/** The chip label for one mailbox value: its local part + "@" ("info@")
 *  when it reads as a real address, else a safe fallback that never leaks
 *  the raw value. */
export function mailboxChipLabel(mailbox: string): string {
  if (!looksLikeAddress(mailbox)) return 'Other source';
  return mailbox.slice(0, mailbox.indexOf('@') + 1);
}

/** Distinct source-mailbox facets present in `rows`, each with a live count
 *  — sorted alphabetically by the underlying address (NOT a hard-coded
 *  mailbox order: the facet list follows whatever the loaded rows actually
 *  carry). Rows with a blank `sourceMailbox` are excluded — nothing to
 *  filter by. */
export function mailboxFacets<T extends MailboxFacetSource>(rows: readonly T[]): MailboxFacet[] {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const mailbox = row.sourceMailbox?.trim();
    if (!mailbox) continue;
    counts.set(mailbox, (counts.get(mailbox) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([mailbox, count]) => ({ mailbox, label: mailboxChipLabel(mailbox), count }))
    .sort((a, b) => a.mailbox.localeCompare(b.mailbox));
}

/** True when `row` passes the mailbox facet filter. An EMPTY selection means
 *  "all sources" (TKT-025: multi-select-none = all) — the filter is inert
 *  until at least one chip is picked, mirroring the reason-chip precedent
 *  (CaseList) of a facet that does nothing until toggled on. */
export function matchesMailboxFilter<T extends MailboxFacetSource>(
  row: T,
  selected: ReadonlySet<string>,
): boolean {
  return selected.size === 0 || selected.has(row.sourceMailbox);
}
