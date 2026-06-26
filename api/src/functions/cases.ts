/**
 * api/src/functions/cases.ts — case-scoped HTTP routes.
 *
 * DataAccess methods 1–8 + 20–21 (plan 21 §21.1):
 *   1  GET  /api/cases/{id}                     caseById        (404 -> SPA undefined)
 *   2  POST /api/cases                           createCase      (201 { id })
 *   3  GET  /api/queues/{name}/cases             casesForQueue
 *   4  GET  /api/cases?vrm=&open=true&exclude=   openVrmTwins
 *   5  POST /api/cases/{id}/hold                 setOnHold       (204)
 *   6  GET  /api/cases/{id}/merge-candidates     mergeCandidates
 *   7  POST /api/cases/{tgt}/merge               mergeCases
 *   8  GET  /api/cases/{id}/images               imagesForCase
 *   20 GET  /api/activity                        recentActivity
 *   21 GET  /api/cases/{id}/activity             activityForCase
 *
 * Logic the API now owns (plan 21 "Logic the API now owns"):
 *   - status state machine -> @cs/domain statusForReviewCase on every field/evidence
 *     /identity-changing write (createCase, mergeCases target recompute), terminal-locked.
 *   - dedup INVIOLABLE rules -> mergeCases asserts same work provider (never cross-provider).
 *   - audit -> one append-only audit_event row per state change.
 */

import { app, type HttpRequest } from '@azure/functions';
import {
  EVA_FIELD_ORDER,
  statusForReviewCase,
  type Case,
  type CreateCaseInput,
  type MergeCasesResult,
  type QueueName,
  type StatusEvaluationInput,
} from '@cs/domain';
import {
  inspectionDecisionCodec,
  intakeChannelKindCodec,
  reviewStateCodec,
  sourceTypeCodec,
  statusToInt,
} from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query } from '../lib/db.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import {
  CASE_SELECT,
  EVA_COLUMN_BY_KEY,
  TWIN_TERMINAL,
  filterQueue,
  rowToActivityEvent,
  rowToCase,
  rowToEvidence,
  type Row,
} from '../lib/mappers.js';

/* ----------  shared loaders  ---------- */

