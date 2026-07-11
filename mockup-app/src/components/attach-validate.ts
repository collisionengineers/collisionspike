/* ============================================================
   Collision Engineers — assistant attach-evidence client helpers (TKT-068).

   Pure, deterministic helpers for the assistant drawer's attach affordance:

     - `classifyAttachment` / `partitionAttachments` — a CLIENT-SIDE mirror of the
       server's size/type gate (api/src/lib/upload-validate.ts) so an oversized or
       unsupported file gets a fast, plain-language "no" before any upload. The
       SERVER stays the enforcer; this is only a courtesy pre-check.
     - `detectCaseRef` — sniff a target-case handle (registration or Case/PO) out of
       the conversation text so the confirm card can pre-fill it. The MODEL resolves
       the case conversationally; this only pre-fills what the human then confirms.
     - `attachmentNote` / `fileCountLabel` — the plain-language strings the drawer
       shows the human and describes to the model (file COUNT + KIND only — never the
       filenames, which can carry claimant names / registrations / claim refs, and never
       the bytes; the human uploads the files via the staff route).

   UI-LANGUAGE RULE (AGENTS.md): every returned string is handler-facing — no
   engineering terms ("MIME", "blob", "payload", status codes). Reasons mirror the
   server's own plain wording so the two layers speak with one voice.

   PURE + DETERMINISTIC. No I/O.
   ============================================================ */
import { CASE_PO_SHAPE_RE, canonicalizeVrm, extractVrm, normalizeCasePo } from '@cs/domain';

/** Client-side size cap — mirrors the server's MAX_UPLOAD_BYTES (upload-validate.ts). */
export const MAX_ATTACH_BYTES = 15 * 1024 * 1024; // 15 MB

export type AttachKind = 'image' | 'document';

/** The minimal file shape the classifier reads (a browser `File` satisfies it). */
export interface AttachFileMeta {
  name: string;
  type: string;
  size: number;
}

export type AttachCheck = { ok: true; kind: AttachKind } | { ok: false; reason: string };

/**
 * Classify + size-check ONE attachment, mirroring the server gate exactly: only photos
 * (image/*) and PDFs, only up to the size cap, nothing empty. Rejection reasons are the
 * SAME plain-language wording the server returns, so a client-side "no" and a server-side
 * "no" read identically to the handler.
 */
export function classifyAttachment(file: AttachFileMeta): AttachCheck {
  const size = file.size;
  if (!Number.isFinite(size) || size <= 0) {
    return { ok: false, reason: 'That file looks empty, so I did not add it.' };
  }
  if (size > MAX_ATTACH_BYTES) {
    return { ok: false, reason: 'That file is too big — the limit is 15 MB.' };
  }
  const ct = (file.type || '').toLowerCase().split(';')[0].trim();
  if (ct === 'application/pdf') return { ok: true, kind: 'document' };
  if (ct.startsWith('image/')) return { ok: true, kind: 'image' };
  return { ok: false, reason: 'I can only add photos and PDFs to a case.' };
}

export interface PartitionedAttachments {
  /** Files that passed the client-side gate — held for the human to confirm + upload. */
  accepted: File[];
  /** Files turned away, each with a plain-language reason to show the handler. */
  rejected: Array<{ name: string; reason: string }>;
}

/** Split a freshly-picked file set into the ones to hold and the ones to explain away. */
export function partitionAttachments(files: File[]): PartitionedAttachments {
  const accepted: File[] = [];
  const rejected: Array<{ name: string; reason: string }> = [];
  for (const f of files) {
    const check = classifyAttachment(f);
    if (check.ok) accepted.push(f);
    else rejected.push({ name: f.name, reason: check.reason });
  }
  return { accepted, rejected };
}

/** "1 file" / "3 files" — the plural-safe count label reused across the attach UI. */
export function fileCountLabel(n: number): string {
  return `${n} file${n === 1 ? '' : 's'}`;
}

