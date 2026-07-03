/**
 * orchestration/src/functions/activities/parse.ts  (activity 4)
 *
 * Durable activity: invoke the Python parser Function (cedocumentmapper engine) to
 * extract structured fields from instruction documents. Gated by PDF_MAPPER_ENABLED.
 *
 * CONTRACT (parser /api/parse, verified in functions/parser/function_app.py):
 *   POST { document: <base64>, filename: <name.ext>, provider_hint?: <principalCode> }
 *   → 200 parsed result | 400 missing_document/missing_filename/bad_base64 | 422 unreadable.
 *
 * The prior implementation posted only `{ caseId }` → parser 400 `missing_document` → every
 * case skipped → no VRM → enrichment starved. This re-reads the instruction document bytes
 * from Blob (landed by fetchMessage A0), base64-encodes them, and sends the real contract.
 *
 * MULTI-DOC (TKT-051/ADR-0021): an audit email carries BOTH the instruction (Word .DOC in
 * the real corpus) AND the third-party engineer's report (PDF). The old single-doc pick
 * preferred PDF, so the EVA report got parsed as "the instruction". Now up to
 * MAX_PARSE_DOCS document attachments are parsed (Word/RTF first), the instruction is
 * SELECTED by the parser's own content_typing, and every parsed doc's typing is returned
 * as `attachmentTypings` for classifyPersist's engineer_report evidence-kind override.
 * Single-doc emails behave exactly as before (one candidate, one parse call).
 *
 * Safe degradation: when there is no document attachment, or the blob can't be read, or the
 * parser returns a 4xx, we SKIP gracefully (the case still lands for review) — never worse
 * than the prior always-skip. Only 5xx/network throws, so the Durable retry policy retries.
 *
 * App-settings required: PARSER_FN_URL, PARSER_FN_KEY.
 */

import * as df from 'durable-functions';
import { isEngineerReportLayoutName } from '@cs/domain';
import { gates } from '@cs/domain/gates';
import { downloadEvidenceBytes } from '../../lib/blob.js';
import { callOcrPdf, type OcrPdfResult } from '../../lib/functions-client.js';

interface ParseAttachment {
  filename: string;
  contentType: string;
  blobPath: string;
  size: number;
}

/** Per-field cell of the parser/OCR envelope ({value, confidence, source, warnings?}). */
type FieldCell = { value?: string } | null | undefined;

/**
 * The subset of the parser `/api/parse` (and `/ocr-pdf`) envelope this activity reads to
 * decide + apply the scanned-PDF OCR fallback and to SELECT the instruction among several
 * parsed documents. `extraction` is the 12-EVA-key map; `vrm` and `reference` are the
 * Case-identity cells; `content_typing` is the parser's content-derived doc type
 * (instruction/report/junk/unknown — rules-engine-v2 Phase 3). Everything else on the
 * envelope is passed through untouched.
 */
interface ParseEnvelope {
  extraction?: Record<string, FieldCell>;
  vrm?: FieldCell;
  reference?: FieldCell;
  content_typing?: { doc_type?: string; provider_name?: string | null; markers?: string[] };
  skipped?: boolean;
  [k: string]: unknown;
}

/** Per-document content typing surfaced to classifyPersist (evidence-kind override). */
export interface AttachmentTyping {
  blobPath: string;
  filename: string;
  docType: string;
  providerName: string | null;
  markers: string[];
}

const hasValue = (cell: FieldCell): boolean => (cell?.value ?? '').trim() !== '';

/**
 * Decide whether a successful text-parse warrants the scanned-PDF OCR fallback.
 *
 * HEURISTIC (honest-signal note): the `/api/parse` envelope carries NO `ocr_text`/page
 * text-length to threshold on (see functions/parser/function_app.py's response shape), so
 * "scanned/image-only" is inferred from the ONLY signal it does carry — a PDF that parsed
 * with EVERY one of the 12 EVA fields empty AND no vrm/reference. The FC1 parser lacks the
 * `tesseract` binary, so an image-only PDF returns 200 with an empty extraction rather than
 * throwing; that empty yield on a `.pdf` is the scanned tell. Non-PDF docs never qualify
 * (the OCR host only accepts `.pdf`). A partial extraction (any field filled) is NOT re-OCR'd
 * — the text layer was readable.
 */