const pad = (n: number): string => String(n).padStart(2, '0');
function fmtTimestamp(v: unknown): string {
  if (v == null || v === '') return '';
  const d = v instanceof Date ? v : new Date(String(v));
  if (Number.isNaN(d.getTime())) return String(v);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function chaserTargetType(code: number | null | undefined): Case['chasers'][number]['targetType'] {
  if (code === 100000000) return 'image_source';
  if (code === 100000001) return 'repairer';
  return 'work_provider';
}

/** Load ALL case rows (provider-display joined), newest-first, adapted to Case[]. */
async function loadAllCases(now: Date): Promise<Case[]> {
  const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
  return rows.map((r) => rowToCase(r, { now }));
}

/** Load a single case_ row + its expanded children -> a full domain Case. */
async function loadCaseFull(id: string, now: Date): Promise<Case | undefined> {
  const rows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  const rec = rows[0];
  if (!rec) return undefined;
  const [prov, ev, notes, chasers] = await Promise.all([
    query<Row>('SELECT * FROM field_level_provenance WHERE case_id = $1', [id]),
    query<Row>('SELECT * FROM evidence WHERE case_id = $1 ORDER BY sequence_index NULLS LAST, created_at', [id]),
    query<Row>('SELECT * FROM note WHERE case_id = $1 ORDER BY occurred_at', [id]),
    query<Row>('SELECT * FROM chaser WHERE case_id = $1 ORDER BY created_at', [id]),
  ]);
  return rowToCase(rec, {
    now,
    provenanceRows: prov,
    evidence: ev.map(rowToEvidence),
    notes: notes.map((n) => ({
      id: n.id ?? '',
      author: n.author ?? '',
      timestamp: fmtTimestamp(n.occurred_at ?? n.created_at),
      text: n.text ?? '',
    })),
    chasers: chasers.map((ch) => ({
      id: ch.id ?? '',
      targetType: chaserTargetType(ch.target_type_code),
      targetName: ch.target_name ?? '',
      channel: ch.channel_code === 100000001 ? 'whatsapp' : 'email',
      templateUsed: ch.template_used ?? '',
      status: 'drafted',
      summary: ch.name ?? '',
      createdAt: fmtTimestamp(ch.drafted_at ?? ch.created_at),
      ...(ch.sent_by ? { sentBy: ch.sent_by } : {}),
      ...(ch.sent_at ? { sentAt: fmtTimestamp(ch.sent_at) } : {}),
    })),
  });
}

/** Light Case (row only, no children) — for merge/twin scoping checks + aggregates. */
async function loadCaseLite(id: string): Promise<Case | undefined> {
  const rows = await query<Row>(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? rowToCase(rows[0]) : undefined;
}

/**
 * Recompute a case's workflow status via the shared @cs/domain guard over its
 * current persisted fields + evidence; persist + audit only when it changes
 * (the guard self-enforces the terminal-lock). Returns the resulting status.
 */
async function recomputeStatus(caseId: string, actor?: string): Promise<void> {
  const full = await loadCaseFull(caseId, new Date());
  if (!full) return;
  const input: StatusEvaluationInput = {
    status: full.status,
    evaFields: full.evaFields,
    evidence: full.evidence,
    instructionCount: full.evidence.filter((e) => e.kind === 'instruction').length,
    hasIdentity:
      full.vrm.trim().length > 0 ||
      full.providerCode.trim().length > 0 ||
      full.evaFields.claimantName.value.trim().length > 0,
  };
  const next = statusForReviewCase(input);
  if (next === full.status) return;
  await query('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
    caseId,
    statusToInt(next),
  ]);
  await writeAudit({
    action: AUDIT_ACTION.status_changed,
    caseId,
    summary: `Status ${full.status} -> ${next}`,
    before: { status: full.status },
    after: { status: next },
    ...(actor ? { actor } : {}),
  });
}

/* ============================================================
   1 — GET /api/cases/{id}
   ============================================================ */
app.http('caseById', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const c = await loadCaseFull(id, new Date());
    if (!c) return { status: 404, jsonBody: { error: 'not found' } };
    return { status: 200, jsonBody: c };
  }),
});

/* ============================================================
   2 — POST /api/cases   (manual-intake write path)
   ============================================================ */
