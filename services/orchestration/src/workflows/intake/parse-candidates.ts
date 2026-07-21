/** *
 * Pure document-candidate ordering for the parser — extracted from parse.ts so the
 * intake ORCHESTRATOR can gate its hoisted parse call (PLAN-014 Slice 4b) on
 * `orderParseCandidates(attachments).length > 0` WITHOUT pulling parse.ts's runtime
 * surface (its `df.app.activity` registration, blob/fetch/OCR clients, `@cs/domain`
 * value imports) into the orchestrator's module graph. This module has ZERO heavy
 * imports on purpose: it is safe to value-import from a Durable orchestrator body.
 *
 * parse.ts re-exports `orderParseCandidates`, `MAX_PARSE_DOCS`, and the `ParseAttachment`
 * type from here so every existing importer (parse.test.ts, classifyPersist.ts) is
 * unchanged — one definition, no duplication.
 */

export interface ParseAttachment {
  filename: string;
  contentType: string;
  blobPath: string;
  size: number;
}

/** Parser-supported document extensions (PDF/Word/RTF + email files — engine-core readers). */
const DOC_EXT = /\.(pdf|docx?|rtf|eml|msg)$/i;
const DOC_CTYPE = /pdf|msword|officedocument|rtf|rfc822|ms-outlook/i;
/** An email FILE (.eml/.msg) — a parse candidate of LAST resort (a forwarded message). */
const EMAIL_EXT = /\.(eml|msg)$/i;
const EMAIL_CTYPE = /rfc822|ms-outlook/i;

function isEmailFile(a: ParseAttachment): boolean {
  return EMAIL_EXT.test(a.filename ?? '') || EMAIL_CTYPE.test(a.contentType ?? '');
}

/** Max documents parsed per email — bounds parser cost on attachment-heavy audit emails. */
export const MAX_PARSE_DOCS = 3;

export const isPdf = (a: ParseAttachment): boolean =>
  /pdf/i.test(a.contentType ?? '') || /\.pdf$/i.test(a.filename ?? '');

/**
 * Order the document candidates for parsing. Email FILES (.eml/.msg) remain a pool of
 * last resort (only when NO separate document attached — a forwarded message as item
 * attachment). Within the real documents, Word/RTF go FIRST: on the audit-email corpus
 * (TKT-051 / ADR-0021) the instruction is a Word `.DOC` while the third-party engineer's
 * report is a PDF, so Word-first puts the instruction inside the MAX_PARSE_DOCS bound.
 * (The old single-doc picker preferred PDF, which is exactly how an audit email got its
 * EVA report parsed as "the instruction".) Order within a tier is the original
 * attachment order (stable).
 *
 * An empty return is exactly the condition under which the `parse` activity would skip
 * (parse.ts's own `!candidates.length` short-circuit), so the orchestrator gates its
 * hoisted call on `orderParseCandidates(...).length > 0` to avoid an activity round-trip
 * that could only skip.
 */
export function orderParseCandidates(atts: readonly ParseAttachment[]): ParseAttachment[] {
  const docs = atts.filter((a) => DOC_CTYPE.test(a.contentType ?? '') || DOC_EXT.test(a.filename ?? ''));
  if (!docs.length) return [];
  const nonEmail = docs.filter((a) => !isEmailFile(a));
  const pool = nonEmail.length ? nonEmail : docs.filter(isEmailFile);
  return [...pool.filter((a) => !isPdf(a)), ...pool.filter(isPdf)];
}
