/**
 * services/data-api/src/features/cases/inspection-routes.ts — inspection-address corpus HTTP routes.
 *
 * DataAccess methods 11–13 (plan 21 §21.1):
 *   11 GET  /api/cases/{id}/inspection-suggestions    inspectionAddressSuggestions (honest [])
 *   12 GET  /api/inspection-addresses/counts          inspectionAddressCounts (honest 0/0)
 *   13 POST /api/cases/{id}/inspection-decision       saveInspectionDecision (honest no-op)
 *
 * "Honest-off / honest-empty" (plan 21 conventions): 11 + 12 resolve 200 with the
 * empty/zero default on ANY failure (never 5xx); 13 resolves { persisted:false } when
 * the durable write cannot happen — preserving the seam's degradation the vitest suite
 * asserts. ADR-0013 (BINDING): saveInspectionDecision records a HUMAN-confirmed pick;
 * it reintroduces NO runtime address matcher and never auto-confirms.
 */

import { app } from '@azure/functions';
import {
  SaveInspectionDecisionParams,
  type InspectionAddressCounts,
  type SaveInspectionDecisionResult,
  type SuggestedAddress,
} from '@cs/domain';
import { inspectionDecisionCodec } from '@cs/domain/codecs';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { ifMatch, versionToken } from '../../platform/http/concurrency.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../../shared/audit.js';
import {
  acknowledgeStatusRecompute,
  requestStatusRecompute,
} from './status-recompute.js';
import { recomputeStatus } from './case-support.js';
import {
  isSuggestedAddressRow,
  principalFromCasePo,
  rowToSuggestedAddress,
  scopeSuggestions,
  sortSuggestions,
  type Row,
} from '../../shared/mapping/index.js';
import { extractPostcode, geocodePostcode, haversineMiles } from '../../shared/maps.js';

const CONFIRMED_PHYSICAL = inspectionDecisionCodec.toInt('confirmed_physical'); // 100000000

/** Default shortlist size — the corpus is ~2,200 rows, so returning the whole set
 *  buried the picker (TKT-062). Staff see a ranked shortlist; "?q=" searches the rest. */
const SHORTLIST_LIMIT = 8;
const SEARCH_LIMIT = 25;

/** Case-insensitive substring match over an address's lines + postcode. */
function addressMatches(a: SuggestedAddress, needle: string): boolean {
  const hay = `${a.lines.join(' ')} ${a.postcode}`.toLowerCase();
  return hay.includes(needle);
}

// 11 — GET /api/cases/{id}/inspection-suggestions[?q=]   (honest [])
//   no q  → the ranked, provider-scoped SHORTLIST (≤ SHORTLIST_LIMIT)
//   ?q=…  → a search across the WHOLE suggestion corpus (≤ SEARCH_LIMIT), still ranked
app.http('inspectionAddressSuggestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/inspection-suggestions',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const id = req.params.id;
      const q = (req.query.get('q') ?? '').trim().toLowerCase();

      const rows = await query<Row>(
        "SELECT * FROM inspection_address WHERE source_label LIKE 'suggested%'",
      );
      const suggestedRows = rows.filter(isSuggestedAddressRow);

      // Proximity centroid (ADR-0016 #2b, ORDERING ONLY): the case's accident postcode
      // (preferred) or claimant postcode. Degrades to no-proximity when nothing geocodes
      // (no AZURE_MAPS_KEY, no postcode, or the geocode fails) — never blocks the shortlist.
      const caseRows = await query<Row>(
        'SELECT case_po, eva_accident_circumstances, eva_claimant_address FROM case_ WHERE id = $1',
        [id],
      );
      const caseRow = caseRows[0];
      const casePostcode =
        extractPostcode(caseRow?.eva_accident_circumstances as string | null) ??
        extractPostcode(caseRow?.eva_claimant_address as string | null);
      const centroid = await geocodePostcode(casePostcode);

      const withDistance = (r: Row): SuggestedAddress => {
        const a = rowToSuggestedAddress(r);
        if (centroid && r.latitude != null && r.longitude != null) {
          a.distanceMiles =
            Math.round(haversineMiles(centroid, { lat: Number(r.latitude), lon: Number(r.longitude) }) * 10) /
            10;
        }
        return a;
      };
      const all = suggestedRows.map(withDistance);

      // Search mode: substring over the full corpus, ranked (proximity-aware), capped.
      if (q.length >= 2) {
        return {
          status: 200,
          jsonBody: sortSuggestions(all.filter((a) => addressMatches(a, q)), {
            byDistance: !!centroid,
          }).slice(0, SEARCH_LIMIT),
        };
      }

      // Shortlist mode: scope by the leading-alpha PRINCIPAL parsed from the Case/PO. When no
      // provider-specific rows match (unknown provider, or corpus not yet reseeded with
      // provider_code), return a LABELLED global top-N — never the unlabelled whole-corpus
      // firehose (the TKT-062/076 bug: `!s.providerCode ||` kept every no-provider row).
      const providerCode = principalFromCasePo(caseRow?.case_po as string | null);
      const { list, usingFallback } = scopeSuggestions(all, providerCode);
      const shortlist = sortSuggestions(list, { byDistance: !!centroid })
        .slice(0, SHORTLIST_LIMIT)
        .map((s) => (usingFallback ? { ...s, scopeFallback: true } : s));
      return { status: 200, jsonBody: shortlist };
    } catch {
      return { status: 200, jsonBody: [] }; // honest-empty on any failure
    }
  }),
});

