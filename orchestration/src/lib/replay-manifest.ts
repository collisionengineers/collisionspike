/**
 * orchestration/src/lib/replay-manifest.ts
 *
 * Pure helpers for the replay backfill driver (replay-backfill.ts / TKT-059). Extracted here
 * (like lib/retro-envelope.ts) so the deterministic merge + tally logic is unit-testable
 * WITHOUT importing the function module, whose top-level app.http/df.app.* calls register
 * triggers on import.
 */

/** The minimum an item needs to be ordered chronologically with a stable tie-break. */
export interface OrderedItem {
  receivedDateTime: string;
  internetMessageId: string;
}

/**
 * Compare two items by `receivedDateTime` (ISO-8601 strings sort lexicographically =
 * chronologically), tie-broken by `internetMessageId` so the order is TOTAL and stable —
 * a Durable orchestrator replay must produce byte-identical ordering every time.
 */
export function compareByReceived(a: OrderedItem, b: OrderedItem): number {
  if (a.receivedDateTime < b.receivedDateTime) return -1;
  if (a.receivedDateTime > b.receivedDateTime) return 1;
  if (a.internetMessageId < b.internetMessageId) return -1;
  if (a.internetMessageId > b.internetMessageId) return 1;
  return 0;
}

/**
 * Merge the per-mailbox lists into ONE globally chronological sequence. Instruction emails
 * must precede their replies/follow-ups across mailboxes (linkReply + the triage ref-gate
 * depend on it), so the merge is by receive time, not by mailbox.
 */
export function mergeChronological<T extends OrderedItem>(lists: T[][]): T[] {
  return lists.flat().sort(compareByReceived);
}

/** Count manifest rows by `category/subtype` for the dry-run summary. */
export function tallyByCategory(rows: Array<{ category: string; subtype: string }>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    const key = `${r.category}/${r.subtype}`;
    out[key] = (out[key] ?? 0) + 1;
  }
  return out;
}