app.http('createCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const input = (await req.json()) as CreateCaseInput;
    const actor = actorFromClaims(claims);

    // Status state machine — compute the persisted status from the reviewed fields
    // (no evidence yet at manual intake), terminal-locked by the guard itself.
    const evalInput: StatusEvaluationInput = {
      status: input.status,
      evaFields: input.evaFields,
      evidence: [],
      instructionCount: 0,
      hasIdentity:
        (input.vrm ?? '').trim().length > 0 ||
        (input.providerCode ?? '').trim().length > 0 ||
        input.evaFields.claimantName.value.trim().length > 0,
    };
    const status = statusForReviewCase(evalInput);

    const name =
      [input.vrm, input.provider].filter((v) => v && v.trim()).join(' · ') || 'Manual case';

    // Build the INSERT column/value lists.
    const cols: string[] = ['name', 'vrm', 'status_code', 'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox'];
    const vals: unknown[] = [
      name,
      input.vrm ?? '',
      statusToInt(status),
      intakeChannelKindCodec.toInt('email') ?? null,
      true,
      input.sourceLabel ?? 'Manual intake (Data API)',
    ];
    const add = (col: string, value: unknown): void => {
      cols.push(col);
      vals.push(value);
    };
    if (input.casePo) add('case_po', input.casePo);
    if (input.onHold) add('on_hold', true);
    if (input.insuredName) add('ov_insured_name', input.insuredName);
    if (input.providerReference) add('ov_claim_number', input.providerReference);
    if (input.inspectionDecision && input.inspectionDecision !== 'unknown') {
      add('inspection_decision_code', inspectionDecisionCodec.toInt(input.inspectionDecision) ?? null);
    }
    for (const desc of EVA_FIELD_ORDER) {
      add(EVA_COLUMN_BY_KEY[desc.key], input.evaFields[desc.key]?.value ?? '');
    }

    const placeholders = vals.map((_v, i) => `$${i + 1}`).join(', ');
    const rows = await query<Row>(
      `INSERT INTO case_ (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      vals,
    );
    const newId = rows[0]?.id as string | undefined;
    if (!newId) return { status: 500, jsonBody: { error: 'case create returned no id' } };

    // Best-effort: one FieldLevelProvenance row per EVA field.
    if (input.writeProvenance) {
      await Promise.all(
        EVA_FIELD_ORDER.map(async (desc) => {
          const field = input.evaFields[desc.key];
          try {
            await query(
              `INSERT INTO field_level_provenance
                 (name, case_id, field_name, value, source_type_code, source_label, confidence, review_state_code)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
              [
                `${newId}:${desc.key}`,
                newId,
                desc.key,
                field.value,
                sourceTypeCodec.toInt(field.provenance.sourceType) ?? 100000000,
                field.provenance.sourceLabel,
                field.provenance.confidence ?? null,
                reviewStateCodec.toInt(field.reviewState) ?? 100000001,
              ],
            );
          } catch {
            /* provenance is supplementary — a single-row failure must not sink intake */
          }
        }),
      );
    }

    // Persist the image-based reason as a case note (best-effort).
    if (input.inspectionDecisionReason?.trim()) {
      try {
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          [
            'Inspection decision',
            newId,
            'Manual intake (Data API)',
            `Inspection decision: image-based — ${input.inspectionDecisionReason.trim()}`,
          ],
        );
      } catch {
        /* a note failure must not sink the create */
      }
    }

    await writeAudit({
      action: AUDIT_ACTION.case_created,
      caseId: newId,
      summary: `Case created (${name})`,
      after: { status, vrm: input.vrm },
      ...(actor ? { actor } : {}),
    });

    return { status: 201, jsonBody: { id: newId } };
  }),
});

/* ============================================================
   3 — GET /api/queues/{name}/cases
   ============================================================ */
app.http('casesForQueue', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'queues/{name}/cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const name = req.params.name as QueueName;
    const now = nowParam(req);
    const all = await loadAllCases(now);
    return { status: 200, jsonBody: filterQueue(all, name) };
  }),
});

/* ============================================================
   4 — GET /api/cases?vrm=&open=true&exclude=   (openVrmTwins)
   ============================================================ */
app.http('openVrmTwins', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const vrm = req.query.get('vrm') ?? '';
    const exclude = req.query.get('exclude') ?? undefined;
    if (!vrm) return { status: 200, jsonBody: [] };
    const rows = await query<Row>(`${CASE_SELECT} WHERE c.vrm = $1`, [vrm]);
    const twins = rows
      .map((r) => rowToCase(r))
      .filter((c) => !TWIN_TERMINAL.has(c.status) && c.id !== exclude);
    return { status: 200, jsonBody: twins };
  }),
});

/* ============================================================
   5 — POST /api/cases/{id}/hold
   ============================================================ */
app.http('setOnHold', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/hold',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json()) as { onHold: boolean };
    await query('UPDATE case_ SET on_hold = $2, updated_at = now() WHERE id = $1', [id, body.onHold]);
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId: id,
      summary: body.onHold ? 'Case put on hold' : 'Case taken off hold',
      after: { onHold: body.onHold },
      ...(actorFromClaims(claims) ? { actor: actorFromClaims(claims) } : {}),
    });
    return { status: 204 };
  }),
});

/* ============================================================
   6 — GET /api/cases/{id}/merge-candidates
   ============================================================ */
app.http('mergeCandidates', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/merge-candidates',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const self = await loadCaseLite(id);
    if (!self) return { status: 200, jsonBody: [] };
    const rows = await query<Row>(`${CASE_SELECT} ORDER BY c.created_at DESC`);
    const candidates = rows
      .map((r) => rowToCase(r))
      .filter(
        (cc) =>
          cc.id !== id &&
          !TWIN_TERMINAL.has(cc.status) &&
          cc.status !== 'linked_to_instruction' &&
          cc.providerCode === self.providerCode,
      );
    return { status: 200, jsonBody: candidates };
  }),
});