// 12 — GET /api/inspection-addresses/counts   (honest 0/0)
app.http('inspectionAddressCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inspection-addresses/counts',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const rows = await query<Row>(
        'SELECT source_label, decision_mode_code FROM inspection_address',
      );
      let confirmed = 0;
      let suggested = 0;
      for (const r of rows) {
        if (isSuggestedAddressRow(r)) suggested += 1;
        else if (r.decision_mode_code === CONFIRMED_PHYSICAL) confirmed += 1;
      }
      const counts: InspectionAddressCounts = { confirmed, suggested };
      return { status: 200, jsonBody: counts };
    } catch {
      return { status: 200, jsonBody: { confirmed: 0, suggested: 0 } };
    }
  }),
});

// 13 — POST /api/cases/{id}/inspection-decision
app.http('saveInspectionDecision', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/inspection-decision',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    const caseId = req.params.id;
    const parsed = SaveInspectionDecisionParams.safeParse({
      ...((await req.json().catch(() => ({}))) as Record<string, unknown>),
      caseId,
    });
    if (!parsed.success) {
      return { status: 400, jsonBody: { error: 'invalid inspection decision', issues: parsed.error.issues } };
    }
    const decision = parsed.data;
    const lines = (decision.addressLines ?? []).map((line) => line.trim()).filter(Boolean);
    const postcode = decision.postcode?.trim() ?? '';
    const isImageBased = decision.decisionMode === 'image_based';
    const label = (
      isImageBased
        ? `Image Based Assessment (${caseId})`
        : [lines[0], postcode].filter(Boolean).join(', ') || 'Inspection address'
    ).slice(0, 200);
    const evaAddress = isImageBased
      ? 'Image Based Assessment'
      : [...lines, ...(postcode ? [postcode] : [])].join('\n').slice(0, 2000);
    const decisionModeCode = inspectionDecisionCodec.toInt(decision.decisionMode);
    if (decisionModeCode == null) {
      return { status: 400, jsonBody: { error: 'invalid inspection decision mode' } };
    }
    const actor = actorFromClaims(claims);
    const outcome = await tx(async (q) => {
      const caseRows = await q<Row>(
        `SELECT case_po, eva_inspection_address, inspection_decision_code, updated_at
           FROM case_ WHERE id = $1 FOR UPDATE`,
        [caseId],
      );
      const caseRow = caseRows[0];
      if (!caseRow) return { kind: 'missing' as const };
      const currentVersion = versionToken(caseRow.updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const providerCode = principalFromCasePo(caseRow.case_po as string | null);
      const sourceNote = [
        `case=${caseId}`,
        ...(providerCode ? [`provider=${providerCode}`] : []),
        decision.sourceNote,
      ].join(' ').trim();
      const decisionReason = isImageBased ? decision.sourceNote : null;
      const rows = await q<Row>(
        `INSERT INTO inspection_address
           (label, decision_mode_code, decision_reason, source_label, source_note,
            address_line1, address_line2, address_line3, address_line4, address_line5, address_line6, postcode)
         VALUES ($1, COALESCE($2, 100000003), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
         ON CONFLICT (label) DO UPDATE SET
           decision_mode_code = EXCLUDED.decision_mode_code,
           decision_reason    = EXCLUDED.decision_reason,
           source_label       = EXCLUDED.source_label,
           source_note        = EXCLUDED.source_note,
           address_line1      = EXCLUDED.address_line1,
           address_line2      = EXCLUDED.address_line2,
           address_line3      = EXCLUDED.address_line3,
           address_line4      = EXCLUDED.address_line4,
           address_line5      = EXCLUDED.address_line5,
           address_line6      = EXCLUDED.address_line6,
           postcode           = EXCLUDED.postcode
         RETURNING id`,
        [
          label,
          decisionModeCode ?? null,
          decisionReason,
          decision.sourceLabel,
          sourceNote,
          lines[0] ?? null,
          lines[1] ?? null,
          lines[2] ?? null,
          lines[3] ?? null,
          lines[4] ?? null,
          lines[5] ?? null,
          isImageBased ? null : decision.postcode?.trim() ?? null,
        ],
      );
      const id = rows[0]?.id as string | undefined;
      const updated = await q<Row>(
        `UPDATE case_
            SET eva_inspection_address = $2,
                inspection_decision_code = $3,
                updated_at = now()
          WHERE id = $1
          RETURNING updated_at`,
        [caseId, evaAddress, decisionModeCode],
      );
      const statusGeneration = await requestStatusRecompute(q, caseId);
      await writeAudit({
        action: AUDIT_ACTION.inspection_override,
        caseId,
        summary: `Inspection decision confirmed (${decision.decisionMode})`,
        before: {
          inspectionAddress: caseRow.eva_inspection_address ?? null,
          decisionModeCode: caseRow.inspection_decision_code ?? null,
        },
        after: { decisionMode: decision.decisionMode, label, inspectionAddress: evaAddress },
        ...(actor ? { actor } : {}),
      }, q);
      return {
        kind: 'saved' as const,
        id,
        version: versionToken(updated[0]?.updated_at),
        statusGeneration,
      };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    try {
      const evaluated = await recomputeStatus(caseId, actor);
      if (!evaluated) throw new Error('case was not available for readiness evaluation');
      await acknowledgeStatusRecompute(query, caseId, outcome.statusGeneration);
    } catch (error) {
      ctx.warn(
        `[inspection-decision] readiness recompute remains pending for ${caseId} ` +
          `(generation ${outcome.statusGeneration}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const current = await query<Row>('SELECT updated_at FROM case_ WHERE id = $1', [caseId]);
    const currentVersion = current[0] ? versionToken(current[0].updated_at) : outcome.version;
    const result: SaveInspectionDecisionResult & { version: string } = {
      persisted: true,
      ...(outcome.id ? { id: outcome.id } : {}),
      version: currentVersion,
    };
    return {
      status: 200,
      jsonBody: result,
      headers: { ETag: `"${currentVersion}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});
