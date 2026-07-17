/**
 * services/data-api/src/features/inbound/routes.ts — inbox / triage HTTP routes (Phase 8 + work-todo-spike).
 *
 * DataAccess methods 27–29 (plan 21 §21.1) + the work-todo-spike email-management work +
 * the rules-engine-v2 Phase 2 ref-gate surface (ADR-0019):
 *   27 GET   /api/inbound?category=&subtype=&view=  inboundEmails (ACTIVE-FIRST; honest [])
 *   28 GET   /api/inbound/counts                    inboundEmailCounts (active-first; honest zero)
 *   29 POST  /api/inbound/{id}/triage               setTriageState (validated; 404/400/500; audited)
 *   --  PATCH /api/inbound/{id}/classification       reclassifyInbound (override capture)
 *   --  GET   /api/inbound/{id}/suggestions          AiSuggestion[] for this inbound (honest [])
 *   --  POST  /api/inbound/{id}/detach               unlink from its case (idempotent; audited)
 *   --  POST  /api/inbound/{id}/outlook-move         gated Outlook filing enqueue (TKT-054; 409 while off)
 *
 * The inbox list + suggestions stay "honest-empty" when their optional read models are not
 * available. Counts are different: an empty inbox returns the complete zero contract, while
 * a query fault returns a correlated generic 500 so the SPA cannot present stale/false zeros.
 * The WRITE endpoints are trustworthy: 29 validates the state, uses RETURNING (404 on unknown id), surfaces real
 * DB errors (500), and writes a staff-action audit row; reclassify captures the
 * suggested-vs-chosen override; detach is idempotent (ok:false, not an error, when already
 * unlinked) and never touches Box (ADR-0012/0017: one-way archive — see its own doc comment).
 */

import { randomUUID } from 'node:crypto';
import { app } from '@azure/functions';
import {
  suggestedOutlookFolder,
  type AiSuggestion,
  type InboundCategory,
  type InboundCounts,
  type InboundEmail,
  type InboundSubtype,
  type OutlookMessageLinkResolution,
  type TriageState,
} from '@cs/domain';
import { withRole } from '../../platform/auth/staff-auth.js';
import { query, tx } from '../../platform/db/client.js';
import { ifMatch, versionToken } from '../../platform/http/concurrency.js';
import { isUuid } from '../../shared/validation/uuid.js';
import { gates } from '../settings/gates.js';
import { classifyEnqueueFailure, enqueueOutlookMove } from './outlook-queue.js';
import { resolveCurrentOutlookLink } from './outlook-link-resolver.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit, type AuditAction } from '../../shared/audit.js';
import {
  INBOUND_CATEGORY_TO_INT,
  INBOUND_SUBTYPE_TO_INT,
  inboundCategoryFromInt,
  inboundSubtypeFromInt,
  inboundViewWhere,
  isValidTriageState,
  richTagToClassification,
  rowToAiSuggestion,
  rowToInboundEmail,
  tallyActiveInboundCounts,
  type Row,
} from '../../shared/mapping/index.js';
import { writeImprovementSignal } from './improvement-signals.js';

/** Map a staff-set target triage state -> the audit action recorded for the transition. */
const TRIAGE_AUDIT_ACTION: Record<TriageState, AuditAction> = {
  dismissed: AUDIT_ACTION.inbound_dismissed,
  actioned: AUDIT_ACTION.inbound_actioned,
  new: AUDIT_ACTION.inbound_reopened,
  routed: AUDIT_ACTION.inbound_routed,
};

const CATEGORY_FOR_SUBTYPE: Record<InboundSubtype, InboundCategory> = {
  existing_provider_instruction: 'receiving_work',
  existing_provider_audit: 'receiving_work',
  existing_provider_diminution: 'receiving_work',
  new_client_work: 'receiving_work',
  query_existing_work: 'query',
  query_new_enquiry: 'query',
  billing_request: 'billing',
  payment_remittance: 'billing',
  case_summary: 'non_actionable',
  acknowledgement: 'non_actionable',
  other: 'other',
  images_received: 'case_update',
  update_general: 'case_update',
  // retro_related (TKT-226) — stamped by the retro link-related lane, paired with
  // case_update (the lane's own classification tuple in retro-routes.ts).
  retro_related: 'case_update',
  cancellation_notice: 'cancellation',
  pre_instruction_directions: 'pre_instruction',
  website_general_enquiry: 'website_enquiry',
};

