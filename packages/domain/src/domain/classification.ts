/* ============================================================
   Collision Engineers — Attachment classification (DOMAIN LOGIC, M1).

   Re-implements collisioncc `graph-intake.ts` attachment classification on the
   collisionspike domain model. The orchestration intake path consumes this
   pure decision table rather than re-deriving the mapping.

   Mapping (deterministic, mirrors graph-intake):
     .jpg / .jpeg / .png            -> 'image'
     .pdf / .docx / .doc            -> 'instruction'
     .eml  (the message itself)     -> 'email'
     anything else                  -> 'other'

   Extension is the primary signal; the MIME content-type is a corroborating
   signal only — extension wins when the two disagree (filenames are what the
   provider controls and what the Box/EVA pipeline keys on). NEVER call
   collisioncc at runtime.

   PRECEDENCE NOTE (PLAN-014 D4): this extension-wins-over-MIME rule governs
   evidence-KIND classification only — both signals here are equally-cheap
   guesses about a file nobody has opened. It is a DIFFERENT, later-stage
   concern from the parser's `email_classifier.py` `attachment_content_typings`
   refinement, where a content-detected `report`/`junk`/`unknown` OVERRIDES a
   filename-derived `instruction` kind for TRIAGE PROMOTION — content wins
   there because it is not a guess (parse already read the document). Same
   meta-rule ("the more reliable available signal wins"), opposite surface
   answer, because the two signals' relative reliability differs by call site.
   This function's own evidence-kind mapping is never touched by that rule.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

/**
 * The evidence classes the intake pipeline distinguishes at attachment time.
 *
 * `engineer_report` (ADR-0014/ADR-0021) is NEVER produced by the filename tables
 * below — `describeEvidence` stays filename-pure. It is assigned only by the
 * orchestration classifyPersist override when the parser's CONTENT typing
 * identified an attachment as a third-party engineer's report on an audit case
 * (stored for comparison, never overlaid; maps to evidence kind 100000007).
 */
export type EvidenceClass = 'image' | 'instruction' | 'email' | 'other' | 'engineer_report';

/* ----------  Extension table (primary signal)  ---------- */

/** Lower-cased file extension (no dot) -> evidence class. */
const EXTENSION_TABLE: Readonly<Record<string, EvidenceClass>> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  pdf: 'instruction',
  docx: 'instruction',
  doc: 'instruction',
  eml: 'email',
};

/* ----------  MIME table (corroborating signal)  ----------
   Used only when the extension is absent/unknown. Explicit non-image types plus an
   `image/*` wildcard (see classifyAttachment): the box-webhook classifier and the
   TKT-124 re-kind migration both treat any honest `image/*` MIME as an image, so a
   `.tiff`/`.heic` scan with an off-table extension is still an image. */

/** Lower-cased MIME content-type -> evidence class. */
const MIME_TABLE: Readonly<Record<string, EvidenceClass>> = {
  'image/jpeg': 'image',
  'image/jpg': 'image',
  'image/png': 'image',
  'application/pdf': 'instruction',
  'application/msword': 'instruction',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'instruction',
  'message/rfc822': 'email',
};

/** Pull the lower-cased extension (without the dot) from a filename, or '' if none. */
export function extensionOf(filename: string): string {
  const name = filename.trim();
  const dot = name.lastIndexOf('.');
  // No dot, or trailing dot, or leading-dot dotfile with no real extension.
  if (dot <= 0 || dot === name.length - 1) return '';
  return name.slice(dot + 1).toLowerCase();
}

/** Normalise a content-type header: strip parameters (`; charset=…`), lower-case. */
function normaliseMime(contentType: string | undefined): string {
  if (!contentType) return '';
  const semi = contentType.indexOf(';');
  const base = semi >= 0 ? contentType.slice(0, semi) : contentType;
  return base.trim().toLowerCase();
}