export function shouldAttemptScannedPdfOcr(parsed: ParseEnvelope, filename: string): boolean {
  if (parsed.skipped) return false;
  if (!/\.pdf$/i.test(filename)) return false;
  const cells = Object.values(parsed.extraction ?? {});
  const anyFieldFilled = cells.some(hasValue);
  return !anyFieldFilled && !hasValue(parsed.vrm) && !hasValue(parsed.reference);
}

/**
 * Coalesce an OCR result onto a text-parse result: the OCR text fills ONLY the fields the
 * parser left empty (parser wins wherever it extracted a value; OCR never overwrites). Pure
 * — returns a NEW envelope, mutates neither input. Applies to the 12 extraction fields and
 * to vrm/reference independently.
 */
export function coalesceOcrIntoParse(parsed: ParseEnvelope, ocr: OcrPdfResult): ParseEnvelope {
  const mergedExtraction: Record<string, FieldCell> = { ...(parsed.extraction ?? {}) };
  const ocrExtraction = ocr.extraction ?? {};
  for (const [key, ocrCell] of Object.entries(ocrExtraction)) {
    if (!hasValue(mergedExtraction[key]) && hasValue(ocrCell)) {
      mergedExtraction[key] = ocrCell;
    }
  }
  const merged: ParseEnvelope = { ...parsed, extraction: mergedExtraction };
  if (!hasValue(parsed.vrm) && hasValue(ocr.vrm)) merged.vrm = ocr.vrm;
  if (!hasValue(parsed.reference) && hasValue(ocr.reference)) merged.reference = ocr.reference;
  return merged;
}