const DEFAULT_SUBTYPE_FOR_CATEGORY: Record<InboundCategory, InboundSubtype> = {
  receiving_work: 'existing_provider_instruction',
  query: 'query_existing_work',
  other: 'other',
  billing: 'billing_request',
  non_actionable: 'case_summary',
  case_update: 'update_general',
  cancellation: 'cancellation_notice',
  pre_instruction: 'pre_instruction_directions',
  website_enquiry: 'website_general_enquiry',
};

/** TKT-219 (operator decision) — retro reconstruction ANCHOR rows are not triage work:
 *  the synthetic reconstructed-original rows the retro workflow persists
 *  (services/orchestration/src/workflows/retro/retro-envelope.ts builders) must not sit in
 *  the Triage Inbox as if new mail arrived. No single column marks all three builder
 *  variants (the Graph messageId `retro-box-…` is never persisted — upsertInboundEmail
 *  stores graph_message_id only with a complete Outlook webLink tuple), so the exclusion
 *  is the union of the persisted discriminators:
 *   - doc-arm / eml-arm-without-Message-ID anchors: source_message_id `retro:box:…`
 *     (minimal anchors never get an inbound_email row at all);
 *   - anchors with no real To address: source_mailbox 'box-archive';
 *   - eml-arm anchors carrying the eml's REAL Message-ID + To address: the
 *     retroOriginalClassification signals marker 'retro_reconstructed' (retro-routes.ts).
 *  NULL-safe on purpose (a NULL column must not exclude a live row). Applied to the
 *  INBOX list slice only — a case-scoped read (?caseId=) still returns anchors, since
 *  they are real case history on the Emails tab. Exported so the test can pin the SQL. */
export const INBOUND_RETRO_ANCHOR_EXCLUSION_SQL =
  "(inbound_email.source_message_id IS NULL OR inbound_email.source_message_id NOT LIKE 'retro:box:%')" +
  " AND inbound_email.source_mailbox IS DISTINCT FROM 'box-archive'" +
  " AND (inbound_email.signals IS NULL OR inbound_email.signals NOT LIKE '%retro_reconstructed%')";

// 27 — GET /api/inbound?category=&subtype=&view=active|handled|all&caseId=   (ACTIVE-FIRST; honest [])
app.http('inboundEmails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const category = req.query.get('category') as InboundCategory | null;
      const subtype = req.query.get('subtype') as InboundSubtype | null;
      const view = req.query.get('view'); // active (default) | handled | all
      // Case-scoped slice (the case Emails tab): filter server-side by the linked case
      // and KEEP retro anchor rows — they are that case's reconstructed history.
      const caseId = (req.query.get('caseId') ?? '').trim();
      if (caseId && !isUuid(caseId)) {
        return { status: 400, jsonBody: { error: 'invalid caseId' } };
      }
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (category && category in INBOUND_CATEGORY_TO_INT) {
        params.push(INBOUND_CATEGORY_TO_INT[category]);
        clauses.push(`inbound_email.category_code = $${params.length}`);
      }
      if (caseId) {
        params.push(caseId);
        clauses.push(`inbound_email.case_id = $${params.length}`);
      } else {
        // The inbox slice only — reconstruction anchors are not triage work.
        clauses.push(`(${INBOUND_RETRO_ANCHOR_EXCLUSION_SQL})`);
      }
      // Active-first: default hides handled (actioned/dismissed) rows; view= switches the slice.
      const viewClause = inboundViewWhere(view);
      if (viewClause) clauses.push(viewClause);
      const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
      // LEFT JOIN pulls the linked case's Case/PO onto the row (TKT-054 status cell).
      // inbound_email.* keeps the shared column names (id/name/source_mailbox/…) unambiguous.
      // TKT-093: a LATERAL join also pulls a PENDING case_link suggestion's Case/PO so the
      // inbox LIST can show the suggest-attach affordance (not only the opened email). Reads
      // the `casePo` the suggest-link writer already stamped into `suggested_value` — NO uuid
      // cast (a malformed target can never error the whole list query).
      const rows = await query<Row>(
        `SELECT inbound_email.*, c.case_po AS case_po, ls.case_po AS link_suggestion_case_po
           FROM inbound_email
           LEFT JOIN case_ c ON c.id = inbound_email.case_id
           LEFT JOIN LATERAL (
             SELECT s.suggested_value->>'casePo' AS case_po
               FROM ai_suggestion s
              WHERE s.inbound_email_id = inbound_email.id
                AND s.suggestion_type = 'case_link'
                AND s.review_state = 'pending'
                AND s.suggested_value->>'casePo' IS NOT NULL
              ORDER BY s.created_at DESC
              LIMIT 1
           ) ls ON true
           ${where} ORDER BY inbound_email.received_on DESC`,
        params,
      );
      let result: InboundEmail[] = rows.map(rowToInboundEmail);
      if (subtype) result = result.filter((r) => r.subtype === subtype);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] }; // honest-empty on any read failure
    }
  }),
});

