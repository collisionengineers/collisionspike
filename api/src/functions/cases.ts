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
  CASE_PO_SHAPE_RE,
  EVA_FIELD_ORDER,
  IMAGE_BASED_LITERAL,
  canonicalizeVrm,
  casePoSequenceRegex,
  casePoYear,
  decideMergeProvider,
  extractVrm,
  formatCasePo,
  isRetiredMerged,
  normalizeCasePo,
  statusForReviewCase,
  type Case,
  type Chaser,
  type CreateCaseInput,
  type EvaFieldKey,
  type MergeCasesResult,
  type NextCasePoResult,
  type QueueName,
  type RemoveCaseResult,
  type StatusEvaluationInput,
} from '@cs/domain';
import {
  caseTypeCodec,
  inspectionDecisionCodec,
  intakeChannelKindCodec,
  reviewStateCodec,
  sourceTypeCodec,
  statusToInt,
} from '@cs/domain/codecs';
import { withRole } from '../lib/auth.js';
import { query, tx } from '../lib/db.js';
import { isPrefillApplicable, prefillImageBasedInspection } from '../lib/inspection-prefill.js';
import { casePoFloor, mintCasePo } from '../lib/case-po.js';
import { isUniqueViolation } from './internal.js';
import { ifMatch, staleVersion, versionToken } from '../lib/concurrency.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { gates } from '../lib/gates.js';
import { listBoxFolderNames } from '../lib/functions-client.js';
import {
  CASE_SELECT,
  CASE_SELECT_WITH_ACTIVITY,
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

/** cr1bd_chaserstatus code → domain status. A chase set 'responded' by the reply /
 *  dedup-attach / auto-attach path (internal.ts markOutstandingChasersResponded) must
 *  surface as satisfied on the next case read, not always as 'drafted' (TKT-023/050). */
function chaserStatusName(code: number | null | undefined): Chaser['status'] {
  if (code === 100000001) return 'sent';
  if (code === 100000002) return 'responded';
  if (code === 100000003) return 'overdue';
  return 'drafted'; // 100000000 or null (DB default)
}

/** Map one chaser row to the domain Chaser — the EXACT shape the case-detail read
 *  (loadCaseFull) returns, and therefore the shape POST /cases/{id}/chase echoes back
 *  (M-E2) so the SPA can append the created row to its in-memory list verbatim. */
export function rowToChaser(ch: Row): Chaser {
  return {
    id: ch.id ?? '',
    targetType: chaserTargetType(ch.target_type_code),
    targetName: ch.target_name ?? '',
    channel: ch.channel_code === 100000001 ? 'whatsapp' : 'email',
    templateUsed: ch.template_used ?? '',
    status: chaserStatusName(ch.status_code as number | null | undefined),
    summary: ch.name ?? '',
    createdAt: fmtTimestamp(ch.drafted_at ?? ch.created_at),
    ...(ch.sent_by ? { sentBy: ch.sent_by } : {}),
    ...(ch.sent_at ? { sentAt: fmtTimestamp(ch.sent_at) } : {}),
  };
}

/** Load ALL case rows (provider-display joined), newest-first, adapted to Case[].
 *  Uses the activity-joined SELECT so every queue row carries its "Last update"
 *  descriptor (TKT-117) without a per-case fan-out. */
async function loadAllCases(now: Date): Promise<Case[]> {
  const rows = await query<Row>(`${CASE_SELECT_WITH_ACTIVITY} ORDER BY c.created_at DESC`);
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
    chasers: chasers.map(rowToChaser),
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
 *
 * TKT-109/129: the evaluation seam first applies the provider-policy inspection
 * pre-fill (always_image_based providers auto-complete "Image Based Assessment",
 * fill-if-empty, audited) so an image-led provider's case is never held Not Ready
 * on a blank inspection field a policy already answers.
 */
async function recomputeStatus(caseId: string, actor?: string): Promise<void> {
  const full = await loadCaseFull(caseId, new Date());
  if (!full) return;
  if (isPrefillApplicable(full)) {
    const filled = await prefillImageBasedInspection(caseId, actor);
    if (filled) {
      // Patch the in-memory copy so THIS evaluation already sees the filled field
      // (no re-read; the guarded UPDATE is the durable source of truth).
      full.evaFields.inspectionAddress.value = IMAGE_BASED_LITERAL;
      full.inspectionDecision = 'image_based';
    }
  }
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
    // Expose the case version as an ETag (TKT-111) so the assistant write tier can re-fetch,
    // capture it, and send it back as If-Match on a confirmed write (optimistic concurrency).
    const ver = await query<Row>('SELECT updated_at FROM case_ WHERE id = $1', [id]);
    return {
      status: 200,
      jsonBody: c,
      ...(ver[0] ? { headers: { ETag: versionToken(ver[0].updated_at) } } : {}),
    };
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
      /** ADR-0021 review-time case-type correction — notably the repairable-vs-total-loss
       *  refinement of a QDOS audit ('audit' → 'audit_total_loss'), which is NEVER
       *  determinable at intake. 'standard' (or '') clears back to the default. */
      caseType?: string;
      /** ADR-0022 transition seam — staff stamp the REAL Case/PO over a placeholder (or
       *  onto an un-numbered case) at EVA-add time during the parallel-run, and the
       *  cutover renumber uses the same write. Shape-validated; '' clears. */
      casePo?: string;
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
    let inspectionAddressChanged = false;
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
        if (key === 'inspectionAddress') inspectionAddressChanged = true;
      }
    }

    // A staff inspection-address edit must not leave an earlier auto-prefilled
    // image_based decision code shadowing it: rowToCase/deriveInspectionDecision prefer the
    // explicit code over the address text, so an image-based-provider case would reload as
    // 'image_based' even after a physical address is chosen. Clear the explicit code so the
    // decision re-derives from the new address text (IBA literal -> image_based; a physical
    // address -> unknown, symmetric with a never-prefilled case). (TKT-129/PR47-A2)
    if (inspectionAddressChanged) {
      sets.push('inspection_decision_code = NULL');
    }

    // --- casePo (ADR-0022 transition seam: stamp the REAL number; '' clears) ---
    if (body.casePo !== undefined) {
      const raw = String(body.casePo ?? '').trim();
      const normalized = raw ? normalizeCasePo(raw) : '';
      if (normalized && !CASE_PO_SHAPE_RE.test(normalized)) {
        return {
          status: 400,
          jsonBody: {
            error: `casePo '${raw}' is not Case/PO-shaped (marker? + principal + YY + sequence, e.g. CCPY26050 or A.PCH261269)`,
          },
        };
      }
      const oldPo = (existing.casePo ?? '').toUpperCase();
      if (normalized !== oldPo) {
        sets.push(`case_po = $${sets.length + 1}`);
        vals.push(normalized || null);
        before.casePo = oldPo || '(none)';
        after.casePo = normalized || '(cleared)';
      }
    }

    // --- case type (ADR-0021 review-time correction) ---
    if (body.caseType !== undefined) {
      const rawType = String(body.caseType ?? '').trim();
      const validName = rawType === '' || caseTypeCodec.toInt(rawType as never) != null;
      if (!validName) {
        return {
          status: 400,
          jsonBody: {
            error: `caseType must be one of ${caseTypeCodec.names().map((n) => `'${n}'`).join(', ')} (or '' to clear)`,
          },
        };
      }
      // 'standard' is stored as NULL (the column default semantics: null = standard), so
      // clearing and setting-standard are the same write.
      const newCode =
        rawType === '' || rawType === 'standard' ? null : caseTypeCodec.toInt(rawType as never)!;
      const curRows = await query<{ case_type_code: number | null }>(
        'SELECT case_type_code FROM case_ WHERE id = $1',
        [id],
      );
      const oldCode = curRows[0]?.case_type_code ?? null;
      if (newCode !== oldCode) {
        sets.push(`case_type_code = $${sets.length + 1}`);
        vals.push(newCode);
        before.caseType = caseTypeCodec.toName(oldCode) ?? 'standard';
        after.caseType = rawType || 'standard';
      }
    }

    // No supplied change → return the current full Case unchanged (idempotent PATCH).
    if (sets.length === 0) {
      const cur = await loadCaseFull(id, new Date());
      return { status: 200, jsonBody: cur };
    }

    vals.push(id);
    try {
      await query(
        `UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`,
        vals,
      );
    } catch (e) {
      // uq_case_case_po: the stamped number is already held by another case — a REAL
      // conflict the staff member must see (which case owns it), never a bare 500.
      if (isUniqueViolation(e) && after.casePo) {
        const holder = await query<{ id: string; vrm: string | null }>(
          'SELECT id, vrm FROM case_ WHERE upper(case_po) = $1 AND id <> $2',
          [String(after.casePo).toUpperCase(), id],
        );
        return {
          status: 409,
          jsonBody: {
            error: 'case_po_in_use',
            message: `Case/PO ${after.casePo} is already assigned to another case.`,
            conflictCaseId: holder[0]?.id ?? null,
            conflictVrm: holder[0]?.vrm ?? null,
          },
        };
      }
      throw e;
    }

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

    const name = (
      [input.vrm, input.provider].filter((v) => v && v.trim()).join(' · ') || 'Manual case'
    ).slice(0, 100);

    // Build the INSERT column/value lists.
    const cols: string[] = ['name', 'vrm', 'status_code', 'intake_channel_kind_code', 'intake_channel_manual', 'source_mailbox'];
    const vals: unknown[] = [
      name,
      input.vrm ?? '',
      statusToInt(status),
      intakeChannelKindCodec.toInt('email') ?? null,
      true,
      input.sourceLabel ?? 'Manual intake',
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
    // Normalise explicit references to canonical UPPER (+ trim). If the client omits
    // casePo but supplies a valid principal, the API allocates under the same
    // per-(principal,year) advisory lock used by automated intake.
    const suppliedCasePo = (input.casePo ?? '').trim().toUpperCase();
    const principalForAutoMint = !suppliedCasePo ? pcode.toUpperCase() : '';
    if (principalForAutoMint && !/^[A-Z][A-Z0-9]{0,7}$/.test(principalForAutoMint)) {
      return { status: 400, jsonBody: { error: 'invalid principal code' } };
    }
    if (input.onHold) add('on_hold', true);
    if (input.insuredName) add('ov_insured_name', input.insuredName);
    if (input.providerReference) add('ov_claim_number', input.providerReference);
    if (input.inspectionDecision && input.inspectionDecision !== 'unknown') {
      add('inspection_decision_code', inspectionDecisionCodec.toInt(input.inspectionDecision) ?? null);
    }
    for (const desc of EVA_FIELD_ORDER) {
      add(EVA_COLUMN_BY_KEY[desc.key], input.evaFields[desc.key]?.value ?? '');
    }

    const newId = await tx(async (q) => {
      const insertCols = [...cols];
      const insertVals = [...vals];
      let casePo = suppliedCasePo;
      if (!casePo && principalForAutoMint) {
        // Shared advisory-locked mint (api/src/lib/case-po.ts) — identical logic to the
        // automated-intake and provider-API paths; the lock lives on this transaction's `q`.
        casePo = await mintCasePo(q, principalForAutoMint);
      }
      if (casePo) {
        insertCols.push('case_po');
        insertVals.push(casePo);
      }

      const placeholders = insertVals.map((_v, i) => `$${i + 1}`).join(', ');
      const rows = await q<Row>(
        `INSERT INTO case_ (${insertCols.join(', ')}) VALUES (${placeholders}) RETURNING id`,
        insertVals,
      );
      return rows[0]?.id as string | undefined;
    });
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

    // Image-only intake (TKT-024): record who sent the images + when as a durable
    // case note (there is no dedicated column; the note is the operator-visible
    // artifact). Best-effort — a note failure must not sink the create.
    const receivedFrom = (input.receivedFrom ?? '').trim();
    const receivedOn = (input.receivedOn ?? '').trim();
    if (receivedFrom || receivedOn) {
      try {
        const parts = [
          receivedFrom ? `Received from ${receivedFrom}` : 'Received',
          receivedOn ? `on ${receivedOn}` : '',
        ]
          .filter(Boolean)
          .join(' ');
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          ['Images received', newId, actor ?? 'Manual intake', `${parts}.`],
        );
      } catch {
        /* best-effort */
      }
    }

    // Persist the image-based reason as a case note (best-effort).
    if (input.inspectionDecisionReason?.trim()) {
      try {
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          [
            'Inspection decision',
            newId,
            'Manual intake',
            `Inspection decision: image-based - ${input.inspectionDecisionReason.trim()}`,
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

    // TKT-109/129: a manual case for an always_image_based provider pre-fills its
    // inspection field immediately (recomputeStatus runs the guarded pre-fill first,
    // then re-derives the status over the now-complete field set; a no-op for every
    // other provider — the guard persists only on an actual change).
    await recomputeStatus(newId, actor);

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
    const vrm = canonicalizeVrm(req.query.get('vrm') ?? '');
    const exclude = req.query.get('exclude') ?? undefined;
    if (!vrm) return { status: 200, jsonBody: [] };
    // Canonicalise BOTH sides (upper, alnum-only) so a spaced/lower-case query ("YT13 UTV")
    // matches the compacted stored mark ("YT13UTV") — the shared canonicalizeVrm rule, mirrored
    // in SQL. (Small dataset; an expression index on the canonical form is a later optimisation.)
    const rows = await query<Row>(
      `${CASE_SELECT} WHERE regexp_replace(upper(c.vrm), '[^A-Z0-9]', '', 'g') = $1`,
      [vrm],
    );
    const twins = rows
      .map((r) => rowToCase(r))
      // TKT-141: a retired merged duplicate (linked_to_instruction + mergedInto) is
      // resolved work — never an open twin, exactly like the terminal set.
      .filter((c) => !TWIN_TERMINAL.has(c.status) && !isRetiredMerged(c) && c.id !== exclude);
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
    // Optimistic concurrency (TKT-111): a confirmed assistant write carries If-Match; reject a
    // stale precondition with 409. No If-Match (the normal SPA) → skip the check (back-compat).
    if (ifMatch(req) != null) {
      const cur = await query<Row>('SELECT updated_at FROM case_ WHERE id = $1', [id]);
      if (!cur[0]) return { status: 404, jsonBody: { error: 'not found' } };
      if (staleVersion(req, cur[0].updated_at)) {
        return { status: 409, jsonBody: { error: 'stale', currentVersion: versionToken(cur[0].updated_at) } };
      }
    }
    const updated = await query<Row>(
      'UPDATE case_ SET on_hold = $2, updated_at = now() WHERE id = $1 RETURNING updated_at',
      [id, body.onHold],
    );
    if (!updated[0]) return { status: 404, jsonBody: { error: 'not found' } };
    await writeAudit({
      action: AUDIT_ACTION.status_changed,
      caseId: id,
      summary: body.onHold ? 'Case put on hold' : 'Case taken off hold',
      after: { onHold: body.onHold },
      ...(actorFromClaims(claims) ? { actor: actorFromClaims(claims) } : {}),
    });
    return { status: 204, headers: { ETag: versionToken(updated[0].updated_at) } };
  }),
});

