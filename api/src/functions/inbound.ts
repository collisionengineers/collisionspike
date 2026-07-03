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
import { query } from '../lib/db.js';
import { gates } from '../lib/gates.js';
import { enqueueOutlookMove } from '../lib/outlook-queue.js';
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
      const rows = await query<Row>(
        `SELECT inbound_email.*, c.case_po AS case_po
           FROM inbound_email
           LEFT JOIN case_ c ON c.id = inbound_email.case_id
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

    // Read the current row first so the audit carries the before-state + case linkage,
    // and so an unknown id is a clean 404 (not a swallowed no-op).
    const existing = await query<Row>(
      'SELECT id, triage_state, case_id, source_message_id FROM inbound_email WHERE id = $1',
      [id],
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };
    const before = (existing[0].triage_state as string | null) ?? 'new';

    // Real error handling: NO try/catch swallow — a DB failure surfaces as a 500 via withRole.
    const updated = await query<Row>(
      'UPDATE inbound_email SET triage_state = $2, updated_at = now() WHERE id = $1 RETURNING id',
      [id, state],
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    await writeAudit({
      action: TRIAGE_AUDIT_ACTION[state],
      ...(existing[0].case_id ? { caseId: existing[0].case_id as string } : {}),
      summary: `Inbound email ${before} -> ${state}`,
      before: { triageState: before },
      after: {
        triageState: state,
        inboundEmailId: id,
        sourceMessageId: existing[0].source_message_id ?? null,
      },
      ...(actor ? { actor } : {}),
    });

    return { status: 204 };
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
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    if (!gates.outlookMoveEnabled()) {
      return { status: 409, jsonBody: { error: 'outlook filing is not enabled' } };
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
        after: { inboundEmailId: id, folder, detail: e instanceof Error ? e.message.slice(0, 300) : String(e) },
        ...(actor ? { actor } : {}),
      });
      return { status: 503, jsonBody: { error: 'filing queue unavailable' } };
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

    const existing = await query<Row>(
      `SELECT id, category_code, subtype_code, suggested_category_code, suggested_subtype_code,
              case_id, work_provider_id, source_message_id
         FROM inbound_email WHERE id = $1`,
      [id],
    );
    if (!existing[0]) return { status: 404, jsonBody: { error: 'not found' } };
    const cur = existing[0];

    // Persist the CHOSEN values + mark the row human-settled. category/subtype are the
    // chosen/current values; suggested_* (set at classify time) stay untouched here.
    const sets: string[] = ["classifier_mode = 'human'"];
    const vals: unknown[] = [];
    if (category) {
      vals.push(INBOUND_CATEGORY_TO_INT[category]);
      sets.push(`category_code = $${vals.length}`);
    }
    if (subtype) {
      vals.push(INBOUND_SUBTYPE_TO_INT[subtype]);
      sets.push(`subtype_code = $${vals.length}`);
    }
    vals.push(id);
    const updated = await query<Row>(
      `UPDATE inbound_email SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}
       RETURNING *`,
      vals,
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    // Override capture: compare the chosen value to the SUGGESTION (suggested_* if present,
    // else the prior current value) BY NAME. A genuine override -> an improvement_signal row
    // (best-effort) so the classifier can be tuned; the audit always records the change.
    const suggestedCat = inboundCategoryFromInt(
      (cur.suggested_category_code ?? cur.category_code) as number | null | undefined,
    );
    const suggestedSub = inboundSubtypeFromInt(
      (cur.suggested_subtype_code ?? cur.subtype_code) as number | null | undefined,
    );
    const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

    if (category && category !== suggestedCat) {
      await writeImprovementSignal(cur, 'category', suggestedCat ?? '(none)', category, actor, reason);
    }
    if (subtype && subtype !== suggestedSub) {
      await writeImprovementSignal(cur, 'subtype', suggestedSub ?? '(none)', subtype, actor, reason);
    }

    await writeAudit({
      action: AUDIT_ACTION.inbound_reclassified,
      ...(cur.case_id ? { caseId: cur.case_id as string } : {}),
      summary: `Inbound reclassified${category ? ` category=${category}` : ''}${subtype ? ` subtype=${subtype}` : ''}`,
      before: { category: suggestedCat ?? null, subtype: suggestedSub ?? null },
      after: {
        category: category ?? null,
        subtype: subtype ?? null,
        inboundEmailId: id,
        sourceMessageId: cur.source_message_id ?? null,
        ...(reason ? { reason } : {}),
      },
      ...(actor ? { actor } : {}),
    });

    return { status: 200, jsonBody: rowToInboundEmail(updated[0]) };
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