// 28 — GET /api/inbound/counts   (ACTIVE-FIRST per-category tally; empty inbox = honest zero)
app.http('inboundEmailCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/counts',
  handler: withRole('CollisionSpike.User', async (_req, ctx) => {
    try {
      const rows = await query<Row>('SELECT category_code, triage_state FROM inbound_email');
      // Counts reflect OUTSTANDING work — handled rows are excluded (work-todo-spike).
      const counts: InboundCounts = tallyActiveInboundCounts(rows);
      return { status: 200, jsonBody: counts };
    } catch (error) {
      // Use the server invocation id rather than a caller-supplied header so log lines cannot
      // be forged. The response carries only that opaque id; actionable detail stays in
      // server telemetry and never reaches rendered handler copy.
      const correlationId = ctx.invocationId || randomUUID();
      ctx.error(
        JSON.stringify({
          evt: 'inboundCountsFailed',
          correlationId,
          errorName: error instanceof Error ? error.name : 'UnknownError',
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
      return {
        status: 500,
        jsonBody: { error: 'internal', correlationId },
        headers: { 'x-correlation-id': correlationId },
      };
    }
  }),
});

// GET /api/inbound/{id} — one consistent row snapshot plus its write precondition.
app.http('inboundEmailById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  // The guid constraint prevents this parameter route from ever consuming the literal
  // `/inbound/counts` route in the Functions host.
  route: 'inbound/{id:guid}',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    // Defence in depth for direct handler invocation/tests and future host changes.
    if (!isUuid(id)) return { status: 400, jsonBody: { error: 'invalid id' } };
    const rows = await query<Row>(
      `SELECT inbound_email.*, c.case_po AS case_po
         FROM inbound_email
         LEFT JOIN case_ c ON c.id = inbound_email.case_id
        WHERE inbound_email.id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { status: 404, jsonBody: { error: 'not found' } };
    const version = versionToken(row.updated_at);
    return {
      status: 200,
      jsonBody: { ...rowToInboundEmail(row), version },
      headers: { ETag: `"${version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

// GET /api/inbound/{id}/outlook-link — fresh, read-only exact-message check.
// The browser supplies only the inbound row id. Mailbox + immutable Graph id are
// read from Postgres and resolved by the orchestration app's Mail.Read identity.
app.http('inboundOutlookLink', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/{id:guid}/outlook-link',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    if (!isUuid(id)) return { status: 400, jsonBody: { error: 'invalid id' } };
    const rows = await query<Row>(
      `SELECT source_mailbox, graph_message_id
         FROM inbound_email
        WHERE id = $1`,
      [id],
    );
    const row = rows[0];
    if (!row) return { status: 404, jsonBody: { error: 'not found' } };
    const sourceMailbox = typeof row.source_mailbox === 'string' ? row.source_mailbox.trim() : '';
    const graphMessageId = typeof row.graph_message_id === 'string' ? row.graph_message_id.trim() : '';
    if (!sourceMailbox || !graphMessageId) {
      const result: OutlookMessageLinkResolution = { status: 'missing_identity' };
      return { status: 200, jsonBody: result };
    }
    const result = await resolveCurrentOutlookLink({ sourceMailbox, graphMessageId });
    return { status: 200, jsonBody: result };
  }),
});

// 29 — POST /api/inbound/{id}/triage   (validated; 404 unknown id; 400 bad state; 500 on error; audited)
app.http('setTriageState', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/triage',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as { state?: unknown };
    const state = body.state;
    // VALIDATE the requested state against the allowed set — never write free text (400).
    if (!isValidTriageState(state)) {
      return { status: 400, jsonBody: { error: 'invalid triage state' } };
    }

    const actor = actorFromClaims(claims);
    const outcome = await tx(async (q) => {
      const existing = await q<Row>(
        `SELECT id, triage_state, case_id, source_message_id, updated_at
           FROM inbound_email WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = existing[0];
      if (!row) return { kind: 'missing' as const };
      const currentVersion = versionToken(row.updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const before = (row.triage_state as string | null) ?? 'new';
      const updated = await q<Row>(
        `UPDATE inbound_email SET triage_state = $2, updated_at = now()
          WHERE id = $1 RETURNING updated_at`,
        [id, state],
      );
      await writeAudit({
        action: TRIAGE_AUDIT_ACTION[state],
        ...(row.case_id ? { caseId: row.case_id as string } : {}),
        summary: `Inbound email ${before} -> ${state}`,
        before: { triageState: before },
        after: {
          triageState: state,
          inboundEmailId: id,
          sourceMessageId: row.source_message_id ?? null,
        },
        ...(actor ? { actor } : {}),
      }, q);
      return { kind: 'updated' as const, version: versionToken(updated[0]?.updated_at) };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    return {
      status: 204,
      headers: { ETag: `"${outcome.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

// POST /api/inbound/{id}/outlook-move   (TKT-054 / 020726 E6 — gated Outlook filing)
// Honest 409 while OUTLOOK_MOVE_ENABLED is off / queue unconfigured. The destination
// folder is SERVER-derived from the row's own e-mail type (never client-supplied);
// the actual Graph move runs in the orchestration app off the `outlook-move` queue,
// which reports back via POST /api/internal/inbound/{id}/outlook-moved.
app.http('moveInboundToOutlook', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/outlook-move',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    if (!gates.outlookMoveEnabled()) {
      return {
        status: 409,
        jsonBody: {
          error: 'outlook filing is not enabled',
          reason: 'gated_off',
          message: 'Outlook filing is switched off — ask the administrator to enable it.',
        },
      };
    }
    const id = req.params.id;
    const existing = await query<Row>(
      `SELECT id, source_message_id, source_mailbox, subtype_code, suggested_subtype_code,
              case_id, outlook_move_state
         FROM inbound_email WHERE id = $1`,
      [id],
    );
    const row = existing[0];
    if (!row) return { status: 404, jsonBody: { error: 'not found' } };
    if (row.outlook_move_state === 'moved') {
      return { status: 409, jsonBody: { error: 'already filed' } };
    }
    if (!row.source_message_id || !row.source_mailbox) {
      return { status: 409, jsonBody: { error: 'no mailbox provenance to act on' } };
    }

    // File per the CURRENT (staff-chosen) type; the classifier's original only as fallback.
    const subtype: InboundSubtype =
      inboundSubtypeFromInt(row.subtype_code) ?? inboundSubtypeFromInt(row.suggested_subtype_code) ?? 'other';
    const folder = suggestedOutlookFolder(subtype);

    // Mark queued BEFORE enqueueing (a delivered job must never race an unmarked row);
    // revert to failed if the enqueue itself cannot be placed.
    await query(
      `UPDATE inbound_email
          SET outlook_move_state = 'queued', outlook_moved_folder = $2, updated_at = now()
        WHERE id = $1`,
      [id, folder],
    );
    const actor = actorFromClaims(claims);
    try {
      await enqueueOutlookMove({
        inboundEmailId: id,
        sourceMailbox: String(row.source_mailbox),
        sourceMessageId: String(row.source_message_id),
        targetFolderPath: folder,
      });
    } catch (e) {
      // TKT-091: name the failure class in telemetry AND the response — the live
      // 2026-07-06 failure (404 QueueNotFound: the outlook-move queue was never
      // provisioned) surfaced only as a bare 503 the operator had to dev-tools.
      const failure = classifyEnqueueFailure(e);
      ctx.error(
        `[outlook-move] enqueue failed (${failure.reason}) for inbound ${id}: ${e instanceof Error ? e.message : String(e)}`,
      );
      await query(
        `UPDATE inbound_email
            SET outlook_move_state = 'failed', outlook_moved_at = now(), updated_at = now()
          WHERE id = $1`,
        [id],
      );
      await writeAudit({
        action: AUDIT_ACTION.outlook_move_failed,
        ...(row.case_id ? { caseId: row.case_id as string } : {}),
        summary: `Outlook filing could not be queued (${folder})`,
        severity: 'warning',
        after: {
          inboundEmailId: id,
          folder,
          reason: failure.reason,
          detail: e instanceof Error ? e.message.slice(0, 300) : String(e),
        },
        ...(actor ? { actor } : {}),
      });
      return {
        status: 503,
        jsonBody: { error: 'filing queue unavailable', reason: failure.reason, message: failure.message },
      };
    }
    await writeAudit({
      action: AUDIT_ACTION.outlook_move_requested,
      ...(row.case_id ? { caseId: row.case_id as string } : {}),
      summary: `Outlook filing requested -> ${folder}`,
      after: { inboundEmailId: id, folder, sourceMessageId: row.source_message_id },
      ...(actor ? { actor } : {}),
    });
    return { status: 202, jsonBody: { queued: true, folder } };
  }),
});

// PATCH /api/inbound/{id}/classification   (staff reclassify / override capture)
app.http('reclassifyInbound', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/classification',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      category?: unknown;
      subtype?: unknown;
      tag?: unknown;
      reason?: unknown;
    };

    // Resolve the chosen {category, subtype}: a richer-taxonomy `tag` wins, else explicit values.
    let category: InboundCategory | undefined;
    let subtype: InboundSubtype | undefined;
    if (typeof body.tag === 'string') {
      const mapped = richTagToClassification(body.tag);
      if (!mapped) return { status: 400, jsonBody: { error: 'unknown tag' } };
      category = mapped.category;
      subtype = mapped.subtype;
    } else {
      if (typeof body.category === 'string') {
        if (!(body.category in INBOUND_CATEGORY_TO_INT)) {
          return { status: 400, jsonBody: { error: 'invalid category' } };
        }
        category = body.category as InboundCategory;
      }
      if (typeof body.subtype === 'string') {
        if (!(body.subtype in INBOUND_SUBTYPE_TO_INT)) {
          return { status: 400, jsonBody: { error: 'invalid subtype' } };
        }
        subtype = body.subtype as InboundSubtype;
      }
    }
    if (!category && !subtype) {
      return { status: 400, jsonBody: { error: 'category, subtype or tag required' } };
    }
    const actor = actorFromClaims(claims);
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
    const outcome = await tx(async (q) => {
      const existing = await q<Row>(
        `SELECT *, updated_at FROM inbound_email WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const cur = existing[0];
      if (!cur) return { kind: 'missing' as const };
      const currentVersion = versionToken(cur.updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }

      let chosenCategory = category;
      let chosenSubtype = subtype;
      if (chosenSubtype && !chosenCategory) chosenCategory = CATEGORY_FOR_SUBTYPE[chosenSubtype];
      if (chosenCategory && !chosenSubtype) {
        const currentSubtype = inboundSubtypeFromInt(cur.subtype_code as number | null | undefined);
        chosenSubtype =
          currentSubtype && CATEGORY_FOR_SUBTYPE[currentSubtype] === chosenCategory
            ? currentSubtype
            : DEFAULT_SUBTYPE_FOR_CATEGORY[chosenCategory];
      }
      if (!chosenCategory || !chosenSubtype || CATEGORY_FOR_SUBTYPE[chosenSubtype] !== chosenCategory) {
        return { kind: 'invalid_pair' as const };
      }

      const suggestedCat = inboundCategoryFromInt(
        (cur.suggested_category_code ?? cur.category_code) as number | null | undefined,
      );
      const suggestedSub = inboundSubtypeFromInt(
        (cur.suggested_subtype_code ?? cur.subtype_code) as number | null | undefined,
      );
      const updated = await q<Row>(
        `UPDATE inbound_email
            SET classifier_mode = 'human', category_code = $2, subtype_code = $3, updated_at = now()
          WHERE id = $1
          RETURNING *`,
        [id, INBOUND_CATEGORY_TO_INT[chosenCategory], INBOUND_SUBTYPE_TO_INT[chosenSubtype]],
      );
      await writeAudit({
        action: AUDIT_ACTION.inbound_reclassified,
        ...(cur.case_id ? { caseId: cur.case_id as string } : {}),
        summary: `Inbound reclassified category=${chosenCategory} subtype=${chosenSubtype}`,
        before: { category: suggestedCat ?? null, subtype: suggestedSub ?? null },
        after: {
          category: chosenCategory,
          subtype: chosenSubtype,
          inboundEmailId: id,
          sourceMessageId: cur.source_message_id ?? null,
          ...(reason ? { reason } : {}),
        },
        ...(actor ? { actor } : {}),
      }, q);
      return {
        kind: 'updated' as const,
        cur,
        value: rowToInboundEmail(updated[0]),
        chosenCategory,
        chosenSubtype,
        suggestedCat,
        suggestedSub,
        version: versionToken(updated[0].updated_at),
      };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'invalid_pair') {
      return { status: 400, jsonBody: { error: 'category and subtype do not match' } };
    }
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    if (outcome.chosenCategory !== outcome.suggestedCat) {
      await writeImprovementSignal(
        outcome.cur,
        'category',
        outcome.suggestedCat ?? '(none)',
        outcome.chosenCategory,
        actor,
        reason,
      );
    }
    if (outcome.chosenSubtype !== outcome.suggestedSub) {
      await writeImprovementSignal(
        outcome.cur,
        'subtype',
        outcome.suggestedSub ?? '(none)',
        outcome.chosenSubtype,
        actor,
        reason,
      );
    }
    return {
      status: 200,
      jsonBody: { ...outcome.value, version: outcome.version },
      headers: { ETag: `"${outcome.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

// GET /api/inbound/{id}/suggestions — AI suggestions for ONE inbound email, pending first
// (rules-engine-v2 Phase 2, ADR-0019: the ref-gate/cancellation suggestions suggest-link
// writes land here too, alongside any other producer). Mirrors caseAiSuggestions's
// mapping/honest-[] style (ai-suggestions.ts) — the ai_suggestion table may be unwired on an
// older DB, so any read failure degrades to an empty list rather than a hard failure.
app.http('inboundEmailSuggestions', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/suggestions',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const id = req.params.id;
      const rows = await query<Row>(
        `SELECT * FROM ai_suggestion
          WHERE inbound_email_id = $1
          ORDER BY (review_state = 'pending') DESC, created_at DESC
          LIMIT 100`,
        [id],
      );
      const result: AiSuggestion[] = rows.map(rowToAiSuggestion);
      return { status: 200, jsonBody: result };
    } catch {
      return { status: 200, jsonBody: [] }; // honest-empty on any read failure
    }
  }),
});

