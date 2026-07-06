/**
 * api/src/functions/inspection.ts — inspection-address corpus HTTP routes.
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
  type InspectionAddressCounts,
  type InspectionDecisionInput,
  type SaveInspectionDecisionResult,
  type SuggestedAddress,
} from '@cs/domain';
import { inspectionDecisionCodec } from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import {
  isSuggestedAddressRow,
  principalFromCasePo,
  rowToSuggestedAddress,
  scopeSuggestions,
  sortSuggestions,
  type Row,
} from '../lib/mappers.js';
import { extractPostcode, geocodePostcode, haversineMiles } from '../lib/maps.js';

const CONFIRMED_PHYSICAL = inspectionDecisionCodec.toInt('confirmed_physical'); // 100000000
const IMAGE_BASED = inspectionDecisionCodec.toInt('image_based'); // 100000002

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

// 13 — POST /api/cases/{id}/inspection-decision   (honest no-op on failure)
app.http('saveInspectionDecision', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/inspection-decision',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const caseId = req.params.id;
    const decision = (await req.json()) as InspectionDecisionInput;
    try {
      const lines = (decision.addressLines ?? []).map((l) => (l ?? '').trim()).filter(Boolean);
      const isImageBased = decision.decisionMode === 'image_based';
      const label = (
        isImageBased
          ? 'Image Based Assessment'
          : [lines[0], decision.postcode?.trim()].filter(Boolean).join(', ') || 'Inspection address'
      ).slice(0, 200);

      // Trace the provider PRINCIPAL (Case/PO leading-alpha) in the source note —
      // the corpus carries no case lookup (ADR-0013), so case + provider live in the note.
      let providerCode = '';
      try {
        const caseRows = await query<Row>('SELECT case_po FROM case_ WHERE id = $1', [caseId]);
        providerCode = principalFromCasePo(caseRows[0]?.case_po as string | null);
      } catch {
        /* leave providerCode empty — the row still writes without the token */
      }
      const sourceNote = [
        `case=${caseId}`,
        ...(providerCode ? [`provider=${providerCode}`] : []),
        decision.sourceNote,
      ]
        .join(' ')
        .trim();

      const decisionModeCode =
        decision.decisionMode && decision.decisionMode !== 'unknown'
          ? inspectionDecisionCodec.toInt(decision.decisionMode)
          : undefined;
      // The CHECK constraint requires a non-empty reason for an image-based decision.
      const decisionReason =
        decisionModeCode === IMAGE_BASED ? decision.sourceNote.trim() || 'Image based assessment' : null;

      // UPSERT on the UNIQUE(label) key: the image-based label is a constant string, so a bare
      // INSERT silently collided after the first IBA save (sweep #10). DO UPDATE keeps the latest
      // decision/provenance for that label and still RETURNs an id (persisted:true).
      const rows = await query<Row>(
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

      await writeAudit({
        action: AUDIT_ACTION.inspection_override,
        caseId,
        summary: `Inspection decision confirmed (${decision.decisionMode})`,
        after: { decisionMode: decision.decisionMode, label },
        ...(actorFromClaims(claims) ? { actor: actorFromClaims(claims) } : {}),
      });

      const result: SaveInspectionDecisionResult = { persisted: true, ...(id ? { id } : {}) };
      return { status: 200, jsonBody: result };
    } catch {
      // Honest no-op — the local working-copy capture already happened; the durable
      // write is deferred (table not wired / write rejected). Mirrors the mock seam.
      return { status: 200, jsonBody: { persisted: false } };
    }
  }),
});
