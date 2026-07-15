/**
 * api/src/functions/image-analysis.ts — the GATED, additive image-analysis suggestion producer
 * route (TKT-016). The Data-API side of the observation-first pipeline:
 *
 *   POST /api/cases/{id}/image-analysis/generate
 *     - honest NO-OP { generated: 0, reason: 'disabled' } when IMAGE_ANALYSIS_ENABLED is off OR
 *       no model is configured (the permanent live state — the gate ships DARK);
 *     - else: loads PERSISTED evidence + case context (NOT the Graph webhook path — TKT-016
 *       Evidence section), runs the staged sequence (image-analysis.ts) with the network adapters
 *       (image-analysis-adapters.ts), and persists each observation as an `ai_suggestion` row
 *       (review_state DEFAULT 'pending' — never auto-confirmed).
 *
 * CARDINAL CONSTRAINT (see image-analysis.ts): this route ONLY inserts `ai_suggestion` rows. It
 * NEVER writes evidence.image_role_code / registration_visible / excluded, case_.vrm, or any
 * inspection-address column — the live TKT-064 classifier owns those; reconciliation is TKT-088/112.
 * Promotion into those columns happens ONLY through the existing human-accept path
 * (POST /api/ai-suggestions/{id}/review). ADR-0013: staff pick; no runtime auto-matcher.
 *
 * RELIABILITY (Azure Functions well-architected — reliability): idempotent + retry-safe (a re-run
 * does NOT duplicate a still-pending suggestion for the same target+type — the NOT EXISTS guard),
 * never throws (a configured-but-unreachable model/OCR/location degrades to a graceful empty), and
 * every run + every minted suggestion is audited for App Insights traceability.
 */

import { app } from '@azure/functions';
import type { GenerateAiSuggestionsResult } from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { gates } from '../lib/gates.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import type { Row } from '../lib/mappers.js';
import { resolveBytesForRow, ASSIST_MAX_BYTES_PER_PHOTO, type EvidenceByteRow } from '../lib/evidence-bytes.js';
import { makeImageAnalysisAdapters } from '../lib/image-analysis-adapters.js';
import {
  runImageAnalysis,
  type CaseContext,
  type ImageInput,
  type ImageAnalysisDraft,
} from '../lib/image-analysis.js';

/** Cap on how many persisted images one run reasons over — bounds the (egress-bearing) VLM calls
 *  and the request size, exactly as the location-assist path caps its inline photos. */
const MAX_IMAGES_PER_RUN = 8;

/** fast-alpr / the VLM data-URL need a real raster extension; synthesise one from the content-type
 *  when the stored filename lacks (or misreports) it. */
const RASTER_SUFFIXES = ['.jpg', '.jpeg', '.png', '.bmp', '.tif', '.tiff', '.heif', '.heic', '.webp'];
function rasterFilename(fileName: string | null, contentType: string): string {
  const name = (fileName ?? '').trim();
  if (name && RASTER_SUFFIXES.some((s) => name.toLowerCase().endsWith(s))) return name;
  const ct = (contentType || '').toLowerCase();
  const ext = ct.includes('png')
    ? '.png'
    : ct.includes('webp')
      ? '.webp'
      : ct.includes('tif')
        ? '.tif'
        : ct.includes('bmp')
          ? '.bmp'
          : ct.includes('heif') || ct.includes('heic')
            ? '.heic'
            : '.jpg';
  const base = name.replace(/\.[^.]*$/, '') || 'image';
  return `${base}${ext}`;
}

