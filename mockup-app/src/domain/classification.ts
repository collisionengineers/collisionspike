/* ============================================================
   Collision Engineers — Attachment classification (DOMAIN LOGIC, M1).

   Re-implements collisioncc `graph-intake.ts` attachment classification on the
   collisionspike domain model (Phase-1 plan §5.2). The Power Automate
   `Flow_Intake` Apply-to-each branch mirrors THIS table; the flow never
   re-derives the mapping in Power Fx — it is verified here as a pure decision
   table and the flow branch is lint-checked against it.

   Mapping (deterministic, mirrors graph-intake):
     .jpg / .jpeg / .png            -> 'image'
     .pdf / .docx / .doc            -> 'instruction'
     .eml  (the message itself)     -> 'email'
     anything else                  -> 'other'

   Extension is the primary signal; the MIME content-type is a corroborating
   signal only — extension wins when the two disagree (filenames are what the
   provider controls and what the Box/EVA pipeline keys on). NEVER call
   collisioncc at runtime.

   PURE + DETERMINISTIC + FRAMEWORK-FREE. No React, no I/O, no live calls.
   ============================================================ */

/** The four evidence classes the intake pipeline distinguishes at attachment time. */
export type EvidenceClass = 'image' | 'instruction' | 'email' | 'other';

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
   Used only when the extension is absent/unknown. Mirrors the extension table
   so the two never disagree on a known type. */

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

  const byMime = MIME_TABLE[normaliseMime(contentType)];
  if (byMime) return byMime;

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
  /** Classification class (drives the Dataverse Evidence `kind`). */
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