/* ============================================================
   5b — POST /api/cases/{id}/chase   (M-E2: durable chaser log)
   The SPA chaser log was CLIENT-STATE ONLY — the case-detail read pulls from the
   chaser table but no write endpoint existed, so every "log as chased" evaporated
   on reload (real data loss). This persists the drafted chaser to the SAME
   table/columns the read queries and echoes the created row back in EXACTLY the
   read shape (rowToChaser) so the client appends server truth. Draft-only in M1 —
   a chase is LOGGED, never sent (send stays gated, ADR-0003), so status_code
   keeps the DB default 'drafted'. Authz mirrors setOnHold (CollisionSpike.User).
   ============================================================ */
app.http('logChase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/chase',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      channel?: unknown;
      templateLabel?: unknown;
      note?: unknown;
    };

    // --- validation: all 400s decided BEFORE any DB write ---
    const channel = body.channel;
    if (channel !== 'email' && channel !== 'whatsapp') {
      return { status: 400, jsonBody: { error: "channel must be 'email' or 'whatsapp'" } };
    }
    if (typeof body.templateLabel !== 'string' || !body.templateLabel.trim()) {
      return { status: 400, jsonBody: { error: 'templateLabel is required' } };
    }
    const templateLabel = body.templateLabel.trim();
    if (templateLabel.length > 200) {
      return { status: 400, jsonBody: { error: 'templateLabel must be 200 characters or fewer' } };
    }
    if (body.note !== undefined && typeof body.note !== 'string') {
      return { status: 400, jsonBody: { error: 'note must be a string' } };
    }
    if (typeof body.note === 'string' && body.note.length > 2000) {
      return { status: 400, jsonBody: { error: 'note must be 2000 characters or fewer' } };
    }
    const note = typeof body.note === 'string' ? body.note.trim() : '';

    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: 'not found' } };

    const actor = actorFromClaims(claims);
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'email';
    // chaser.name = the queue summary (varchar(400)); mirrors the SPA's "Chased via …"
    // wording so the persisted summary reads identically to the old client-state note.
    const summary = `Chased via ${channelLabel} — ${templateLabel}.`.slice(0, 400);
    // The chase target: the work provider (the party chased for missing items) — the
    // read's default targetType. target_name = the provider display name (varchar(200)).
    const targetName = existing.provider.slice(0, 200);

    const rows = await query<Row>(
      `INSERT INTO chaser
         (name, case_id, target_type_code, target_name, channel_code, template_used, drafted_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING *`,
      [
        summary,
        id,
        100000002, // choice_chaser_target_type: work_provider
        targetName,
        channel === 'whatsapp' ? 100000001 : 100000000, // choice_chaser_channel
        templateLabel,
      ],
    );
    const created = rows[0];
    if (!created) return { status: 500, jsonBody: { error: 'chaser insert returned no row' } };

    // Optional free-text note -> a durable case note (best-effort, same pattern as
    // createCase's inspection-decision note; a note failure must not sink the chase log).
    if (note) {
      try {
        await query(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          ['Chase note', id, actor ?? 'Staff', note],
        );
      } catch {
        /* best-effort */
      }
    }

    // chaser_sent (100000023) is the controlled chaser-family audit action (one of the
    // original seeded codes); the summary keeps the wording honest — LOGGED, not sent.
    await writeAudit({
      action: AUDIT_ACTION.chaser_sent,
      caseId: id,
      summary: `Chase logged (${channel} · ${templateLabel})`,
      after: {
        chaserId: created.id,
        channel,
        templateLabel,
        ...(note ? { note } : {}),
      },
      ...(actor ? { actor } : {}),
    });

    return { status: 201, jsonBody: rowToChaser(created) };
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

    // 1b. Reparent the source's inbound emails too (TKT-092 — the retired case must not
    // keep the email trail; the survivor owns the whole thread).
    const movedEmails = await query<Row>(
      'UPDATE inbound_email SET case_id = $2, updated_at = now() WHERE case_id = $1 RETURNING id',
      [sourceCaseId, targetCaseId],
    );

    // 1c. Provider preference (TKT-052): the merged survivor must end with whichever side
    // carries a resolved provider — an image-only target merged with an instructions
    // source used to LOSE the provider the source knew. Cross-provider was already
    // refused above (ADR-0010 rule 2); decideMergeProvider re-asserts it defensively.
    const fkRows = await query<Row>(
      'SELECT id, work_provider_id FROM case_ WHERE id = ANY($1::uuid[])',
      [[sourceCaseId, targetCaseId]],
    );
    const srcFk = (fkRows.find((r) => r.id === sourceCaseId)?.work_provider_id as string | null) ?? null;
    const tgtFk = (fkRows.find((r) => r.id === targetCaseId)?.work_provider_id as string | null) ?? null;
    const providerDecision = decideMergeProvider(srcFk, tgtFk);
    let providerFilled = false;
    if (!providerDecision.crossProvider && providerDecision.filledFrom === 'source' && providerDecision.providerId) {
      await query(
        `UPDATE case_ SET work_provider_id = $2, updated_at = now()
          WHERE id = $1 AND work_provider_id IS NULL`,
        [targetCaseId, providerDecision.providerId],
      );
      // Fill the human-readable EVA provider column too (fill-if-empty) + provenance.
      const wp = await query<Row>('SELECT display_name FROM work_provider WHERE id = $1', [
        providerDecision.providerId,
      ]);
      const displayName = ((wp[0]?.display_name as string | null) ?? '').trim();
      if (displayName) {
        await query(
          `UPDATE case_ SET eva_work_provider = $2, updated_at = now()
            WHERE id = $1 AND (eva_work_provider IS NULL OR eva_work_provider = '')`,
          [targetCaseId, displayName.slice(0, 200)],
        );
      }
      await query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label)
         VALUES ($1, $2, 'workProviderId', $3, $4, $5)`,
        [
          `${targetCaseId}:workProviderId`,
          targetCaseId,
          providerDecision.providerId,
          sourceTypeCodec.toInt('corpus') ?? 100000003,
          'Carried over from the merged case',
        ],
      ).catch(() => { /* provenance is supplementary */ });
      providerFilled = true;
    }

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
      summary:
        `Merged ${sourceCaseId} into ${targetCaseId} (${movedEvidence} evidence, ${movedEmails.length} emails` +
        `${providerFilled ? ', provider carried over from the merged case' : ''})`,
      after: {
        sourceCaseId,
        targetCaseId,
        movedEvidence,
        movedEmails: movedEmails.length,
        providerFilled,
      },
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
      // Person-reflection photos are auto-excluded from EVA (domain rule: a visible reflection
      // makes the photo unusable — acceptedForEva stays false), but they MUST still surface in
      // the case-detail REVIEW list so the TKT-123 dismissible warning + Exclude control are
      // reachable and staff can override a false-positive detection. They carry acceptedForEva
      // = false, so EVA export / photo-ordering / readiness (all keyed on acceptedForEva) are
      // unaffected. Non-reflection excluded rows stay hidden as before. (PR48-B2)
      "SELECT * FROM evidence WHERE case_id = $1 AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image') AND (excluded <> true OR person_reflection = true) ORDER BY sequence_index NULLS LAST, created_at",
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
   DELETE /api/cases/{id}   (CLOSE case — TKT-010, re-scoped 2026-07-08)
   SEMANTICS CHANGE (operator workstream item 13): this is a CLOSE, not a delete —
   a terminal soft state open to ALL staff (role relaxed Superuser → User), and it
   is NON-DESTRUCTIVE: the prior PII anonymisation (EVA fields / VRM / overview
   facts / notes / evidence / inbound rows all blanked) is REMOVED. The case keeps
   every detail; only status -> terminal 'removed' (the stored enum name is
   unchanged — the UI words it "Closed"), on_hold cleared, closed_at stamped. It
   leaves the work queues (statusToQueue: terminal states own no queue) and is
   reversible in principle. Data-protection erasure is a SEPARATE, deliberate
   operator action (ADR-0017 / data-protection.md), not this button.
   The Box folder is NEVER auto-deleted: `acknowledgeArchiveFolderHandled` is an
   audit-only ACK (ADR-0017); box_folder_id/url + case_po stay for the operator.
   ============================================================ */
app.http('removeCase', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'cases/{id}',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = req.params.id;
    const body = (await req.json().catch(() => ({}))) as {
      acknowledgeArchiveFolderHandled?: boolean;
      acknowledgeBoxFolderHandled?: boolean;
      reason?: string;
    };
    const actor = actorFromClaims(claims);

    const existing = await loadCaseLite(id);
    if (!existing) return { status: 404, jsonBody: { error: 'not found' } };

    // Idempotent: a re-close is a no-op success (never errors on an already-closed case).
    if (existing.status === 'removed') {
      const done: RemoveCaseResult = {
        id,
        status: 'removed',
        alreadyRemoved: true,
        ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
      };
      return { status: 200, jsonBody: done };
    }

    const before = {
      status: existing.status,
      vrm: existing.vrm,
      casePo: existing.casePo ?? null,
      provider: existing.provider,
    };

    // Close: status -> 'removed' (terminal), hold cleared, closed_at stamped.
    // NOTHING is blanked — the record keeps its details for the file.
    await query(
      `UPDATE case_
          SET status_code = $2, on_hold = false, closed_at = now(), updated_at = now()
        WHERE id = $1`,
      [id, statusToInt('removed')],
    );

    await writeAudit({
      action: AUDIT_ACTION.case_removed,
      caseId: id,
      summary: `Case closed: ${before.vrm || before.casePo || id}`,
      before,
      after: {
        status: 'removed',
        // The archive tickbox is an INTENT FLAG only — no automated Box deletion (ADR-0017).
        archiveFolderAcknowledged:
          body.acknowledgeArchiveFolderHandled === true || body.acknowledgeBoxFolderHandled === true,
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
    let source: 'db' | 'box' | 'floor' = 'db';

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

    // 3) ADR-0022 cutover floor — the seeded real-world maximum outranks both baselines, so
    //    the PREVIEW matches what mintCasePo will actually allocate.
    const floor = await casePoFloor(query, prefix);
    if (floor > maxSeq) {
      maxSeq = floor;
      source = 'floor';
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
   (evidence is always linked, never embedded — no iframe, no frame-src edit). */
app.http('caseBoxSharedLink', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/shared-link',
  handler: withRole('CollisionSpike.User', async (req) => {
    if (!gates.boxApi()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: 'The archive is not available yet.' } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    const { boxFolderId, boxFolderUrl } = await readCaseBoxFolder(caseId);
    if (!boxFolderId) {
      return {
        status: 200,
        jsonBody: { status: 'folder_not_ready', message: 'This case has no archive folder yet.' },
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
      return { status: 200, jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    if (!gates.boxFileRequestTemplateId()) {
      return {
        status: 200,
        jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." },
      };
    }
    const { boxFolderId } = await readCaseBoxFolder(caseId);
    if (!boxFolderId) {
      return { status: 200, jsonBody: { status: 'folder_not_ready', message: 'This case has no archive folder yet.' } };
    }
    // Template id present (operator provisioned it) but the box-fn copy bridge is not
    // yet wired — honest gated_off rather than a fabricated link. Follow-up ticket.
    return {
      status: 200,
      jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." },
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
      jsonBody: { status: 'gated_off', message: 'Direct submit is not available yet. Use "Export for EVA".' },
    };
  }),
});

/* ============================================================
   TKT-094 Phase B — POST /api/cases/{id}/eva-submitted
   Fired by the SPA's "Export for EVA" handler AFTER a successful zip download
   (the export itself stays a pure client-side download — this is the status
   write that was always missing). Guarded idempotent: only a ready_for_eva
   case advances, so a double-click / stale retry is a no-op with no duplicate
   audit row. Writes submitted_at (the dashboard throughput source) for the
   first time in the product's life.
   ============================================================ */
app.http('markEvaSubmitted', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/eva-submitted',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = (req.params.id ?? '').trim();
    if (!id) return { status: 400, jsonBody: { message: 'A case is required.' } };
    const updated = await query<{ id: string }>(
      // Clear on_hold on the terminal handoff: filterQueue gives onHold precedence over
      // status (mappers.ts), so a still-held case would otherwise linger in the Held/work
      // queues while ALSO showing in Completed. A submitted case is no longer actionable.
      `UPDATE case_ SET status_code = $1, submitted_at = now(), on_hold = false, updated_at = now()
       WHERE id = $2 AND status_code = $3
       RETURNING id`,
      [statusToInt('eva_submitted'), id, statusToInt('ready_for_eva')],
    );
    if (updated.length > 0) {
      await writeAudit({
        action: AUDIT_ACTION.eva_submitted,
        caseId: id,
        summary: 'Exported for EVA — case marked EVA Submitted',
        after: { status: 'eva_submitted' },
        actor: actorFromClaims(claims),
      });
    }
    // updated:false covers both "already submitted" (benign idempotent no-op)
    // and "not ready yet" — the caller re-reads the case either way.
    return { status: 200, jsonBody: { updated: updated.length > 0 } };
  }),
});

/* ============================================================
   TKT-095 (thin-slice bridge) — POST /api/cases/{id}/mark-done
   The staff "Mark report delivered" action (CaseDetail button, visible only on
   an eva_submitted case). Same guarded-idempotent shape as the internal
   detector endpoint (internal.ts internalCasesMarkDone) — the WHERE guard makes
   double-clicks, webhook re-delivery and Durable at-least-once all no-ops.
   `done` (ADR-0023) = the CE report has been delivered back to the work provider.
   ============================================================ */
app.http('markCaseDone', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/mark-done',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const id = (req.params.id ?? '').trim();
    if (!id) return { status: 400, jsonBody: { message: 'A case is required.' } };
    const updated = await query<{ id: string }>(
      // Clear on_hold on the terminal transition (same reason as eva-submitted above):
      // a delivered/done case must not remain in the Held/work queues.
      `UPDATE case_ SET status_code = $1, on_hold = false, updated_at = now()
       WHERE id = $2 AND status_code = $3
       RETURNING id`,
      [statusToInt('done'), id, statusToInt('eva_submitted')],
    );
    if (updated.length > 0) {
      await writeAudit({
        action: AUDIT_ACTION.report_delivered,
        caseId: id,
        summary: 'Report delivered to the work provider — case marked Done',
        after: { status: 'done', signal: 'manual' },
        actor: actorFromClaims(claims),
      });
    }
    return { status: 200, jsonBody: { updated: updated.length > 0 } };
  }),
});

/* ============================================================
   TKT-096 Phase D — GET /api/completed/cases
   The Completed/Archive area's data source: terminal cases the queue path
   deliberately excludes (filterQueue/statusToQueue own no terminal — ADR-0008;
   ADR-0023 gives them this separate browse/audit home, NOT a 4th work-queue).
   Scope: eva_submitted (awaiting delivery), done (delivered), box_synced
   (historical rows only). `removed` is deliberately excluded (PII anonymised on
   soft-remove) and `error` stays in the Held queue. Optional ?status=<name>
   filter + ?limit/?offset paging; newest submission first.
   ============================================================ */
const COMPLETED_STATUSES = ['eva_submitted', 'done', 'box_synced'] as const;
app.http('completedCases', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'completed/cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const statusFilter = (req.query.get('status') ?? '').trim();
    const wanted = COMPLETED_STATUSES.filter(
      (s) => !statusFilter || s === statusFilter,
    );
    if (wanted.length === 0) return { status: 200, jsonBody: [] };
    const codes = wanted.map((s) => statusToInt(s));
    const limit = Math.min(Math.max(parseInt(req.query.get('limit') ?? '200', 10) || 200, 1), 500);
    const offset = Math.max(parseInt(req.query.get('offset') ?? '0', 10) || 0, 0);
    const rows = await query<Row>(
      `${CASE_SELECT}
       WHERE c.status_code = ANY($1::int[])
       ORDER BY c.submitted_at DESC NULLS LAST, c.updated_at DESC
       LIMIT $2 OFFSET $3`,
      [codes, limit, offset],
    );
    const now = nowParam(req);
    return { status: 200, jsonBody: rows.map((r) => rowToCase(r, { now })) };
  }),
});

/* ----------  shared: the windowing clock query param  ---------- */
function nowParam(req: HttpRequest): Date {
  const raw = req.query.get('now');
  if (!raw) return new Date();
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date() : d;
}