/* ----------  Engineer-report layout names (TKT-051 / ADR-0021)  ----------
   The parser's engineer-report LAYOUTS — "EVA (Engineers)" / "CNX (Engineers)"
   (`engineer_report: true` in the vendored providers.json) — identify an
   engineering FIRM'S report document. On an audit case that firm is the party
   CE AUDITS, never the instructing work provider, so these names must never be
   treated as a provider (api parser-eva-fields denylist) and an attachment the
   parser typed to one of them is the third-party report to store as
   `engineer_report` evidence (orchestration classifyPersist override). */

const ENGINEER_REPORT_LAYOUT_KEYS: ReadonlySet<string> = new Set(
  [
    'EVA (Engineers)',
    'CNX (Engineers)',
    'Exclusive Vehicle Assessors',
    'Connexus Vehicle Assessors',
  ].map((n) => normaliseLayoutName(n)),
);

/** Normalise a layout/provider name for the engineer-report check: trim, uppercase,
 *  strip parens + light punctuation, collapse whitespace. */
function normaliseLayoutName(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .replace(/[().,'&]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** True when a parser layout/provider NAME is one of the engineer-report layouts. */
export function isEngineerReportLayoutName(raw: string | null | undefined): boolean {
  const key = normaliseLayoutName((raw ?? '').toString());
  return key !== '' && ENGINEER_REPORT_LAYOUT_KEYS.has(key);
}

/**
 * Classify one attachment by filename extension, falling back to MIME.
 * Extension is authoritative; MIME only resolves the unknown-extension case.
 * Anything unrecognised by both tables is `'other'` (never thrown away here —
 * `'other'` Evidence is still persisted; §5.2).
 */
export function classifyAttachment(
  filename: string,
  contentType?: string,
): EvidenceClass {
  const ext = extensionOf(filename);
  const byExt = EXTENSION_TABLE[ext];
  if (byExt) return byExt;

  const mime = normaliseMime(contentType);
  const byMime = MIME_TABLE[mime];
  if (byMime) return byMime;
  // An honest `image/*` MIME beats a missing extension-table entry — a `.tiff`/`.heic`/`.webp`
  // scan is still an image. This mirrors box-webhook `classify_evidence_kind` and the TKT-124
  // re-kind migration (database/migrations/2026-07-09-tkt124-rekind-box-evidence.sql), which the
  // cross-language parity guard pins (TKT-277).
  if (mime.startsWith('image/')) return 'image';

  return 'other';
}

/* ----------  Per-message Evidence shape helper  ----------
   The intake flow writes one Evidence row per attachment (plus one for the
   `.eml` itself). This helper produces the deterministic, framework-free part
   of that row — the bits derived purely from (filename, contentType). Bytes,
   SHA256, and storagePath are added by the flow (graph-intake invariant: bytes
   go to Blob/file-column, never inline), so they are inputs here, not derived. */

/** Discriminated descriptor for one piece of intake evidence. */
export interface EvidenceDescriptor {
  /** Original attachment/message filename, e.g. "IMG_0421.jpg" or "message.eml". */
  filename: string;
  /** Reported MIME content-type, normalised to lower-case base type (no params). */
  contentType: string;
  /** Lower-cased extension (no dot), or '' when the filename has none. */
  extension: string;
  /** Classification class (drives the Evidence `kind`). */
  evidenceClass: EvidenceClass;
  /** Convenience flag: image-class evidence participates in the EVA upload set. */
  isImage: boolean;
  /** Convenience flag: instruction-class evidence is parseable by the PDF mapper. */
  isInstruction: boolean;
}

/**
 * Build the deterministic Evidence descriptor for one attachment.
 * Use `isEmlMessage=true` when describing the message MIME itself (the `.eml`
 * blob), so a stray `.eml` *attachment* and the message body are not conflated.
 */
export function describeEvidence(
  filename: string,
  contentType?: string,
  isEmlMessage = false,
): EvidenceDescriptor {
  const evidenceClass: EvidenceClass = isEmlMessage
    ? 'email'
    : classifyAttachment(filename, contentType);
  return {
    filename,
    contentType: normaliseMime(contentType),
    extension: extensionOf(filename),
    evidenceClass,
    isImage: evidenceClass === 'image',
    isInstruction: evidenceClass === 'instruction',
  };
}
