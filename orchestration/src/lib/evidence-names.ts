/**
 * orchestration/src/lib/evidence-names.ts
 *
 * Per-message evidence file naming (TKT-087). The raw-MIME capture and the
 * body-only-instruction text used to land under the GENERIC names `message.eml`
 * / `email-body.txt` — unique per message in Blob (the `{messageId}/` path
 * prefix disambiguates) but FLAT in the case's Box folder, so any case that
 * received a second email (dedup attach / linkReply) was GUARANTEED a Box 409
 * name-conflict on those files. The facade's 409-reuse then stamped the LATER
 * email's evidence row with the EARLIER email's Box file id (mis-linkage: the
 * later bytes never reached Box) — the root cause behind the operator's
 * 18×409 Box report of 2026-07-03.
 *
 * Fix: suffix a short, STABLE per-message token so the names are unique per
 * message while an at-least-once Durable replay of the SAME message still
 * produces the SAME name (a genuine replay's 409 is then a CORRECT idempotent
 * reuse — the property the facade's reuse path was designed for).
 */

import { createHash } from 'node:crypto';

/**
 * Short stable token for a message id — 8 hex chars of SHA-256. Deterministic
 * over the input (prefer the RFC internetMessageId; the caller falls back to
 * the Graph message id), so replays reproduce the identical filename.
 */
export function messageFileToken(id: string): string {
  return createHash('sha256').update(String(id ?? ''), 'utf8').digest('hex').slice(0, 8);
}

/** `message-<token>.eml` — the raw-MIME capture's evidence/Box name. */
export function rawEmlFileName(messageIdOrInternetId: string): string {
  return `message-${messageFileToken(messageIdOrInternetId)}.eml`;
}

/** `email-body-<token>.txt` — the body-only-instruction text's evidence/Box name. */
export function bodyInstructionFileName(messageIdOrInternetId: string): string {
  return `email-body-${messageFileToken(messageIdOrInternetId)}.txt`;
}

/** Blob-only identity: display filenames remain unchanged on evidence rows. */
export function attachmentBlobFileName(attachmentId: string, displayName: string): string {
  const token = createHash('sha256').update(attachmentId, 'utf8').digest('hex');
  return `attachment-${token}-${displayName}`;
}
