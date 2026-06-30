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
  casePoSequenceRegex,
  casePoYear,
  extractVrm,
  formatCasePo,
  statusForReviewCase,
  type Case,
  type CreateCaseInput,
  type EvaFieldKey,
  type MergeCasesResult,
  type NextCasePoResult,
  type QueueName,
  type RemoveCaseResult,
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
import { gates } from '../lib/gates.js';
import { listBoxFolderNames } from '../lib/functions-client.js';
import {
  CASE_SELECT,
  EVA_COLUMN_BY_KEY,
  TWIN_TERMINAL,
  filterQueue,
  maxCasePoSeqFromNames,
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

/* ----------  Durable case-page EVA-field edits (work-todo-spike: casepage)  ---------- */

/** Per-key max length (mirrors the case_.eva_* column widths) so an edit never 500s on a
 *  length overflow — over-long free text is clipped, validated fields are rejected (400). */
const EVA_MAXLEN: Record<EvaFieldKey, number> = {
  workProvider: 200,
  vehicleModel: 200,
  claimantName: 200,
  claimantTelephone: 60,
  claimantEmail: 320,
  dateOfLoss: 10,
  dateOfInstruction: 10,
  accidentCircumstances: 4000,
  inspectionAddress: 2000,
  vatStatus: 3,
  mileage: 20,
  mileageUnit: 6,
};
const isDmyOrEmpty = (v: string): boolean => v === '' || /^\d{2}\/\d{2}\/\d{4}$/.test(v);
const VAT_VALUES = new Set(['', 'Yes', 'No']);
const MILEAGE_UNITS = new Set(['', 'Miles', 'Km']);

/**
 * Validate + normalise a single editable EVA field value. Returns the normalised string to
 * persist, or an `{ error }` when the value violates the EVA format invariants (the same
 * CHECKs the DB enforces) — surfaced as a 400 so a bad edit never reaches the DB as a 500.
 */
function normaliseEvaEdit(key: EvaFieldKey, raw: string): { value: string } | { error: string } {
  const trimmed = raw.trim();
  if (key === 'dateOfLoss' || key === 'dateOfInstruction') {
    if (!isDmyOrEmpty(trimmed)) return { error: `${key} must be DD/MM/YYYY or empty` };
    return { value: trimmed };
  }
  if (key === 'vatStatus') {
    if (!VAT_VALUES.has(trimmed)) return { error: "vatStatus must be '', 'Yes' or 'No'" };
    return { value: trimmed };
  }
  if (key === 'mileageUnit') {
    if (!MILEAGE_UNITS.has(trimmed)) return { error: "mileageUnit must be '', 'Miles' or 'Km'" };
    return { value: trimmed };
  }
  // Free-text fields: keep as-is but clip to the column width (no hard 4xx on length).
  return { value: raw.slice(0, EVA_MAXLEN[key]) };
}

/** Upsert a 'staff' (manual edit) field_level_provenance row for one EVA field. One row per
 *  (case_id, field_name): UPDATE if present, else INSERT. Best-effort — provenance is
 *  supplementary and must never sink a durable case edit. */
async function upsertManualProvenance(caseId: string, fieldName: string, value: string): Promise<void> {
  try {
    const staff = sourceTypeCodec.toInt('staff') ?? 100000000;
    const reviewed = reviewStateCodec.toInt('reviewed') ?? 100000002;
    const upd = await query<{ id: string }>(
      `UPDATE field_level_provenance
          SET value = $3, source_type_code = $4, source_label = 'Manual edit (case page)',
              review_state_code = $5, updated_at = now()
        WHERE case_id = $1 AND field_name = $2
        RETURNING id`,
      [caseId, fieldName, value, staff, reviewed],
    );
    if (upd.length === 0) {
      await query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
         VALUES ($1, $2, $3, $4, $5, 'Manual edit (case page)', $6)`,
        [`${caseId}:${fieldName}`, caseId, fieldName, value, staff, reviewed],
      );
    }
  } catch {
    /* provenance is supplementary — never block the edit. */
  }
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
   1b — PATCH /api/cases/{id}   (durable in-place case edits)
   Accepts { vrm?, evaFields? } — the manual VRM correction PLUS durable case-page edits of
   the editable EVA fields (date_of_incident, date_of_instruction, vehicle model, etc.;
   work-todo-spike: casepage). Each changed EVA field is persisted, audited, and gets a
   'staff' (manual edit) field_level_provenance row. Returns the FULL updated Case (200) so
   the SPA can take server truth back. Authz: CollisionSpike.User (regular intake work).
   ============================================================ */
app.http('patchCase', {
  methods: ['PATCH'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      vrm?: string;
      evaFields?: Partial<Record<EvaFieldKey, string>>;
    };
    const actor = actorFromClaims(claims);

    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: 'not found' } };

    const sets: string[] = [];
    const vals: unknown[] = [];
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const changedEvaFields: Array<{ key: EvaFieldKey; value: string }> = [];

    // --- vrm ---
    if (body.vrm !== undefined) {
      const raw = String(body.vrm ?? '').trim();
      // Lenient by design: normalise via the shared canonical sniff (which strips embedded
      // postcodes/junk), but if the sniff rejects it, accept the operator's input verbatim
      // (uppercased, alphanumerics only, ≤16) — deliberate corrections of foreign/trade/
      // personal plates must land. '' clears the VRM. Never hard-4xx a non-standard mark.
      const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
      const newVrm = raw ? extractVrm(raw) || cleaned : '';
      if (newVrm !== existing.vrm) {
        sets.push(`vrm = $${sets.length + 1}`);
        vals.push(newVrm);
        before.vrm = existing.vrm;
        after.vrm = newVrm;
      }
    }

    // --- editable EVA fields (durable case-page edits) ---
    if (body.evaFields && typeof body.evaFields === 'object') {
      for (const [k, rawVal] of Object.entries(body.evaFields)) {
        if (rawVal === undefined || !(k in EVA_COLUMN_BY_KEY)) continue; // ignore unknown keys
        const key = k as EvaFieldKey;
        const norm = normaliseEvaEdit(key, String(rawVal ?? ''));
        if ('error' in norm) return { status: 400, jsonBody: { error: norm.error } };
        const oldVal = existing.evaFields[key]?.value ?? '';
        if (norm.value === oldVal) continue; // unchanged
        sets.push(`${EVA_COLUMN_BY_KEY[key]} = $${sets.length + 1}`);
        vals.push(norm.value);
        before[key] = oldVal;
        after[key] = norm.value;
        changedEvaFields.push({ key, value: norm.value });
      }
    }

    // No supplied change → return the current full Case unchanged (idempotent PATCH).
    if (sets.length === 0) {
      const cur = await loadCaseFull(id, new Date());
      return { status: 200, jsonBody: cur };
    }

    vals.push(id);
    await query(
      `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
      vals,
    );

    // One 'staff' (manual edit) provenance row per changed EVA field (best-effort upsert).
    for (const f of changedEvaFields) await upsertManualProvenance(id, f.key, f.value);

    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId: id,
      summary: `Case edited: ${Object.keys(after).join(', ')}`,
      before,
      after,
      ...(actor ? { actor } : {}),
    });

    // A VRM or required-EVA-field change can alter identity/readiness → recompute the workflow
    // status (terminal-locked by the shared guard); writes its own status_changed audit if it moves.
    await recomputeStatus(id, actor);

    const updated = await loadCaseFull(id, new Date());
    return { status: 200, jsonBody: updated };
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
    // Resolve the work_provider FK from the supplied principal code so merge-scoping and the
    // ADR-0010 cross-provider guard work for manual cases (sweep #24); leave null if unmatched.
    const pcode = (input.providerCode ?? '').trim();
    if (pcode) {
      const wp = await query<Row>('SELECT id FROM work_provider WHERE principal_code = $1 LIMIT 1', [pcode]);
      if (wp[0]?.id) add('work_provider_id', wp[0].id);
    }
    // Normalise to canonical UPPER (+ trim) so a manual 'ccpy26050' is stored the same as the
    // automated mint's 'CCPY26050' and collides on the case-insensitive uq_case_case_po (#82).
    const casePo = (input.casePo ?? '').trim().toUpperCase();
    if (casePo) add('case_po', casePo);
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
    const rows = await query<Row>('SELECT * FROM audit_event ORDER BY occurred_at DESC LIMIT 200');
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

/* ============================================================
   DELETE /api/cases/{id}   (Superuser-only SOFT remove — work-todo-spike: delete-case)
   Per ADR-0017 + data-protection.md: a SOFT remove only — status -> terminal 'removed',
   PII anonymised, the case row + append-only audit trail KEPT. Runs under the least-privilege
   staff grant (an UPDATE, never a hard DELETE — the app login has no DELETE). The Box folder is
   NEVER auto-deleted: `acknowledgeBoxFolderHandled` is an audit-only ACK; the operator follows
   the archive runbook by hand and the box_folder_id/url + case_po are PRESERVED for them.
   Requires the live choice_case_status row (100000011,'removed') — see 000_enums_lookups.sql.
   ============================================================ */
app.http('removeCase', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.Superuser', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      acknowledgeBoxFolderHandled?: boolean;
      reason?: string;
    };
    const actor = actorFromClaims(claims);

    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: 'not found' } };

    // Idempotent: a re-remove is a no-op success (never errors on an already-removed case).
    if (existing.status === 'removed') {
      const done: RemoveCaseResult = {
        id,
        status: 'removed',
        alreadyRemoved: true,
        ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
      };
      return { status: 200, jsonBody: done };
    }

    // Snapshot identity for the audit BEFORE anonymising (the trail keeps what was removed).
    const before = {
      status: existing.status,
      vrm: existing.vrm,
      casePo: existing.casePo ?? null,
      provider: existing.provider,
      claimantName: existing.evaFields.claimantName.value,
    };

    // Soft remove: status -> 'removed' (terminal), anonymise PII (the 12 EVA fields + VRM +
    // overview facts + claimant address). KEEP case_po + box_folder_id/url so the operator can
    // still find + handle the archive folder. on_hold cleared; closed_at stamped.
    const evaCols = EVA_FIELD_ORDER.map((d) => `${EVA_COLUMN_BY_KEY[d.key]} = ''`).join(', ');
    await query(
      `UPDATE case_
          SET status_code = $2, ${evaCols},
              vrm = '', case_ref = '', name = '[removed]',
              ov_insured_name = NULL, ov_claimant_name = NULL,
              ov_third_party_name = NULL, ov_claim_number = NULL,
              ov_policy_reference = NULL, ov_incident_date = NULL,
              ov_insurer_name = NULL, ov_repairer_name = NULL,
              eva_claimant_address = NULL,
              on_hold = false, closed_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, statusToInt('removed')],
    );

    await writeAudit({
      action: AUDIT_ACTION.case_removed,
      caseId: id,
      severity: 'warning',
      summary: `Case removed (soft): ${before.vrm || before.casePo || id}`,
      before,
      after: {
        status: 'removed',
        // The "also remove Box folder" tickbox is an INTENT FLAG only — no automated deletion.
        boxFolderAcknowledged: body.acknowledgeBoxFolderHandled === true,
        boxFolderId: existing.boxFolderId ?? null,
        boxFolderUrl: existing.boxFolderUrl ?? null,
        ...(typeof body.reason === 'string' && body.reason.trim() ? { reason: body.reason.trim() } : {}),
      },
      ...(actor ? { actor } : {}),
    });

    const result: RemoveCaseResult = {
      id,
      status: 'removed',
      alreadyRemoved: false,
      ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
    };
    return { status: 200, jsonBody: result };
  }),
});

/* ============================================================
   GET /api/cases/next-po?principal=XXX[&year=YY]   (Case/PO allocator PREVIEW)
   work-todo-spike: case-po-gen. DB history is authoritative: the next per-(principal,year)
   sequence is MAX+1 over committed case_po rows (case-insensitive — the same probe the
   advisory-locked mint in internal.ts uses). For a BRAND-NEW provider with NO DB history,
   falls back to scanning the Box root (BOX_FOLDER_ROOT_ID) for folders matching the
   principal prefix and takes max+1. PREVIEW only — the durable claim happens under the
   advisory lock at case create (the allocator authority stays the API/DB, not the UI).
   This literal route out-ranks the cases/{id} parameter route (host literal precedence).
   ============================================================ */
app.http('nextCasePo', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/next-po',
  handler: withRole('CollisionSpike.User', async (req, ctx) => {
    const principalRaw = (req.query.get('principal') ?? '').trim();
    if (!principalRaw) return { status: 400, jsonBody: { error: 'principal is required' } };
    const principal = principalRaw.toUpperCase();
    // Leading-alpha provider code, alphanumeric, ≤ 8 (matches work_provider.principal_code).
    if (!/^[A-Z][A-Z0-9]{0,7}$/.test(principal)) {
      return { status: 400, jsonBody: { error: 'invalid principal code' } };
    }
    const yearParam = (req.query.get('year') ?? '').trim();
    const yy = /^\d{2}$/.test(yearParam)
      ? yearParam
      : /^\d{4}$/.test(yearParam)
        ? yearParam.slice(-2)
        : casePoYear();
    const prefix = `${principal}${yy}`;

    // 1) DB history (authoritative). Strip the prefix by length so the contiguous year digits
    //    are not swept into the sequence (e.g. "CCPY26050" -> 050, not 26050).
    const seqRows = await query<{ max_seq: string | number }>(
      `SELECT COALESCE(MAX(SUBSTRING(upper(case_po) FROM length($3) + 1)::int), 0) AS max_seq
         FROM case_
        WHERE upper(case_po) LIKE $1 AND upper(case_po) ~ $2`,
      [`${prefix}%`, casePoSequenceRegex(principal, yy), prefix],
    );
    let maxSeq = Number(seqRows[0]?.max_seq ?? 0);
    let source: 'db' | 'box' = 'db';

    // 2) Box fallback — ONLY when the DB has no history for this (principal, year) AND Box is on.
    if (maxSeq === 0 && gates.boxApi() && gates.boxFolderRootId() && process.env.BOX_FN_URL) {
      try {
        const names = await listBoxFolderNames(gates.boxFolderRootId());
        const boxMax = maxCasePoSeqFromNames(names, principal, yy);
        if (boxMax > 0) {
          maxSeq = boxMax;
          source = 'box';
        }
      } catch (e) {
        ctx.error(`[next-po] Box fallback failed: ${String(e)}`); // best-effort; fall back to seq 1
      }
    }

    const nextSeq = maxSeq + 1;
    const casePo = formatCasePo(principal, yy, nextSeq);
    const result: NextCasePoResult = {
      principal,
      yy,
      seq: String(nextSeq).padStart(3, '0'),
      nextSeq,
      evaLower: casePo.toLowerCase(),
      boxUpper: casePo,
      source,
    };
    return { status: 200, jsonBody: result };
  }),
});

/* ============================================================
   Box affordance routes (work-todo-spike: box-sync / evidence viewing).
   The SPA's box-rest-transport.ts calls these THREE routes; before this they did
   NOT exist on the API, so every "Open in Archive" / image-upload / direct-submit
   click 404'd (the operator's reported "Open in archive … 404"). Each returns the
   seam BoxResult envelope { status, data?, message } with HTTP 200 ALWAYS (the
   client maps the status rather than throwing on non-2xx):
     status: 'ok' | 'gated_off' | 'folder_not_ready' | 'error'.
   ============================================================ */

/** Read a case's stamped Box folder id + url (set at intake step 2.5 / manual lever). */
async function readCaseBoxFolder(
  caseId: string,
): Promise<{ boxFolderId: string | null; boxFolderUrl: string | null }> {
  const rows = await query<{ box_folder_id: string | null; box_folder_url: string | null }>(
    'SELECT box_folder_id, box_folder_url FROM case_ WHERE id = $1',
    [caseId],
  );
  return {
    boxFolderId: rows[0]?.box_folder_id ?? null,
    boxFolderUrl: rows[0]?.box_folder_url ?? null,
  };
}

/* GET /api/cases/{id}/box/shared-link → BoxResult<SharedFolderLink>
   The "Open in Box" deep link for evidence viewing. DB-only + privacy-safe: returns
   the folder's stamped URL, else constructs the AUTHENTICATED app deep link from the
   folder id. NO public shared link is minted — staff open it under their own Box auth
   (BOX_EMBED_ENABLED stays reserved/off: link, never iframe). */
app.http('caseBoxSharedLink', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/shared-link',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.boxApi()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: 'Box is not enabled.' } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    const { boxFolderId, boxFolderUrl } = await readCaseBoxFolder(caseId);
    if (!boxFolderId) {
      return {
        status: 200,
        jsonBody: { status: 'folder_not_ready', message: 'This case has no Box folder yet.' },
      };
    }
    const folderUrl =
      (boxFolderUrl && boxFolderUrl.trim()) ||
      `https://app.box.com/folder/${encodeURIComponent(boxFolderId)}`;
    return { status: 200, jsonBody: { status: 'ok', data: { folderUrl } } };
  }),
});