/**
 * The plain-language note the drawer appends to a turn so the MODEL knows files are attached —
 * COUNT + KIND only, NEVER the filenames. Filenames routinely carry claimant names, registrations,
 * claim references or addresses, so sending them would leak PII to the external assistant model the
 * moment a handler asks a question with files attached (the "bytes are never sent" safeguard does not
 * cover the metadata). The model needs only to know files are present; the human resolves the target
 * case conversationally (by registration / Case/PO they type), and the model has no upload tool.
 * e.g. "Attached 2 files (2 photos)." / "Attached 3 files (2 photos, 1 PDF)."
 */
export function attachmentNote(files: AttachFileMeta[]): string {
  let photos = 0;
  let docs = 0;
  for (const f of files) {
    const c = classifyAttachment(f);
    if (c.ok && c.kind === 'image') photos += 1;
    else if (c.ok && c.kind === 'document') docs += 1;
  }
  const kinds: string[] = [];
  if (photos) kinds.push(`${photos} photo${photos === 1 ? '' : 's'}`);
  if (docs) kinds.push(`${docs} PDF${docs === 1 ? '' : 's'}`);
  const kindStr = kinds.length ? ` (${kinds.join(', ')})` : '';
  return `Attached ${fileCountLabel(files.length)}${kindStr}.`;
}

/** A target-case handle sniffed out of conversation text. */
export interface DetectedCaseRef {
  /** A vehicle registration (canonical, no spaces) — the confirm card resolves by this. */
  vrm?: string;
  /** A Case/PO reference (normalised) — a display hint when no registration is present. */
  casePo?: string;
}

/** One immutable attachment turn waiting for staff confirmation. */
export interface PendingAttachmentBatch<T extends AttachFileMeta = File> {
  id: string;
  files: readonly T[];
  suggestedVrm?: string;
  suggestedCasePo?: string;
  targetCaptured: boolean;
}

/** Start a batch only when none is pending. A second picker/send cannot replace it. */
export function startPendingAttachmentBatch<T extends AttachFileMeta>(
  current: PendingAttachmentBatch<T> | null,
  files: readonly T[],
  id: string,
): { batch: PendingAttachmentBatch<T>; accepted: boolean } {
  if (current) return { batch: current, accepted: false };
  return {
    batch: { id, files: [...files], targetCaptured: false },
    accepted: true,
  };
}

/** Capture the attachment turn's target once; later conversation cannot retarget it. */
export function capturePendingAttachmentTarget<T extends AttachFileMeta>(
  batch: PendingAttachmentBatch<T>,
  conversationAtTurn: string,
): PendingAttachmentBatch<T> {
  if (batch.targetCaptured) return batch;
  const ref = detectCaseRef(conversationAtTurn);
  return {
    ...batch,
    targetCaptured: true,
    ...(ref.vrm ? { suggestedVrm: ref.vrm } : {}),
    ...(ref.casePo ? { suggestedCasePo: ref.casePo } : {}),
  };
}

/**
 * Sniff a target-case handle (registration and/or Case/PO) out of the recent conversation
 * so the confirm card can PRE-FILL what the human then confirms. The model does the real
 * resolution (via its read-only lookup tool); this is only a convenience so the handler
 * rarely has to retype the registration. Purely lexical — reuses the domain's shared VRM
 * sniff and Case/PO shape rule so it agrees with the rest of the app.
 */
export function detectCaseRef(text: string): DetectedCaseRef {
  const out: DetectedCaseRef = {};
  const vrm = extractVrm(text || '');
  if (vrm) out.vrm = canonicalizeVrm(vrm);
  for (const token of (text || '').split(/[\s,;.]+/)) {
    const norm = normalizeCasePo(token);
    if (norm && CASE_PO_SHAPE_RE.test(norm)) {
      out.casePo = norm;
      break;
    }
  }
  return out;
}