app.http('generateImageAnalysis', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/image-analysis/generate',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    // Two-part gate: the master switch AND a configured model endpoint+deployment. Either off ->
    // honest no-op (no DB write, no external call). This is the permanent live path (gate DARK).
    if (!gates.imageAnalysisEnabled()) {
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'disabled' };
      return { status: 200, jsonBody: result };
    }

    const caseId = req.params.id;
    try {
      // Minimal case context — never a full case dump (data-protection §6). The VRM is a
      // CROSS-CHECK only (matchesCaseVrm); it is never written back from a photo read (ADR-0013).
      const caseRows = await query<Row>(
        `SELECT case_po, vrm, eva_accident_circumstances, eva_claimant_address
           FROM case_ WHERE id = $1`,
        [caseId],
      );
      if (!caseRows[0]) return { status: 404, jsonBody: { error: 'not found' } };
      const cr = caseRows[0];
      const caseContext: CaseContext = {
        caseId,
        ...(typeof cr.case_po === 'string' && cr.case_po ? { casePo: cr.case_po } : {}),
        ...(typeof cr.vrm === 'string' && cr.vrm ? { caseVrm: cr.vrm } : {}),
        ...(typeof cr.eva_accident_circumstances === 'string' && cr.eva_accident_circumstances
          ? { accidentCircumstances: cr.eva_accident_circumstances }
          : {}),
        ...(typeof cr.eva_claimant_address === 'string' && cr.eva_claimant_address
          ? { claimantAddress: cr.eva_claimant_address }
          : {}),
      };

      // Persisted, non-excluded image evidence only (mirrors GET /api/cases/{id}/images).
      const evRows = await query<EvidenceByteRow & Row>(
        `SELECT id, storage_path, content_type, file_name, box_file_id, image_role_code
           FROM evidence
          WHERE case_id = $1
            AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image')
            AND excluded <> true
          ORDER BY sequence_index NULLS LAST, created_at
          LIMIT ${MAX_IMAGES_PER_RUN}`,
        [caseId],
      );

      // Resolve bytes (blob → Box facade) into pipeline ImageInputs; drop any that don't resolve.
      // SKIP oversized images BEFORE base64-encoding them into a vision request — existing evidence
      // can include multi-megabyte phone photos/Box files, and 8 of them base64'd (+~33%) would
      // build a very large in-memory payload and then trip AOAI request-size/time limits, degrading
      // the whole run to reason:'error'. Same per-photo cap the location-assist inline byte path
      // uses (evidence-bytes.ts). A skipped image simply gets no suggestion; the run still proceeds.
      const images: ImageInput[] = [];
      let oversizeSkipped = 0;
      for (const row of evRows) {
        const resolved = await resolveBytesForRow(row);
        if (!resolved) continue;
        if (resolved.bytes.length > ASSIST_MAX_BYTES_PER_PHOTO) {
          oversizeSkipped += 1;
          ctx.warn(
            `[image-analysis] skipped oversized image evidence=${resolved.id} bytes=${resolved.bytes.length} (cap ${ASSIST_MAX_BYTES_PER_PHOTO})`,
          );
          continue;
        }
        images.push({
          evidenceId: resolved.id,
          filename: rasterFilename(resolved.fileName, resolved.contentType),
          imageBase64: resolved.bytes.toString('base64'),
          contentType: resolved.contentType,
        });
      }

      if (images.length === 0) {
        const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'no_input' };
        return { status: 200, jsonBody: result };
      }

      // Run the staged sequence with the live adapters, then persist each observation as a
      // pending ai_suggestion. Model-version stamps: the VLM deployment for scene/set stages,
      // 'fast-alpr' for the local reg reads.
      const { drafts, stageOutcomes } = await runImageAnalysis(
        caseContext,
        images,
        makeImageAnalysisAdapters(),
        { sceneModelVersion: gates.aiModelDeployment(), plateModelVersion: 'fast-alpr' },
      );

      const actor = actorFromClaims(claims);
      let generated = 0;
      for (const d of drafts) {
        const id = await persistDraft(caseId, d);
        if (!id) continue; // already had an equivalent pending suggestion (idempotent re-run)
        generated += 1;
        await writeAudit({
          action: AUDIT_ACTION.ai_suggestion_created,
          caseId,
          summary: `Image-analysis suggestion ${d.suggestionType} created`,
          after: { suggestionId: id, suggestionType: d.suggestionType, ...(d.evidenceId ? { evidenceId: d.evidenceId } : {}) },
          ...(actor ? { actor } : {}),
        });
      }

      // Run-level audit (distinct from the per-suggestion rows) — records what the run did + which
      // stages degraded. FK-degrades to "no row" until 2026-07-08-image-analysis DDL lands (dark).
      await writeAudit({
        action: AUDIT_ACTION.image_analysis_generated,
        caseId,
        summary: `Image-analysis run: ${generated} suggestion(s) from ${images.length} image(s)`,
        after: {
          generated,
          imagesAnalyzed: images.length,
          ...(oversizeSkipped ? { oversizeSkipped } : {}),
          stageOutcomes,
        },
        ...(actor ? { actor } : {}),
      });

      ctx.log(`[image-analysis] case=${caseId} images=${images.length} generated=${generated}`);
      const result: GenerateAiSuggestionsResult = { generated };
      return { status: 200, jsonBody: result };
    } catch (e) {
      // A configured-but-unreachable model / OCR / location, or a transient DB error, degrades
      // honestly (never a 500 — never a stack). No partial auto-write can escape: the only writes
      // are ai_suggestion INSERTs, each independently guarded above.
      ctx.warn(`[image-analysis] run failed: ${e instanceof Error ? e.message : String(e)}`);
      const result: GenerateAiSuggestionsResult = { generated: 0, reason: 'error' };
      return { status: 200, jsonBody: result };
    }
  }),
});

/**
 * Persist one draft as a pending ai_suggestion, IDEMPOTENTLY: the NOT EXISTS guard skips the
 * insert when an equivalent PENDING suggestion for the same (case, evidence, type) already exists,
 * so a retry/replay never duplicates. Returns the new id, or null when skipped. Never promotes
 * anything — promotion is the human-accept path only.
 */
async function persistDraft(caseId: string, d: ImageAnalysisDraft): Promise<string | null> {
  const rows = await query<Row>(
    `INSERT INTO ai_suggestion
        (case_id, evidence_id, suggestion_type, suggested_value, rationale, confidence, model_version)
     SELECT $1, $2, $3, $4::jsonb, $5, $6, $7
      WHERE NOT EXISTS (
        SELECT 1 FROM ai_suggestion
         WHERE suggestion_type = $3
           AND review_state = 'pending'
           AND case_id IS NOT DISTINCT FROM $1
           AND evidence_id IS NOT DISTINCT FROM $2
      )
     RETURNING id`,
    [
      caseId,
      d.evidenceId ?? null,
      d.suggestionType,
      JSON.stringify(d.suggestedValue),
      d.rationale ?? null,
      d.confidence ?? null,
      d.modelVersion ?? null,
    ],
  );
  return rows[0]?.id ? String(rows[0].id) : null;
}
