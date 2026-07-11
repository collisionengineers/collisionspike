/**
 * api/src/functions/inbound.ts — inbox / triage HTTP routes (Phase 8 + work-todo-spike).
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
 * Read endpoints 27 + 28 (+ the new suggestions list) stay "honest-empty" on ANY read
 * failure (table not wired / read error) so the SPA never hard-fails. The WRITE endpoints
 * are trustworthy: 29 validates the state, uses RETURNING (404 on unknown id), surfaces real
 * DB errors (500), and writes a staff-action audit row; reclassify captures the
 * suggested-vs-chosen override; detach is idempotent (ok:false, not an error, when already
 * unlinked) and never touches Box (ADR-0012/0017: one-way archive — see its own doc comment).
 */

import { app } from '@azure/functions';
import {
  INBOUND_COUNTS_ZERO,
  suggestedOutlookFolder,
  type AiSuggestion,
  type InboundCategory,
  type InboundCounts,
  type InboundEmail,
  type InboundSubtype,
  type TriageState,
} from '@cs/domain';
import { withRole } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';
import { ifMatch, versionToken } from '../lib/concurrency.js';
import { gates } from '../lib/gates.js';
import { classifyEnqueueFailure, enqueueOutlookMove } from '../lib/outlook-queue.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit, type AuditAction } from '../lib/audit.js';
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
} from '../lib/mappers.js';

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
  cancellation_notice: 'cancellation',
  pre_instruction_directions: 'pre_instruction',
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
};

// 27 — GET /api/inbound?category=&subtype=&view=active|handled|all   (ACTIVE-FIRST; honest [])
app.http('inboundEmails', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound',
  handler: withRole('CollisionSpike.User', async (req) => {
    try {
      const category = req.query.get('category') as InboundCategory | null;
      const subtype = req.query.get('subtype') as InboundSubtype | null;
      const view = req.query.get('view'); // active (default) | handled | all
      const clauses: string[] = [];
      const params: unknown[] = [];
      if (category && category in INBOUND_CATEGORY_TO_INT) {
        params.push(INBOUND_CATEGORY_TO_INT[category]);
        clauses.push(`inbound_email.category_code = $${params.length}`);
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

// 28 — GET /api/inbound/counts   (ACTIVE-FIRST per-category tally; honest INBOUND_COUNTS_ZERO)
app.http('inboundEmailCounts', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/counts',
  handler: withRole('CollisionSpike.User', async () => {
    try {
      const rows = await query<Row>('SELECT category_code, triage_state FROM inbound_email');
      // Counts reflect OUTSTANDING work — handled rows are excluded (work-todo-spike).
      const counts: InboundCounts = tallyActiveInboundCounts(rows);
      return { status: 200, jsonBody: counts };
    } catch {
      return { status: 200, jsonBody: { ...INBOUND_COUNTS_ZERO } };
    }
  }),
});

// GET /api/inbound/{id} — one consistent row snapshot plus its write precondition.
app.http('inboundEmailById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'inbound/{id}',
  handler: withRole('CollisionSpike.User', async (req) => {
    const rows = await query<Row>(
      `SELECT inbound_email.*, c.case_po AS case_po
         FROM inbound_email
         LEFT JOIN case_ c ON c.id = inbound_email.case_id
        WHERE inbound_email.id = $1`,
      [req.params.id],
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

/**
 * Best-effort append of an improvement_signal row capturing a suggested-vs-chosen override.
 * Classification = parser_rule_candidate (the classifier picked the wrong label — a candidate
 * for a rule fix). Never throws — a feedback-write failure must not sink the reclassify.
 *
 * Exported for reuse by ai-suggestions.ts's promoteAcceptedSuggestion (rules-engine-v2
 * Phase 4): an ACCEPTED 'triage_category' AI suggestion applies category_code/subtype_code
 * the same way a staff reclassify does, and should feed the SAME feedback-provenance trail
 * — reused here rather than re-implemented, per this repo's own "read it; reuse/extract
 * rather than duplicate" convention.
 */
export async function writeImprovementSignal(
  row: Row,
  fieldName: string,
  originalValue: string,
  correctedValue: string,
  actor: string | undefined,
  reason: string,
): Promise<void> {
  try {
    await query(
      `INSERT INTO improvement_signal
         (name, case_id, work_provider_id, field_name, original_value, corrected_value,
          original_provenance, actor, occurred_at, affects_eva_readiness, classification_code)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), false, 100000000)`,
      [
        `Inbound ${fieldName} override: ${originalValue || '(none)'} -> ${correctedValue}`,
        row.case_id ?? null,
        row.work_provider_id ?? null,
        `inbound.${fieldName}`,
        originalValue || null,
        correctedValue,
        reason || 'classifier suggestion',
        actor ?? null,
      ],
    );
  } catch {
    /* improvement_signal is feedback provenance — failure must not block the reclassify. */
  }
}
