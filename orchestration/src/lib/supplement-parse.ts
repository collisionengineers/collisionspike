/**
 * Best-effort field supplements when the instruction attachment parse omits content
 * that is present in the email body (e.g. QDOS triage letters with table-layout .doc
 * files on FC1 where LibreOffice is unavailable).
 */

const ACCIDENT_START_RE = /accident circumstances\s*:?/i;
const ACCIDENT_END_RES = [
  /\bdamage description\s*:?/i,
  /\bdriveable\s*:?/i,
  /\byours faithfully\b/i,
];

/**
 * Extract accident circumstances narrative from plain email body text when the
 * parser left the field empty but the body carries an "Accident Circumstances" block.
 */
export function supplementAccidentCircumstancesFromBody(body: string): string {
  const text = (body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text || !ACCIDENT_START_RE.test(text)) {
    return '';
  }

  const startMatch = ACCIDENT_START_RE.exec(text);
  if (!startMatch) {
    return '';
  }

  let remainder = text.slice(startMatch.index + startMatch[0].length).trim();
  remainder = remainder.replace(/^[|:\s]+/, '');

  let endIdx = remainder.length;
  for (const endRe of ACCIDENT_END_RES) {
    const match = endRe.exec(remainder);
    if (match && match.index < endIdx) {
      endIdx = match.index;
    }
  }

  const value = remainder
    .slice(0, endIdx)
    .replace(/\s+/g, ' ')
    .trim();

  return value.length > 10 ? value : '';
}