// POST /api/inbound/{id}/detach — unlink an inbound email from its case (e.g. a ref-gate
// suggestion or a linked reply attached it to the wrong case). Sets case_id NULL only when
// currently set; 404 on an unknown row; idempotent {ok:false} (not an error) when the row is
// already unlinked — matches the repo's {applied:false}/{promoted:false} idiom for a benign
// no-op rather than inventing a 409 for "there was nothing to do". ADR-0012/0017: the
// archive (Box) mirror is ONE-WAY — detaching here does NOT un-archive or move anything in
// Box; the audit after-state carries a note so a person can follow the manual-cleanup
// runbook separately.
app.http('detachInboundEmail', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'inbound/{id}/detach',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const existing = await query<Row>('SELECT id, case_id FROM inbound_email WHERE id = $1', [id]);
    if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const oldCaseId = (existing[0].case_id as string | null) ?? null;
    if (!oldCaseId) {
      return { status: 200, jsonBody: { ok: false, reason: 'not_linked' } };
    }

    // Conditional UPDATE — only a currently-linked row is affected, so a concurrent detach
    // race resolves to the same honest {ok:false} rather than a double-audit. Reset triage_state
    // to 'new' as well: a row auto-linked via the reply lane carries triage_state='routed', which
    // (with case_id now NULL) would otherwise still render as 'Linked' (inbox-status.ts's
    // linked-unresolved) and stay OUT of the untriaged count — an unlinked email must read as
    // 'New' and re-enter the sort queue.
    const updated = await query<Row>(
      `UPDATE inbound_email SET case_id = NULL, triage_state = 'new', updated_at = now()
         WHERE id = $1 AND case_id IS NOT NULL
       RETURNING id`,
      [id],
    );
    if (!updated[0]) {
      return { status: 200, jsonBody: { ok: false, reason: 'not_linked' } };
    }

    const actor = actorFromClaims(claims);
    await writeAudit({
      action: AUDIT_ACTION.inbound_detached,
      caseId: oldCaseId,
      summary: 'Inbound email unlinked from case',
      before: { caseId: oldCaseId },
      after: {
        caseId: null,
        inboundEmailId: id,
        note: 'Archive folder is a one-way mirror — any archive cleanup for this email is manual (ADR-0012/0017).',
      },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: { ok: true } };
  }),
});