/* ============================================================
   7 — POST /api/cases/{tgt}/merge   ({tgt} = target/survivor)
   ============================================================ */
app.http('mergeCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{tgt}/merge',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const targetCaseId = req.params.tgt;
    const body = (await req.json()) as { sourceCaseId: string };
    const sourceCaseId = body.sourceCaseId;
    const actor = actorFromClaims(claims);

    if (!sourceCaseId || sourceCaseId === targetCaseId) {
      return { status: 400, jsonBody: { error: 'Cannot merge a case into itself.' } };
    }
    const [src, tgt] = await Promise.all([loadCaseLite(sourceCaseId), loadCaseLite(targetCaseId)]);
    if (!src || !tgt) return { status: 404, jsonBody: { error: 'Source or target case not found.' } };
    // ADR-0010 INVIOLABLE rule 2: NEVER link across different work providers.
    if (src.providerCode && tgt.providerCode && src.providerCode !== tgt.providerCode) {
      return { status: 400, jsonBody: { error: 'Refusing to merge across different work providers.' } };
    }
    if (TWIN_TERMINAL.has(tgt.status)) {
      return { status: 400, jsonBody: { error: 'Cannot merge into a finalised (terminal) case.' } };
    }

    // 1. Reparent the source's evidence onto the target.
    const moved = await query<Row>(
      'UPDATE evidence SET case_id = $2, updated_at = now() WHERE case_id = $1 RETURNING id',
      [sourceCaseId, targetCaseId],
    );
    const movedEvidence = moved.length;

    // 2. Retire the source: linked_to_instruction, record the survivor, clear hold.
    await query(
      `UPDATE case_
         SET status_code = $2, duplicate_keys = $3, on_hold = false, updated_at = now()
       WHERE id = $1`,
      [sourceCaseId, statusToInt('linked_to_instruction'), JSON.stringify({ mergedInto: targetCaseId })],
    );

    await writeAudit({
      action: AUDIT_ACTION.case_attached,
      caseId: targetCaseId,
      summary: `Merged ${sourceCaseId} into ${targetCaseId} (${movedEvidence} evidence)`,
      after: { sourceCaseId, targetCaseId, movedEvidence },
      ...(actor ? { actor } : {}),
    });

    // 3. Recompute the target's readiness now its evidence set changed.
    await recomputeStatus(targetCaseId, actor);

    const result: MergeCasesResult = { targetCaseId, movedEvidence };
    return { status: 200, jsonBody: result };
  }),
});

/* ============================================================
   8 — GET /api/cases/{id}/images
   ============================================================ */
app.http('imagesForCase', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/images',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const rows = await query<Row>(
      "SELECT * FROM evidence WHERE case_id = $1 AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image') AND excluded <> true ORDER BY sequence_index NULLS LAST, created_at",
      [id],
    );
    return { status: 200, jsonBody: rows.map(rowToEvidence) };
  }),
});

/* ============================================================
   20 — GET /api/activity   (recentActivity)
   ============================================================ */
app.http('recentActivity', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'activity',
  handler: withRole('CollisionSpike.User', async () => {
    const rows = await query<Row>('SELECT * FROM audit_event ORDER BY occurred_at DESC');
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  }),
});

/* ============================================================
   21 — GET /api/cases/{id}/activity   (activityForCase)
   ============================================================ */
app.http('activityForCase', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/activity',
  handler: withRole('CollisionSpike.User', async (req) => {
    const id = req.params.id;
    const rows = await query<Row>(
      'SELECT * FROM audit_event WHERE case_id = $1 ORDER BY occurred_at DESC',
      [id],
    );
    return { status: 200, jsonBody: rows.map(rowToActivityEvent) };
  }),
});

/* ----------  shared: the windowing clock query param  ---------- */
function nowParam(req: HttpRequest): Date {
  const raw = req.query.get('now');
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
