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
 * Safe degradation: when there is no document attachment, or the blob can't be read, or the
 * parser returns a 4xx, we SKIP gracefully (the case still lands for review) — never worse
 * than the prior always-skip. Only 5xx/network throws, so the Durable retry policy retries.
 *
 * App-settings required: PARSER_FN_URL, PARSER_FN_KEY.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { downloadEvidenceBytes } from '../../lib/blob.js';

interface ParseAttachment {
  filename: string;
  contentType: string;
  blobPath: string;
  size: number;
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

/** Parser-supported document extensions (PDF/Word/RTF — engine-core readers). */
const DOC_EXT = /\.(pdf|docx?|rtf)$/i;
const DOC_CTYPE = /pdf|msword|officedocument|rtf/i;

/** Choose the instruction document: prefer a PDF, else the first parser-supported document. */
function pickInstructionDoc(atts: readonly ParseAttachment[]): ParseAttachment | undefined {
  const docs = atts.filter((a) => DOC_CTYPE.test(a.contentType ?? '') || DOC_EXT.test(a.filename ?? ''));
  return (
    docs.find((a) => /pdf/i.test(a.contentType ?? '') || /\.pdf$/i.test(a.filename ?? '')) ?? docs[0]
  );
}

df.app.activity('parse', {
  handler: async (input: ParseInput, ctx): Promise<unknown> => {
    const corr = input.caseId || input.messageId || '(pre-resolve)';
    if (!gates.pdfMapper()) {
      ctx.log('[parse] skipped — PDF_MAPPER_ENABLED=false');
      return { skipped: true, reason: 'gate_off' };
    }

    const doc = pickInstructionDoc(input.attachments ?? []);
    if (!doc) {
      ctx.log(`[parse] no instruction document attachment for ${corr}; skipping`);
      return { skipped: true, reason: 'no_document' };
    }

    let documentB64: string;
    try {
      const bytes = await downloadEvidenceBytes(doc.blobPath);
      documentB64 = bytes.toString('base64');
    } catch (e) {
      // Transient/missing blob — skip gracefully (case still lands); never fail the orchestration.
      ctx.warn(
        `[parse] could not read evidence blob ${doc.blobPath} for ${corr}: ${e instanceof Error ? e.message : String(e)}; skipping`,
      );
      return { skipped: true, reason: 'blob_unreadable' };
    }

    const res = await fetch(`${process.env.PARSER_FN_URL}/api/parse`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-functions-key': process.env.PARSER_FN_KEY!,
      },
      body: JSON.stringify({
        document: documentB64,
        filename: doc.filename,
        ...(input.providerHint ? { provider_hint: input.providerHint } : {}),
      }),
    });

    if (!res.ok) {
      // 4xx (incl. 422 unreadable) = nothing parseable for this case — skip gracefully so the
      // case still lands (partial case held for review). 5xx/network = transient → throw to retry.
      if (res.status >= 400 && res.status < 500) {
        ctx.log(
          `[parse] parser returned ${res.status} for ${corr} (${doc.filename}); skipping`,
        );
        return { skipped: true, status: res.status };
      }
      throw new Error(`[parse] parser Function responded ${res.status}`);
    }

    ctx.log(JSON.stringify({ evt: 'parse-ok', corr, filename: doc.filename }));
    return res.json();
  },
});
