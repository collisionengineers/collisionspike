/* ============================================================
   intake-engine — Stage 0: recover the ORIGINAL sender from a forwarded email body.

   WHY THIS EXISTS. Stage 1 (identify-principal.ts) resolves the principal from the
   sender ADDRESS. That works for mail a provider sends us directly. It does not work
   for the alpha's actual mail shape: every alpha instruction arrives as a STAFF
   FORWARD into instructions@collisionengineers.co.uk, so the envelope's `From` is a
   Collision Engineers address and Stage 1 correctly returns 'unmatched' — the pipeline
   then short-circuits before it ever classifies anything
   (docs/operations/alpha-testing.md: "the staff `From` is correctly unmatched").

   The originating provider address is still present, inside the quoted forward header
   block. This module recovers it so Stage 1 can run against the address that actually
   identifies the provider, with NO change to Stage 1's matching rules.

   CONVENTION — deliberately the same one the vendored Python classifier already uses
   (`_OUTLOOK_HEADER_RE` in rules/email_classifier.py, TKT-030/038): a `from:` line
   followed by one to five `sent:`/`to:`/`cc:`/`subject:`/`date:` lines. The follow-up
   header cascade is what makes it precise — prose like "From: our notes" cannot match
   without it. Note the Python side uses that block to STRIP quoted text; here we use
   it to READ the sender out of the same block. Same shape, opposite purpose, so the
   two must stay in step about what a quoted header block looks like.

   FIRST match wins: in a forwarded chain the outermost block is the most recent
   original sender, which is the provider we want. A deeper chain (the provider having
   themselves forwarded something) leaves its blocks further down, correctly ignored.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No I/O.
   ============================================================ */

import { addressOf } from './identify-principal.js';

/**
 * Outlook-style quoted header block. Mirrors the Python twin's `_OUTLOOK_HEADER_RE`:
 * a `From:` line whose value is captured, followed by 1–5 continuation header lines.
 * Anchored to a line start so a `From:` appearing mid-sentence cannot match.
 */
const QUOTED_HEADER_RE =
  /(?:^|\r?\n)[ \t]*from:[ \t]*(\S[^\r\n]*)(?:\r?\n[ \t]*(?:sent|to|cc|subject|date):[ \t]*[^\r\n]*){1,5}/i;

export interface ExtractForwardedSenderResult {
  /** The normalised `local@domain.tld` of the original sender, '' when not found. */
  originalSender: string;
  /** The raw `From:` value as written, for an audit trail. Undefined when no block matched. */
  rawFromValue?: string;
}

/**
 * Recover the original sender from a forwarded body. Returns an empty
 * `originalSender` when there is no quoted header block, or when the block's `From:`
 * value is not a parseable address — NEVER guesses, so a caller can safely fall back
 * to the envelope sender.
 */
export function extractForwardedSender(body: string): ExtractForwardedSenderResult {
  if (!body) return { originalSender: '' };

  const match = QUOTED_HEADER_RE.exec(body);
  if (!match) return { originalSender: '' };

  const rawFromValue = (match[1] ?? '').trim();
  // addressOf unwraps a `"Name" <addr>` display form and validates the shape; it
  // returns '' for anything it cannot parse, which we surface unchanged.
  return { originalSender: addressOf(rawFromValue), rawFromValue };
}

/**
 * The address Stage 1 should identify against: the forwarded original sender when one
 * is recoverable, otherwise the envelope sender exactly as before. This is the single
 * decision point for that precedence — a direct arrival has no quoted header block, so
 * it falls through to the envelope sender untouched.
 */
export function resolveIdentifyingSender(
  envelopeSender: string,
  body: string,
): { senderAddress: string; source: 'envelope' | 'forwarded_header'; rawFromValue?: string } {
  const { originalSender, rawFromValue } = extractForwardedSender(body);
  if (originalSender) {
    return { senderAddress: originalSender, source: 'forwarded_header', rawFromValue };
  }
  return { senderAddress: envelopeSender, source: 'envelope' };
}