interface ParseInput {
  /** Optional: parse now runs BEFORE the case exists (its VRM feeds case-create, #7), so
   *  caseId may be absent — `messageId` is the correlation id for logs in that case. */
  caseId?: string;
  messageId?: string;
  /** Attachments landed by fetchMessage (filename/contentType/blobPath/size). */
  attachments?: ParseAttachment[];
  /** Matched provider principal code, passed to the parser as provider_hint. */
  providerHint?: string;
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

const isPdf = (a: ParseAttachment): boolean =>
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
 */
export function orderParseCandidates(atts: readonly ParseAttachment[]): ParseAttachment[] {
  const docs = atts.filter((a) => DOC_CTYPE.test(a.contentType ?? '') || DOC_EXT.test(a.filename ?? ''));
  if (!docs.length) return [];
  const nonEmail = docs.filter((a) => !isEmailFile(a));
  const pool = nonEmail.length ? nonEmail : docs.filter(isEmailFile);
  return [...pool.filter((a) => !isPdf(a)), ...pool.filter(isPdf)];
}

/**
 * Select the instruction envelope among the parsed candidates. Probed against the REAL
 * audit corpus (TKT-051 / A.PCH261339 / the QDOS letters), the honest signals rank:
 *
 *  1. The extraction's own `work_provider` — a document whose detected layout yielded a
 *     real (non-empty, non-UNKNOWN) work provider IS the instruction: engineer-report
 *     layouts (EVA/CNX) yield '' BY DESIGN (engine-v2.6), and the content typing is NOT
 *     reliable here — the real PCH audit instruction .DOC content-types as `report` (its
 *     title says "Audit Report") while the attached EVA report types as `instruction`.
 *  2. A doc content-typed `instruction` whose typing provider is NOT an engineer-report
 *     layout (covers unknown-provider instructions, where work_provider is UNKNOWN).
 *  3. The OLD single-doc preference (PDF first, else the first candidate) — unchanged
 *     behaviour for emails the signals cannot place.
 */
export function selectInstructionIndex(
  parsed: ReadonlyArray<{ att: ParseAttachment; envelope: ParseEnvelope }>,
): number {
  const byProvider = parsed.findIndex((p) => {
    const wp = (p.envelope.extraction?.work_provider?.value ?? '').trim();
    return wp !== '' && wp.toUpperCase() !== 'UNKNOWN';
  });
  if (byProvider >= 0) return byProvider;
  const typed = parsed.findIndex(
    (p) =>
      (p.envelope.content_typing?.doc_type ?? '') === 'instruction' &&
      !isEngineerReportLayoutName(p.envelope.content_typing?.provider_name),
  );
  if (typed >= 0) return typed;
  const pdf = parsed.findIndex((p) => isPdf(p.att));
  return pdf >= 0 ? pdf : 0;
}

/** Outcome of one candidate's parse attempt (see parseOneCandidate). */
type CandidateOutcome =
  | { outcome: 'ok'; envelope: ParseEnvelope; documentB64: string }
  | { outcome: 'skip' }
  | { outcome: 'auth'; status: number };

df.app.activity('parse', {
  handler: async (input: ParseInput, ctx): Promise<unknown> => {
    const corr = input.caseId || input.messageId || '(pre-resolve)';
    if (!gates.pdfMapper()) {
      ctx.log('[parse] skipped — PDF_MAPPER_ENABLED=false');
      return { skipped: true, reason: 'gate_off' };
    }

    const candidates = orderParseCandidates(input.attachments ?? []);
    if (!candidates.length) {
      ctx.log(`[parse] no instruction document attachment for ${corr}; skipping`);
      return { skipped: true, reason: 'no_document' };
    }
    if (candidates.length > MAX_PARSE_DOCS) {
      // No silent caps: name what was dropped so an instruction hiding beyond the bound
      // is diagnosable from the logs.
      ctx.log(
        JSON.stringify({
          evt: 'parse-candidates-capped',
          corr,
          parsed: candidates.slice(0, MAX_PARSE_DOCS).map((a) => a.filename),
          dropped: candidates.slice(MAX_PARSE_DOCS).map((a) => a.filename),
        }),
      );
    }

    /** Parse ONE candidate; failures degrade to 'skip' so the next candidate still runs.
     *  Only a parser 5xx/network fault throws (Durable retries the whole activity). */
    const parseOneCandidate = async (att: ParseAttachment): Promise<CandidateOutcome> => {
      let documentB64: string;
      try {
        const bytes = await downloadEvidenceBytes(att.blobPath);
        documentB64 = bytes.toString('base64');
      } catch (e) {
        // Transient/missing blob — skip this candidate (case still lands); never fail the run.
        ctx.warn(
          `[parse] could not read evidence blob ${att.blobPath} for ${corr}: ${e instanceof Error ? e.message : String(e)}; skipping candidate`,
        );
        return { outcome: 'skip' };
      }

      const res = await fetch(`${process.env.PARSER_FN_URL}/api/parse`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-functions-key': process.env.PARSER_FN_KEY!,
        },
        body: JSON.stringify({
          document: documentB64,
          filename: att.filename,
          ...(input.providerHint ? { provider_hint: input.providerHint } : {}),
        }),
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          // Auth/config (e.g. wrong/missing PARSER_FN_KEY) — a 401/403 disables ALL parsing
          // invisibly if folded into the silent 4xx skip below, so surface it loudly (mirrors
          // enrich.ts). Don't throw: a config fault won't fix on retry, and parsing must never
          // block the case from landing.
          ctx.error(
            `[parse] parser auth/config error ${res.status} for ${corr} (${att.filename}) — check PARSER_FN_KEY`,
          );
          return { outcome: 'auth', status: res.status };
        }
        // Other 4xx (incl. 422 unreadable / 400 bad doc) = this document is unparseable — skip
        // the candidate so the others still run. 5xx/network = transient → throw to retry.
        if (res.status >= 400 && res.status < 500) {
          ctx.log(`[parse] parser returned ${res.status} for ${corr} (${att.filename}); skipping candidate`);
          return { outcome: 'skip' };
        }
        throw new Error(`[parse] parser Function responded ${res.status}`);
      }

      const envelope = (await res.json()) as ParseEnvelope;
      ctx.log(JSON.stringify({ evt: 'parse-ok', corr, filename: att.filename }));
      return { outcome: 'ok', envelope, documentB64 };
    };

    // Parse each candidate (bounded). Sequential on purpose: the FC1 parser is a small
    // single-worker app and the typical email has exactly one document anyway.
    const parsedDocs: Array<{ att: ParseAttachment; envelope: ParseEnvelope; documentB64: string }> = [];
    for (const att of candidates.slice(0, MAX_PARSE_DOCS)) {
      const result = await parseOneCandidate(att);
      if (result.outcome === 'auth') return { skipped: true, error: 'auth', status: result.status };
      if (result.outcome === 'ok') {
        parsedDocs.push({ att, envelope: result.envelope, documentB64: result.documentB64 });
      }
    }
    if (!parsedDocs.length) {
      // Every candidate was unreadable/unparseable — same net effect as the old single-doc
      // skip: the case still lands for review on the email-sniff VRM.
      return { skipped: true, reason: 'no_parseable_document' };
    }

    // Per-document content typing for classifyPersist's evidence-kind override (ADR-0014:
    // a report-typed attachment on an audit case is stored as engineer_report evidence).
    const attachmentTypings: AttachmentTyping[] = parsedDocs.map((p) => ({
      blobPath: p.att.blobPath,
      filename: p.att.filename,
      docType: (p.envelope.content_typing?.doc_type ?? 'unknown').toString(),
      providerName: p.envelope.content_typing?.provider_name ?? null,
      markers: p.envelope.content_typing?.markers ?? [],
    }));

    const chosenIndex = selectInstructionIndex(parsedDocs);
    const doc = parsedDocs[chosenIndex].att;
    const documentB64 = parsedDocs[chosenIndex].documentB64;
    const parsed: ParseEnvelope = { ...parsedDocs[chosenIndex].envelope, attachmentTypings };
    if (parsedDocs.length > 1) {
      ctx.log(
        JSON.stringify({
          evt: 'parse-instruction-selected',
          corr,
          chosen: doc.filename,
          docTypes: attachmentTypings.map((t) => `${t.filename}:${t.docType}`),
        }),
      );
    }

    // Scanned-PDF OCR fallback (OCR_SCANNED_PDF_ENABLED). When the text parse yielded ~nothing
    // for a PDF (image-only/scanned — see shouldAttemptScannedPdfOcr) AND the gate + OCR_FN_URL
    // are configured, re-run the SAME bytes through the OCR Function and coalesce its text into
    // the empty fields. Failure-tolerant exactly like plate-OCR (catch + warn, never block
    // intake): a scanned doc that also fails OCR still lands as an empty parse for staff review.
    if (gates.ocrScannedPdf() && shouldAttemptScannedPdfOcr(parsed, doc.filename)) {
      if (!process.env.OCR_FN_URL) {
        ctx.log(`[parse] scanned PDF for ${corr} (${doc.filename}) but OCR_FN_URL unconfigured; skipping OCR fallback`);
        return parsed;
      }
      ctx.log(JSON.stringify({ evt: 'parse-ocr-fallback', corr, filename: doc.filename, reason: 'empty_text_extraction' }));
      try {
        const ocr = await callOcrPdf({
          documentBase64: documentB64,
          filename: doc.filename,
          ...(input.providerHint ? { providerHint: input.providerHint } : {}),
        });
        const merged = coalesceOcrIntoParse(parsed, ocr);
        const filled = Object.keys(merged.extraction ?? {}).filter(
          (k) => (merged.extraction?.[k]?.value ?? '').trim() && !(parsed.extraction?.[k]?.value ?? '').trim(),
        );
        ctx.log(
          JSON.stringify({
            evt: 'parse-ocr-fallback-ok',
            corr,
            provider: ocr.ocr_provider,
            pageCount: ocr.page_count,
            fieldsFilled: filled.length,
          }),
        );
        return merged;
      } catch (e) {
        ctx.warn(
          `[parse] OCR fallback failed for ${corr} (${doc.filename}) (best-effort, continuing with text parse): ${e instanceof Error ? e.message : String(e)}`,
        );
        return parsed;
      }
    }

    return parsed;
  },
});
