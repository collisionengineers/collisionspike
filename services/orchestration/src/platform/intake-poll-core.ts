/** *
 * Pure decision pieces for the LOCAL-ONLY intake poller (TKT-299, PLAN-015 Slice B) —
 * config parsing, watermark arithmetic, and the queue-message shape. No IO here; the
 * timer trigger (workflows/mailbox/intake-poll.ts) owns Graph/Blob/queue access. Split
 * out for the same reason as sent-items.ts: the doctrine is testable without Azure.
 */

/** Same per-entry shape as GRAPH_INTAKE_MAILBOXES — but read from the SEPARATE
 *  INTAKE_POLL_MAILBOXES variable so the live app cannot start polling through a
 *  single accidental gate flip. */
export interface PollMailboxConfig {
  mailbox: string;
  /** Go-live floor: the poller never reaches back before this instant. */
  minIntakeDate: string;
}

/** Must match listMessageIdsSince's `$top` — a full page means "maybe more". */
export const INTAKE_POLL_PAGE_SIZE = 50;
/** Backstop against a runaway catch-up on a deep backlog: one timer tick drains at
 *  most this many pages per mailbox; the next tick continues from the watermark. */
export const INTAKE_POLL_MAX_PAGES = 10;

/** Honest-empty on absence or malformed JSON (mirrors intakeMailboxes()); entries
 *  missing either field, or with an unparseable minIntakeDate, are dropped. */
export function parsePollMailboxes(raw: string | undefined): PollMailboxConfig[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (entry): entry is PollMailboxConfig =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PollMailboxConfig).mailbox === 'string' &&
        (entry as PollMailboxConfig).mailbox.trim() !== '' &&
        typeof (entry as PollMailboxConfig).minIntakeDate === 'string' &&
        !Number.isNaN(Date.parse((entry as PollMailboxConfig).minIntakeDate)),
    );
  } catch {
    return [];
  }
}

/** Later of two ISO instants; an unparseable side loses. */
export function maxIso(a: string, b: string): string {
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  if (Number.isNaN(ta)) return b;
  if (Number.isNaN(tb)) return a;
  return tb > ta ? b : a;
}

/** The watermark a poll starts from: the persisted value floored at minIntakeDate.
 *  A missing/poisoned persisted value resets to the floor rather than throwing —
 *  overlap is dedup-safe, a stuck poller is not. */
export function effectiveWatermark(persisted: string | null | undefined, minIntakeDate: string): string {
  if (!persisted || Number.isNaN(Date.parse(persisted))) return minIntakeDate;
  return maxIso(persisted, minIntakeDate);
}

/** Parse a persisted watermark state blob; null on any malformation (reset-to-floor). */
export function parseWatermarkBlob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { watermark?: unknown };
    return typeof parsed.watermark === 'string' && !Number.isNaN(Date.parse(parsed.watermark))
      ? parsed.watermark
      : null;
  } catch {
    return null;
  }
}

/** Serialize the watermark state blob. */
export function watermarkBlobContent(mailbox: string, watermark: string, updatedAtIso: string): string {
  return JSON.stringify({ mailbox, watermark, updatedAt: updatedAtIso });
}

/**
 * One intake-messages queue entry, in EXACTLY the lifecycle-resync shape
 * (graph-lifecycle.ts enqueueResync): fetchMessage derives `sourceMailbox` from the
 * `users/<mailbox>/mailFolders('Inbox')/messages/<id>` resource string, and `resync:true`
 * marks the pull provenance. Re-enqueueing an already-ingested id is safe — the
 * deterministic `intake-{messageId}` instance id and the UNIQUE(sourcemessageid)
 * backstop dedup replays.
 */
export function resyncQueueMessage(mailbox: string, messageId: string, nowIso: string): string {
  return JSON.stringify({
    messageId,
    resource: `users/${mailbox}/mailFolders('Inbox')/messages/${messageId}`,
    receivedAt: nowIso,
    resync: true,
  });
}