/* POST /api/cases/{id}/box/copy-file-request → BoxResult<FileRequestLink>
   Copies the per-case File Request (account-free upload page) from the template.
   Requires the operator-provisioned BOX_FILE_REQUEST_TEMPLATE_ID (an outstanding
   Box-side item). Until that is set, an honest gated_off — NOT a 404 — so the chaser
   action degrades cleanly. (Wiring the box-fn copy op is a follow-up once the template
   id exists; it cannot be exercised before then, so it is not shipped half-built.) */
app.http('caseBoxCopyFileRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/copy-file-request',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.boxApi() || !gates.boxFileRequest()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: 'Image-upload links are not enabled.' } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    if (!gates.boxFileRequestTemplateId()) {
      return {
        status: 200,
        jsonBody: { status: 'gated_off', message: 'The image-upload template isn’t set up yet.' },
      };
    }
    const { boxFolderId } = await readCaseBoxFolder(caseId);
    if (!boxFolderId) {
      return { status: 200, jsonBody: { status: 'folder_not_ready', message: 'This case has no Box folder yet.' } };
    }
    // Template id present (operator provisioned it) but the box-fn copy bridge is not
    // yet wired — honest gated_off rather than a fabricated link. Follow-up ticket.
    return {
      status: 200,
      jsonBody: { status: 'gated_off', message: 'Image-upload links aren’t wired up yet.' },
    };
  }),
});

/* POST /api/cases/{id}/box/finalize → BoxResult<FinalizeAck>
   Direct EVA submit-signal. EVA submission is the JSON drag-drop path today
   (EVA_API_ENABLED is off), so direct submit is not wired — an honest gated_off,
   never a fabricated terminal status. Staff use "Export for EVA". */
app.http('caseBoxFinalize', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/finalize',
  handler: withRole('CollisionSpike.User', async (req) => {
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    return {
      status: 200,
      jsonBody: { status: 'gated_off', message: 'Direct submit isn’t enabled — use “Export for EVA”.' },
    };
  }),
});

/* ----------  shared: the windowing clock query param  ---------- */
function nowParam(req: HttpRequest): Date {
  const raw = req.query.get('now');
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
