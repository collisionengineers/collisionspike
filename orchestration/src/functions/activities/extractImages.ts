/**
 * orchestration/src/functions/activities/extractImages.ts  (pdf-image-extraction)
 *
 * Durable activity: extract the vehicle photos EMBEDDED in instruction PDFs/DOCs,
 * persist each as image evidence in Blob + Postgres, run the live OCR plate route to
 * set `registration_visible`, and flag an UNSUITABLE image set (none shows a viewable
 * registration). MVP scope (ADR-0009): extract + persist + registration-visible
 * heuristic + the unsuitable-set flag. Role tagging (overview vs damage) and
 * person/reflection / damage classification are DEFERRED to M2 — NOT done here.
 *
 * Gated by PDF_MAPPER_ENABLED (the parser gate — image extraction rides the parser).
 * Best-effort throughout: a parser/OCR/persist failure on one document or image is
 * caught and logged; intake is never blocked (the orchestrator also wraps the call).
 *
 * Idempotent: extracted bytes land at a DETERMINISTIC child blob path, and the
 * evidence route dedups on (case_id, storage_path) — an at-least-once replay re-uploads
 * the same bytes + re-posts the same rows without creating duplicates.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { callExtractImages, callPlateOcr } from '../../lib/functions-client.js';
import { dataApi } from '../../lib/data-api.js';
import { downloadEvidenceBytes, uploadEvidenceBytes } from '../../lib/blob.js';

interface ExtractAttachment {
  filename: string;
  contentType: string;
  blobPath: string;
  size: number;
}

interface ExtractImagesInput {
  caseId: string;
  messageId?: string;
  attachments?: ExtractAttachment[];
  /** Best-known case VRM — passed to plate OCR so registration_visible reflects a match. */
  caseVrm?: string;
}

/** Documents whose embedded images we expand (PDF/DOCX/DOC — the engine's extractors). */
const IMG_SOURCE_EXT = /\.(pdf|docx?)$/i;
const IMG_SOURCE_CTYPE = /pdf|msword|officedocument/i;
/** Raster suffixes the plate-OCR route accepts (else it 400s on the filename guard). */
const OCR_OK_EXT = /\.(jpe?g|png|bmp|tiff?|webp|heic|heif)$/i;

df.app.activity('extractImages', {
  handler: async (
    input: ExtractImagesInput,
    ctx,
  ): Promise<{ extracted: number; registrationVisible: boolean; skipped?: string }> => {
    if (!gates.pdfMapper()) return { extracted: 0, registrationVisible: false, skipped: 'gate_off' };

    const docs = (input.attachments ?? []).filter(
      (a) => IMG_SOURCE_EXT.test(a.filename ?? '') || IMG_SOURCE_CTYPE.test(a.contentType ?? ''),
    );
    if (!docs.length) return { extracted: 0, registrationVisible: false, skipped: 'no_source' };

    const messageId = input.messageId || input.caseId;
    let totalExtracted = 0;
    let anyRegVisible = false;

    for (const doc of docs) {
      let bytes: Buffer;
      try {
        bytes = await downloadEvidenceBytes(doc.blobPath);
      } catch (e) {
        ctx.warn(`[extractImages] could not read ${doc.blobPath}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }

      let extracted: { count: number; images: import('../../lib/functions-client.js').ExtractedImage[] };
      try {
        extracted = await callExtractImages({ documentBase64: bytes.toString('base64'), filename: doc.filename });
      } catch (e) {
        // 422 unreadable / 502 dep / network — skip this doc (best-effort; never block).
        ctx.warn(`[extractImages] extract failed for ${doc.filename}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
      if (!extracted.images?.length) continue;

      const rows: Parameters<typeof dataApi.persistImageEvidence>[1] = [];
      for (const img of extracted.images) {
        // Child blob path: <pdfBase>__<imgName> (sanitised by blob.ts), deterministic.
        const childName = `${stripExt(doc.filename)}__${img.filename}`;
        let blobPath: string;
        let size: number;
        try {
          const up = await uploadEvidenceBytes(
            messageId,
            childName,
            Buffer.from(img.content_base64, 'base64'),
            img.content_type,
          );
          blobPath = up.blobPath;
          size = up.size;
        } catch (e) {
          ctx.warn(`[extractImages] blob upload failed for ${childName}: ${e instanceof Error ? e.message : String(e)}`);
          continue;
        }

        // registration_visible: tri-state. Run plate OCR ONLY when the gate is on AND
        // the OCR Function is configured AND the filename is a raster image; otherwise
        // leave it undefined (NULL = OCR not run) rather than a misleading false.
        let registrationVisible: boolean | undefined;
        if (gates.plateOcr() && process.env.OCR_FN_URL && OCR_OK_EXT.test(img.filename)) {
          try {
            const ocr = await callPlateOcr({
              imageBase64: img.content_base64,
              filename: img.filename,
              caseVrm: input.caseVrm,
            });
            registrationVisible = Boolean(ocr.registration_visible);
            if (registrationVisible) anyRegVisible = true;
          } catch (e) {
            ctx.warn(`[extractImages] plate OCR failed for ${img.filename}: ${e instanceof Error ? e.message : String(e)}`);
          }
        }

        rows.push({
          filename: childName,
          contentType: img.content_type,
          size,
          blobPath,
          evidenceClass: 'image',
          imageRoleCode: 'unknown', // role tagging is M2 (ADR-0009); default unknown
          acceptedForEva: false, // auto-extracted unknowns: staff tag role + accept
          ...(registrationVisible !== undefined ? { registrationVisible } : {}),
          sha256: img.sha256,
          sequenceIndex: img.sequence_index,
          sourceLabel: `extracted from ${doc.filename}`,
        });
      }

      if (rows.length) {
        try {
          const res = await dataApi.persistImageEvidence(input.caseId, rows);
          totalExtracted += res.persisted;
        } catch (e) {
          ctx.warn(`[extractImages] persist failed for ${doc.filename}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
    }

    // Flag an UNSUITABLE image set: images extracted, but the OCR found a viewable
    // registration on NONE of them — the case still needs an overview photo showing the
    // plate before it can be EVA-ready (the canonical image rule). Handler-facing copy,
    // not implementation terms. Best-effort audit.
    if (totalExtracted > 0) {
      try {
        await dataApi.recordAudit({
          action: 'attachment_classified',
          caseId: input.caseId,
          severity: anyRegVisible ? 'info' : 'warning',
          summary: anyRegVisible
            ? `extracted ${totalExtracted} image(s) from instruction docs; at least one shows the registration`
            : `extracted ${totalExtracted} image(s) from instruction docs, but a photo showing the registration is still needed`,
        });
      } catch {
        /* audit is best-effort */
      }
    }

    ctx.log(JSON.stringify({ evt: 'extractImages', caseId: input.caseId, extracted: totalExtracted, registrationVisible: anyRegVisible }));
    return { extracted: totalExtracted, registrationVisible: anyRegVisible };
  },
});

/** Strip the extension from a filename for the child blob stem. */
function stripExt(name: string): string {
  return name.replace(/\.[^.]+$/, '') || name;
}
