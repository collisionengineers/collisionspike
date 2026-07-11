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
  CreateCaseParams,
  FullCreateCaseParams,
  EVA_FIELD_ORDER,
  normaliseEvaEdit,
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
  type EvaField,
  type EvaFields,
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
import { query, tx, type TxQuery } from '../lib/db.js';
import {
  acquireCaseMutationLocks,
  lockCaseForMutation,
  orderedCaseMutationIds,
} from '../lib/case-mutation-locks.js';
import { isPrefillApplicable, prefillImageBasedInspection } from '../lib/inspection-prefill.js';
import { maybeSuggestOverviewChase } from '../lib/overview-chase.js';
import {
  acknowledgeStatusRecompute,
  requestStatusRecompute,
} from '../lib/status-recompute.js';
import { casePoFloor, mintCasePo } from '../lib/case-po.js';
import { isUniqueViolation } from './internal.js';
import { ifMatch, versionToken } from '../lib/concurrency.js';
import { AUDIT_ACTION, actorFromClaims, writeAudit } from '../lib/audit.js';
import { markCaseDoneUsing, markEvaSubmittedUsing } from '../lib/terminal-transition.js';
import { gates } from '../lib/gates.js';
import { listBoxFolderNames } from '../lib/functions-client.js';
import {
  processBoxFileRequestIntent,
  requestBoxFileRequestIntent,
} from '../lib/box-file-request-outbox.js';
import {
  requestArchiveMirrorIfEligible,
  type ArchiveMirrorCandidate,
} from '../lib/archive-mirror-outbox.js';
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

/** Load a single case_ row + its expanded children through one query surface. */
interface VersionedCaseSnapshot {
  value: Case;
  version: string;
}

async function loadCaseFullSnapshotUsing(
  q: TxQuery,
  id: string,
  now: Date,
  lockCase = false,
): Promise<VersionedCaseSnapshot | undefined> {
  const rows = await q<Row>(
    `${CASE_SELECT} WHERE c.id = $1${lockCase ? ' FOR UPDATE OF c' : ''}`,
    [id],
  );
  const rec = rows[0];
  if (!rec) return undefined;
  const prov = await q<Row>('SELECT * FROM field_level_provenance WHERE case_id = $1', [id]);
  const ev = await q<Row>(
    'SELECT * FROM evidence WHERE case_id = $1 ORDER BY sequence_index NULLS LAST, created_at',
    [id],
  );
  const notes = await q<Row>('SELECT * FROM note WHERE case_id = $1 ORDER BY occurred_at', [id]);
  const chasers = await q<Row>('SELECT * FROM chaser WHERE case_id = $1 ORDER BY created_at', [id]);
  const value = rowToCase(rec, {
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
  return { value, version: versionToken(rec.updated_at) };
}

async function loadCaseFullUsing(
  q: TxQuery,
  id: string,
  now: Date,
  lockCase = false,
): Promise<Case | undefined> {
  return (await loadCaseFullSnapshotUsing(q, id, now, lockCase))?.value;
}

/** Load a full case outside an existing transaction. */
async function loadCaseFull(id: string, now: Date): Promise<Case | undefined> {
  return loadCaseFullUsing(query, id, now);
}

/** Light Case (row only, no children) — for merge/twin scoping checks + aggregates. */
async function loadCaseLite(id: string, q: TxQuery = query): Promise<Case | undefined> {
  const rows = await q<Row>(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? rowToCase(rows[0]) : undefined;
}

/**
 * Recompute a case's workflow status via the shared @cs/domain guard over its
 * current persisted fields + evidence; persist + audit only when it changes
 * (the guard self-enforces the terminal-lock). Returns whether a case was evaluated.
 *
 * TKT-109/129: the evaluation seam first applies the provider-policy inspection
 * pre-fill (always_image_based providers auto-complete "Image Based Assessment",
 * fill-if-empty, audited) so an image-led provider's case is never held Not Ready
 * on a blank inspection field a policy already answers.
 */
export async function recomputeStatus(caseId: string, actor?: string): Promise<boolean> {
  // The provider-policy pre-fill owns its own guarded write. Run it before taking
  // the status lock, then re-read all decision inputs inside the transaction below.
  // Calling it while holding the case row would deadlock on its separate pool query.
  const prefillProbe = await loadCaseFull(caseId, new Date());
  if (!prefillProbe) return false;
  if (isPrefillApplicable(prefillProbe)) {
    await prefillImageBasedInspection(caseId, actor);
  }

  const next = await tx(async (q) => {
    // Every terminal/merge writer updates this same case row. Holding it through
    // the re-read, evaluation, and optional update makes the domain terminal lock
    // real at the database boundary instead of relying on an earlier snapshot.
    const full = await loadCaseFullUsing(q, caseId, new Date(), true);
    if (!full) return null;
    const input: StatusEvaluationInput = {
      status: full.status,
      evaFields: full.evaFields,
      evidence: full.evidence,
      instructionCount: full.evidence.filter((e) => e.kind === 'instruction').length,
      hasIdentity:
        full.vrm.trim().length > 0 ||
        full.providerCode.trim().length > 0 ||
        full.evaFields.claimantName.value.trim().length > 0,
      // TKT-141 retired-lock: this value was re-read while the case row was locked.
      mergedInto: full.mergedInto,
    };
    const evaluated = statusForReviewCase(input);
    if (evaluated !== full.status) {
      await q('UPDATE case_ SET status_code = $2, updated_at = now() WHERE id = $1', [
        caseId,
        statusToInt(evaluated),
      ]);
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId,
        summary: `Status ${full.status} -> ${evaluated}`,
        before: { status: full.status },
        after: { status: evaluated },
        ...(actor ? { actor } : {}),
      }, q);
    }
    return evaluated;
  });
  if (!next) return false;
  // TKT-148: runs on EVERY evaluation (changed or not — a merge can add photos while
  // the status stays missing_images). It independently locks/rechecks the current
  // case state immediately before minting, so the post-commit gap is safe.
  await maybeSuggestOverviewChase(caseId, next, actor);
  return true;
}

/* ----------  Durable case-page EVA-field edits (work-todo-spike: casepage)  ---------- */

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
    const snapshot = await loadCaseFullSnapshotUsing(query, id, new Date());
    if (!snapshot) return { status: 404, jsonBody: { error: 'not found' } };
    return {
      status: 200,
      jsonBody: { ...snapshot.value, version: snapshot.version },
      headers: { ETag: `"${snapshot.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
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
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
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
    let attemptedCasePo: string | undefined;
    let outcome:
      | { kind: 'response'; response: { status: number; jsonBody: unknown } }
      | { kind: 'unchanged'; snapshot: VersionedCaseSnapshot }
      | {
          kind: 'changed';
          changedEvaFields: Array<{ key: EvaFieldKey; value: string }>;
          statusGeneration: number;
        };
    try {
      outcome = await tx(async (q) => {
        const snapshot = await loadCaseFullSnapshotUsing(q, id, new Date(), true);
        if (!snapshot) {
          return { kind: 'response' as const, response: { status: 404, jsonBody: { error: 'not found' } } };
        }
        const expected = ifMatch(req);
        if (expected && expected !== snapshot.version) {
          return {
            kind: 'response' as const,
            response: { status: 409, jsonBody: { error: 'stale', currentVersion: snapshot.version } },
          };
        }
        const existing = snapshot.value;
        const sets: string[] = [];
        const vals: unknown[] = [];
        const before: Record<string, unknown> = {};
        const after: Record<string, unknown> = {};
        const changedEvaFields: Array<{ key: EvaFieldKey; value: string }> = [];

        if (body.vrm !== undefined) {
          const raw = String(body.vrm ?? '').trim();
          const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
          const newVrm = raw ? extractVrm(raw) || cleaned : '';
          if (newVrm !== existing.vrm) {
            sets.push(`vrm = $${vals.length + 1}`);
            vals.push(newVrm);
            before.vrm = existing.vrm;
            after.vrm = newVrm;
          }
        }

        let inspectionAddressChanged = false;
        if (body.evaFields && typeof body.evaFields === 'object') {
          for (const [k, rawVal] of Object.entries(body.evaFields)) {
            if (rawVal === undefined || !(k in EVA_COLUMN_BY_KEY)) continue;
            const key = k as EvaFieldKey;
            const norm = normaliseEvaEdit(key, String(rawVal ?? ''));
            if ('error' in norm) {
              return { kind: 'response' as const, response: { status: 400, jsonBody: { error: norm.error } } };
            }
            const oldVal = existing.evaFields[key]?.value ?? '';
            if (norm.value === oldVal) continue;
            sets.push(`${EVA_COLUMN_BY_KEY[key]} = $${vals.length + 1}`);
            vals.push(norm.value);
            before[key] = oldVal;
            after[key] = norm.value;
            changedEvaFields.push({ key, value: norm.value });
            if (key === 'inspectionAddress') inspectionAddressChanged = true;
          }
        }
        if (inspectionAddressChanged) sets.push('inspection_decision_code = NULL');

        if (body.casePo !== undefined) {
          const raw = String(body.casePo ?? '').trim();
          const normalized = raw ? normalizeCasePo(raw) : '';
          if (normalized && !CASE_PO_SHAPE_RE.test(normalized)) {
            return {
              kind: 'response' as const,
              response: { status: 400, jsonBody: { error: `casePo '${raw}' is not Case/PO-shaped` } },
            };
          }
          const oldPo = (existing.casePo ?? '').toUpperCase();
          if (normalized !== oldPo) {
            attemptedCasePo = normalized || undefined;
            sets.push(`case_po = $${vals.length + 1}`);
            vals.push(normalized || null);
            before.casePo = oldPo || '(none)';
            after.casePo = normalized || '(cleared)';
          }
        }

        if (body.caseType !== undefined) {
          const rawType = String(body.caseType ?? '').trim();
          const validName = rawType === '' || caseTypeCodec.toInt(rawType as never) != null;
          if (!validName) {
            return {
              kind: 'response' as const,
              response: {
                status: 400,
                jsonBody: { error: `caseType must be one of ${caseTypeCodec.names().join(', ')}` },
              },
            };
          }
          const newCode = rawType === '' || rawType === 'standard'
            ? null
            : caseTypeCodec.toInt(rawType as never)!;
          const oldCode = caseTypeCodec.toInt(existing.caseType as never) ?? null;
          if (newCode !== oldCode) {
            sets.push(`case_type_code = $${vals.length + 1}`);
            vals.push(newCode);
            before.caseType = existing.caseType ?? 'standard';
            after.caseType = rawType || 'standard';
          }
        }

        if (sets.length === 0) return { kind: 'unchanged' as const, snapshot };
        vals.push(id);
        await q(`UPDATE case_ SET ${sets.join(', ')}, updated_at = now() WHERE id = $${vals.length}`, vals);
        await writeAudit({
          action: AUDIT_ACTION.status_changed,
          caseId: id,
          summary: `Case edited: ${Object.keys(after).join(', ')}`,
          before,
          after,
          ...(actor ? { actor } : {}),
        }, q);
        const statusGeneration = await requestStatusRecompute(q, id);
        return { kind: 'changed' as const, changedEvaFields, statusGeneration };
      });
    } catch (e) {
      if (isUniqueViolation(e) && attemptedCasePo) {
        const holder = await query<{ id: string; vrm: string | null }>(
          'SELECT id, vrm FROM case_ WHERE upper(case_po) = $1 AND id <> $2',
          [attemptedCasePo.toUpperCase(), id],
        );
        return {
          status: 409,
          jsonBody: {
            error: 'case_po_in_use',
            message: `Case/PO ${attemptedCasePo} is already assigned to another case.`,
            conflictCaseId: holder[0]?.id ?? null,
            conflictVrm: holder[0]?.vrm ?? null,
          },
        };
      }
      throw e;
    }

    if (outcome.kind === 'response') return outcome.response;
    if (outcome.kind === 'unchanged') {
      return {
        status: 200,
        jsonBody: { ...outcome.snapshot.value, version: outcome.snapshot.version },
      };
    }
    for (const field of outcome.changedEvaFields) {
      await upsertManualProvenance(id, field.key, field.value);
    }
    try {
      const evaluated = await recomputeStatus(id, actor);
      if (!evaluated) throw new Error('case was not available for readiness evaluation');
      await acknowledgeStatusRecompute(query, id, outcome.statusGeneration);
    } catch (error) {
      ctx.warn(
        `[patch-case] readiness recompute remains pending for ${id} ` +
          `(generation ${outcome.statusGeneration}): ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    const updated = await loadCaseFullSnapshotUsing(query, id, new Date());
    return updated
      ? { status: 200, jsonBody: { ...updated.value, version: updated.version } }
      : { status: 404, jsonBody: { error: 'not found' } };
  }),
});

/* ============================================================
   2 — POST /api/cases   (manual-intake write path)
   ============================================================ */

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept either the established, complete Manual Intake DTO or the strict minimal
 * assistant create_case proposal. The minimal form is expanded into the same DTO
 * before any status evaluation or persistence touches evaFields.
 */
export function normalizeCreateCaseInput(raw: unknown): CreateCaseInput | undefined {
  if (!isObjectRecord(raw)) return undefined;

  // A body claiming either full-contract discriminator must satisfy the full contract;
  // do not reinterpret a malformed Manual Intake body as an assistant proposal.
  if ('evaFields' in raw || 'status' in raw) {
    const full = FullCreateCaseParams.safeParse(raw);
    if (!full.success) return undefined;
    return {
      ...full.data,
      sourceLabel: full.data.sourceLabel?.trim() || 'Manual intake',
    } as CreateCaseInput;
  }

  const parsed = CreateCaseParams.safeParse(raw);
  if (!parsed.success) return undefined;
  const vrm = canonicalizeVrm(parsed.data.vrm);
  if (!vrm) return undefined;
  const claimantName = parsed.data.claimantName?.trim() ?? '';
  const evaFieldsRecord = {} as Record<EvaFieldKey, EvaField>;
  for (const desc of EVA_FIELD_ORDER) {
    const fieldValue = desc.key === 'claimantName' ? claimantName : '';
    const supplied = fieldValue.length > 0;
    evaFieldsRecord[desc.key] = {
      value: fieldValue,
      provenance: supplied
        ? { sourceType: 'staff', sourceLabel: 'Confirmed by staff' }
        : { sourceType: 'manual_upload', sourceLabel: 'Not supplied' },
      reviewState: supplied ? 'reviewed' : 'needs_review',
    };
  }
  const evaFields = evaFieldsRecord as unknown as EvaFields;
  const providerCode = parsed.data.providerCode?.trim().toUpperCase();
  return {
    evaFields,
    vrm,
    ...(providerCode ? { providerCode } : {}),
    status: 'ingested',
    sourceLabel: 'Staff-confirmed case creation',
    writeProvenance: true,
  };
}

app.http('createCase', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req, _ctx, claims) => {
    const raw = await req.json().catch(() => undefined);
    let input = normalizeCreateCaseInput(raw);
    if (!input) return { status: 400, jsonBody: { error: 'invalid case create payload' } };
    const actor = actorFromClaims(claims);

    // Resolve a supplied principal before readiness evaluation or Case/PO minting.
    // A syntactically valid typo is not a provider and must never open a numbering series.
    const pcode = (input.providerCode ?? '').trim().toUpperCase();
    let providerRow: { id: string; display_name: string } | undefined;
    if (pcode) {
      const providers = await query<{ id: string; display_name: string }>(
        `SELECT id, display_name
           FROM work_provider
          WHERE upper(principal_code) = $1
          LIMIT 1`,
        [pcode],
      );
      providerRow = providers[0];
      if (!providerRow) {
        return { status: 400, jsonBody: { error: 'unknown provider principal code' } };
      }
      if (!input.evaFields.workProvider.value.trim()) {
        input = {
          ...input,
          provider: input.provider?.trim() || providerRow.display_name,
          providerCode: pcode,
          evaFields: {
            ...input.evaFields,
            workProvider: {
              value: providerRow.display_name,
              provenance: { sourceType: 'corpus', sourceLabel: 'Matched provider principal' },
              reviewState: 'reviewed',
            },
          },
        };
      }
    }

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
    if (providerRow) add('work_provider_id', providerRow.id);
    // Normalise explicit references to canonical UPPER (+ trim). If the client omits
    // casePo but supplies a valid principal, the API allocates under the same
    // per-(principal,year) advisory lock used by automated intake.
    const suppliedCasePo = (input.casePo ?? '').trim().toUpperCase();
    const principalForAutoMint = !suppliedCasePo ? pcode.toUpperCase() : '';
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
       GET /api/cases?case_po=                  (openCasePoMatches — TKT-068 attach-by-Case/PO)
   ============================================================ */
app.http('openVrmTwins', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'cases',
  handler: withRole('CollisionSpike.User', async (req) => {
    const exclude = req.query.get('exclude') ?? undefined;

    // Case/PO branch: an EXACT, unique handle (uq_case_case_po). The assistant attach flow uses
    // this when a handler names the case by its Case/PO ("add these to CCPY26050") and no
    // registration is present — so the confirm card can resolve the target without a manual
    // registration lookup. Same non-terminal filter as the VRM path (never a removed/finalised
    // case). Case-insensitive match on the stored code.
    const casePo = (req.query.get('case_po') ?? '').trim();
    if (casePo) {
      const rows = await query<Row>(`${CASE_SELECT} WHERE upper(c.case_po) = $1`, [
        casePo.toUpperCase(),
      ]);
      const matches = rows
        .map((r) => rowToCase(r))
        .filter((c) => !TWIN_TERMINAL.has(c.status) && c.id !== exclude);
      return { status: 200, jsonBody: matches };
    }

    const vrm = canonicalizeVrm(req.query.get('vrm') ?? '');
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
    if (typeof body.onHold !== 'boolean') {
      return { status: 400, jsonBody: { error: 'onHold must be a boolean' } };
    }
    const actor = actorFromClaims(claims);
    const outcome = await tx(async (q) => {
      const current = await q<Row>(
        'SELECT updated_at FROM case_ WHERE id = $1 FOR UPDATE',
        [id],
      );
      if (!current[0]) return { kind: 'missing' as const };
      const currentVersion = versionToken(current[0].updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const updated = await q<Row>(
        'UPDATE case_ SET on_hold = $2, updated_at = now() WHERE id = $1 RETURNING updated_at',
        [id, body.onHold],
      );
      await writeAudit({
        action: AUDIT_ACTION.status_changed,
        caseId: id,
        summary: body.onHold ? 'Case put on hold' : 'Case taken off hold',
        after: { onHold: body.onHold },
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

    const actor = actorFromClaims(claims);
    const channelLabel = channel === 'whatsapp' ? 'WhatsApp' : 'email';
    // chaser.name = the queue summary (varchar(400)); mirrors the SPA's "Chased via …"
    // wording so the persisted summary reads identically to the old client-state note.
    const summary = `Chased via ${channelLabel} — ${templateLabel}.`.slice(0, 400);
    // The chase target: the work provider (the party chased for missing items) — the
    // read's default targetType. target_name = the provider display name (varchar(200)).
    const outcome = await tx(async (q) => {
      const locked = await q<Row>(
        `${CASE_SELECT} WHERE c.id = $1 FOR UPDATE OF c`,
        [id],
      );
      if (!locked[0]) return { kind: 'missing' as const };
      const existing = rowToCase(locked[0]);
      if (isRetiredMerged(existing)) return { kind: 'retired' as const };
      const currentVersion = versionToken(locked[0].updated_at);
      const expected = ifMatch(req);
      if (expected != null && expected !== '' && expected !== currentVersion) {
        return { kind: 'stale' as const, currentVersion };
      }
      const rows = await q<Row>(
        `INSERT INTO chaser
           (name, case_id, target_type_code, target_name, channel_code, template_used, drafted_at)
         VALUES ($1, $2, $3, $4, $5, $6, now())
         RETURNING *`,
        [
          summary,
          id,
          100000002,
          existing.provider.slice(0, 200),
          channel === 'whatsapp' ? 100000001 : 100000000,
          templateLabel,
        ],
      );
      const created = rows[0];
      if (!created) throw new Error('chaser insert returned no row');
      if (note) {
        await q(
          'INSERT INTO note (name, case_id, author, text, occurred_at) VALUES ($1, $2, $3, $4, now())',
          ['Chase note', id, actor ?? 'Staff', note],
        );
      }
      const updated = await q<Row>(
        'UPDATE case_ SET updated_at = now() WHERE id = $1 RETURNING updated_at',
        [id],
      );
      await writeAudit({
        action: AUDIT_ACTION.chaser_sent,
        caseId: id,
        summary: `Chase logged (${channel} · ${templateLabel})`,
        after: { chaserId: created.id, channel, templateLabel, ...(note ? { note } : {}) },
        ...(actor ? { actor } : {}),
      }, q);
      return {
        kind: 'created' as const,
        value: rowToChaser(created),
        version: versionToken(updated[0]?.updated_at),
      };
    });
    if (outcome.kind === 'missing') return { status: 404, jsonBody: { error: 'not found' } };
    if (outcome.kind === 'retired') return { status: 409, jsonBody: { error: 'case has been merged' } };
    if (outcome.kind === 'stale') {
      return { status: 409, jsonBody: { error: 'stale', currentVersion: outcome.currentVersion } };
    }
    return {
      status: 201,
      jsonBody: outcome.value,
      headers: { ETag: `"${outcome.version}"`, 'Access-Control-Expose-Headers': 'ETag' },
    };
  }),
});

/* ============================================================
   6 — GET /api/cases/{id}/merge-candidates
   ============================================================ */
export function mergeProvidersCompatible(
  leftProviderCode: string | undefined,
  rightProviderCode: string | undefined,
): boolean {
  const left = (leftProviderCode ?? '').trim().toUpperCase();
  const right = (rightProviderCode ?? '').trim().toUpperCase();
  // Match the merge transaction's ADR-0010 guard exactly: only two known,
  // different providers are incompatible. A providerless image-led case must
  // remain reachable so the merge can preserve the resolved provider from its twin.
  return !left || !right || left === right;
}

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
          mergeProvidersCompatible(cc.providerCode, self.providerCode),
      );
    return { status: 200, jsonBody: candidates };
  }),
});

const MERGE_SHA256_RE = /^[0-9a-f]{64}$/i;
const MERGE_UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

interface MergeEvidenceLockRow extends Record<string, unknown> {
  id: string;
  case_id: string;
  sha256: string | null;
  created_at: Date | string;
  archive_mirror_claim_token: string | null;
  archive_mirror_claim_expires_at: Date | string | null;
}

/**
 * Move the source evidence that is not already present on the target by byte hash.
 * For a target collision, the target row remains the survivor: missing byte/source
 * provenance and missing review metadata are absorbed onto it, while the redundant
 * source row stays on the soon-to-be-retired case (the staff DB role cannot DELETE).
 */
async function mergeEvidenceRows(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<{ movedEvidence: number; collidingEvidence: number; archiveBusy?: boolean }> {
  const locked = await q<MergeEvidenceLockRow>(
    `SELECT id, case_id, sha256, created_at,
            archive_mirror_claim_token, archive_mirror_claim_expires_at
       FROM evidence
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id, created_at, id
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const now = Date.now();
  if (locked.some((row) => {
    if (!row.archive_mirror_claim_token || !row.archive_mirror_claim_expires_at) return false;
    const expires = new Date(row.archive_mirror_claim_expires_at).getTime();
    return Number.isFinite(expires) && expires > now;
  })) {
    return { movedEvidence: 0, collidingEvidence: 0, archiveBusy: true };
  }
  const canonicalSha = (value: string | null): string | null => {
    const trimmed = (value ?? '').trim();
    return MERGE_SHA256_RE.test(trimmed) ? trimmed.toLowerCase() : null;
  };

  // The oldest target row is the deterministic survivor if historic target-side
  // duplicates exist. The source is never allowed to replace a target-owned row.
  const survivorBySha = new Map<string, string>();
  for (const row of locked) {
    if (row.case_id.toLowerCase() !== targetCaseId) continue;
    const sha = canonicalSha(row.sha256);
    if (sha && !survivorBySha.has(sha)) survivorBySha.set(sha, row.id);
  }

  const collisionSourceIds: string[] = [];
  for (const row of locked) {
    if (row.case_id.toLowerCase() !== sourceCaseId) continue;
    const sha = canonicalSha(row.sha256);
    if (!sha) continue;
    const survivorId = survivorBySha.get(sha);
    if (!survivorId) {
      // No target copy: the oldest source row becomes the one copy that moves.
      // Later source twins with this hash are coalesced into it and stay retired.
      survivorBySha.set(sha, row.id);
      continue;
    }
    collisionSourceIds.push(row.id);

    // Fill only information the target survivor does not already own. Explicit
    // target-side staff/provider/cleanup decisions always win over source metadata.
    const survivors = await q<ArchiveMirrorCandidate>(
      `UPDATE evidence AS survivor
          SET storage_path = COALESCE(survivor.storage_path, redundant.storage_path),
              source_message_id = COALESCE(survivor.source_message_id, redundant.source_message_id),
              box_file_id = COALESCE(survivor.box_file_id, redundant.box_file_id),
              box_file_url = COALESCE(survivor.box_file_url, redundant.box_file_url),
              content_type = COALESCE(NULLIF(btrim(survivor.content_type), ''), redundant.content_type),
              size_bytes = COALESCE(survivor.size_bytes, redundant.size_bytes),
              source_label = COALESCE(NULLIF(btrim(survivor.source_label), ''), redundant.source_label),
              sequence_index = COALESCE(survivor.sequence_index, redundant.sequence_index),
              image_role_code = CASE
                WHEN survivor.image_role_source IS NULL
                 AND survivor.image_role_code = 100000003
                 AND redundant.image_role_code <> 100000003
                  THEN redundant.image_role_code
                ELSE survivor.image_role_code
              END,
              image_role_source = CASE
                WHEN survivor.image_role_source IS NULL
                 AND survivor.image_role_code = 100000003
                 AND redundant.image_role_code <> 100000003
                  THEN redundant.image_role_source
                ELSE survivor.image_role_source
              END,
              registration_visible = CASE
                WHEN survivor.registration_visible_source IS NULL
                 AND survivor.registration_visible IS NULL
                 AND redundant.registration_visible IS NOT NULL
                  THEN redundant.registration_visible
                ELSE survivor.registration_visible
              END,
              registration_visible_source = CASE
                WHEN survivor.registration_visible_source IS NULL
                 AND survivor.registration_visible IS NULL
                 AND redundant.registration_visible IS NOT NULL
                  THEN redundant.registration_visible_source
                ELSE survivor.registration_visible_source
              END,
              accepted_for_eva = CASE
                WHEN survivor.accepted_for_eva_source IS NULL
                 AND redundant.accepted_for_eva_source IS NOT NULL
                  THEN redundant.accepted_for_eva
                ELSE survivor.accepted_for_eva
              END,
              accepted_for_eva_source = COALESCE(
                survivor.accepted_for_eva_source,
                redundant.accepted_for_eva_source
              ),
              excluded = CASE
                WHEN survivor.exclusion_decision_source IS NULL
                 AND redundant.exclusion_decision_source IS NOT NULL
                 AND (
                   survivor.archive_mirror_claim_token IS NULL
                   OR survivor.archive_mirror_claim_expires_at <= now()
                 )
                  THEN redundant.excluded
                ELSE survivor.excluded
              END,
              exclusion_reason = CASE
                WHEN survivor.exclusion_decision_source IS NULL
                 AND redundant.exclusion_decision_source IS NOT NULL
                 AND (
                   survivor.archive_mirror_claim_token IS NULL
                   OR survivor.archive_mirror_claim_expires_at <= now()
                 )
                  THEN redundant.exclusion_reason
                ELSE survivor.exclusion_reason
              END,
              exclusion_decision_source = COALESCE(
                survivor.exclusion_decision_source,
                CASE
                  WHEN survivor.archive_mirror_claim_token IS NULL
                    OR survivor.archive_mirror_claim_expires_at <= now()
                    THEN redundant.exclusion_decision_source
                  ELSE NULL
                END
              ),
              person_reflection = survivor.person_reflection OR redundant.person_reflection,
              reflection_dismissed = survivor.reflection_dismissed OR redundant.reflection_dismissed,
              updated_at = now()
         FROM evidence AS redundant
        WHERE survivor.id = $1
          AND redundant.id = $2
      RETURNING survivor.id,
                survivor.case_id,
                survivor.excluded,
                survivor.storage_path,
                survivor.box_file_id`,
      [survivorId, row.id],
    );
    if (survivors[0]) {
      // A collision may have supplied the survivor's only blob path. Queue that
      // canonical row, then retire any redundant row's pending generation. Both
      // evidence rows are already locked and the case rows were locked first.
      await requestArchiveMirrorIfEligible(q, survivors[0]);
    }
    await q(
      `UPDATE archive_mirror_outbox
          SET completed_generation = requested_generation,
              completed_at = now(),
              updated_at = now()
        WHERE evidence_id = $1
          AND completed_generation < requested_generation`,
      [row.id],
    );
  }

  const moved = await q<Row>(
    `UPDATE evidence
        SET case_id = $2, updated_at = now()
      WHERE case_id = $1
        AND NOT (id = ANY($3::uuid[]))
      RETURNING id`,
    [sourceCaseId, targetCaseId, collisionSourceIds],
  );
  if (moved.length > 0) {
    await q(
      `UPDATE archive_mirror_outbox
          SET case_id = $2, updated_at = now()
        WHERE evidence_id = ANY($1::uuid[])`,
      [moved.map((row) => row.id), targetCaseId],
    );
  }
  return { movedEvidence: moved.length, collidingEvidence: collisionSourceIds.length };
}

/**
 * A File Request is bound to one Box folder, so an already-created or possibly-created
 * source link cannot be silently carried to a different survivor folder. A never-attempted
 * durable intent is safe to transfer; any attempted/ambiguous source blocks the merge.
 */
async function reconcileMergeFileRequestIntent(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const cases = await q<{
    id: string;
    box_folder_id: string | null;
    box_file_request_id: string | null;
    box_file_request_url: string | null;
  }>(
    `SELECT id, box_folder_id, box_file_request_id, box_file_request_url
       FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const source = cases.find((row) => row.id.toLowerCase() === sourceCaseId);
  const target = cases.find((row) => row.id.toLowerCase() === targetCaseId);
  if (!source || !target) return 'Source or target case not found.';
  if ((source.box_file_request_id ?? '').trim() || (source.box_file_request_url ?? '').trim()) {
    return 'The source case already has an image-upload link. Move or close that link before merging.';
  }
  const intents = await q<{
    case_id: string;
    requested_generation: string | number;
    completed_generation: string | number;
    attempt_count: number;
    claim_token: string | null;
  }>(
    `SELECT case_id, requested_generation, completed_generation, attempt_count, claim_token
       FROM box_file_request_outbox
      WHERE case_id = ANY($1::uuid[])
      ORDER BY case_id
      FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const sourceIntent = intents.find((row) => row.case_id.toLowerCase() === sourceCaseId);
  if (!sourceIntent) return undefined;
  const sourcePending = Number(sourceIntent.requested_generation) > Number(sourceIntent.completed_generation);
  if (!sourcePending) {
    return 'The source case has completed image-upload-link work that cannot be transferred safely.';
  }
  if (sourceIntent.attempt_count > 0 || sourceIntent.claim_token) {
    return 'Image-upload link creation may already have started for the source case. Try the merge after it finishes.';
  }
  const targetIntent = intents.find((row) => row.case_id.toLowerCase() === targetCaseId);
  const targetHasPartialLink =
    !!(target.box_file_request_id ?? '').trim() !== !!(target.box_file_request_url ?? '').trim();
  if (targetHasPartialLink) {
    return 'The survivor has an incomplete image-upload-link record. Resolve it before merging.';
  }
  const targetHasLink =
    !!(target.box_file_request_id ?? '').trim() && !!(target.box_file_request_url ?? '').trim();
  if (
    targetIntent &&
    Number(targetIntent.completed_generation) >= Number(targetIntent.requested_generation) &&
    !targetHasLink
  ) {
    return 'The survivor has completed image-upload-link work with no saved link. Resolve it before merging.';
  }
  if (targetIntent || targetHasLink) {
    // The survivor already owns equivalent work. Cancel the never-attempted source
    // generation without deleting history.
    await q(
      `UPDATE box_file_request_outbox
          SET completed_generation = requested_generation,
              completed_at = now(),
              last_error = 'superseded by merge target',
              updated_at = now()
        WHERE case_id = $1`,
      [sourceCaseId],
    );
    return undefined;
  }
  const targetFolder = (target.box_folder_id ?? '').trim();
  if (!targetFolder) {
    return 'The survivor has no archive folder for the pending image-upload link.';
  }
  await q(
    `UPDATE box_file_request_outbox
        SET case_id = $2,
            folder_id = $3,
            next_attempt_at = now(),
            updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId, targetFolder],
  );
  return undefined;
}

/* ============================================================
   7 — POST /api/cases/{tgt}/merge   ({tgt} = target/survivor)
   ============================================================ */
app.http('mergeCases', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{tgt}/merge',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    const targetCaseId = (req.params.tgt ?? '').trim().toLowerCase();
    const body = (await req.json()) as { sourceCaseId?: unknown };
    const sourceCaseId = typeof body.sourceCaseId === 'string'
      ? body.sourceCaseId.trim().toLowerCase()
      : '';
    const actor = actorFromClaims(claims);

    if (!MERGE_UUID_RE.test(sourceCaseId) || !MERGE_UUID_RE.test(targetCaseId)) {
      return { status: 400, jsonBody: { error: 'Case identifiers are invalid.' } };
    }
    if (sourceCaseId === targetCaseId) {
      return { status: 400, jsonBody: { error: 'Cannot merge a case into itself.' } };
    }
    const merged = await tx(async (q) => {
      // Merge and guarded backfill share these namespaced advisory locks. Both callers
      // acquire multiple case ids in the same lexical order before taking row locks,
      // so reverse concurrent merges cannot deadlock.
      await acquireCaseMutationLocks(q, [sourceCaseId, targetCaseId]);
      const orderedIds = orderedCaseMutationIds([sourceCaseId, targetCaseId]);
      const lockedCases = await q<{ id: string }>(
        'SELECT id FROM case_ WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
        [orderedIds],
      );
      if (lockedCases.length !== 2) {
        return { kind: 'error' as const, status: 404, error: 'Source or target case not found.' };
      }

      // Re-read the decision inputs only after both rows are locked. A competing merge
      // may have retired one side while this request waited on the advisory locks.
      const src = await loadCaseLite(sourceCaseId, q);
      const tgt = await loadCaseLite(targetCaseId, q);
      if (!src || !tgt) {
        return { kind: 'error' as const, status: 404, error: 'Source or target case not found.' };
      }
      if (isRetiredMerged(src) || isRetiredMerged(tgt)) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'One of these cases has already been merged. Refresh and try again.',
        };
      }
      // ADR-0010 INVIOLABLE rule 2: NEVER link across different work providers.
      if (src.providerCode && tgt.providerCode && src.providerCode !== tgt.providerCode) {
        return {
          kind: 'error' as const,
          status: 400,
          error: 'Refusing to merge across different work providers.',
        };
      }
      if (TWIN_TERMINAL.has(tgt.status)) {
        return {
          kind: 'error' as const,
          status: 400,
          error: 'Cannot merge into a finalised case.',
        };
      }

      const fileRequestConflict = await reconcileMergeFileRequestIntent(
        q,
        sourceCaseId,
        targetCaseId,
      );
      if (fileRequestConflict) {
        return { kind: 'error' as const, status: 409, error: fileRequestConflict };
      }

      // Lock every source inbound row before touching evidence. Guarded backfill takes
      // the same case advisory lock before its one inbound row lock, so either it commits
      // first and this UPDATE moves the new evidence, or this merge commits first and the
      // queued job follows the verified mergedInto lineage to the survivor.
      await q(
        'SELECT id FROM inbound_email WHERE case_id = $1 ORDER BY id FOR UPDATE',
        [sourceCaseId],
      );

      const { movedEvidence, collidingEvidence, archiveBusy } = await mergeEvidenceRows(
        q,
        sourceCaseId,
        targetCaseId,
      );
      if (archiveBusy) {
        return {
          kind: 'error' as const,
          status: 409,
          error: 'Archive work is still finishing for one of these cases. Try the merge again shortly.',
        };
      }
      const movedEmails = await q<Row>(
        'UPDATE inbound_email SET case_id = $2, updated_at = now() WHERE case_id = $1 RETURNING id',
        [sourceCaseId, targetCaseId],
      );

      // Provider preference (TKT-052): preserve the source's resolved provider when
      // the image-led survivor is still empty. Every associated write stays in this tx.
      const fkRows = await q<Row>(
        'SELECT id, work_provider_id FROM case_ WHERE id = ANY($1::uuid[])',
        [[sourceCaseId, targetCaseId]],
      );
      const srcFk = (fkRows.find((r) => r.id === sourceCaseId)?.work_provider_id as string | null) ?? null;
      const tgtFk = (fkRows.find((r) => r.id === targetCaseId)?.work_provider_id as string | null) ?? null;
      const providerDecision = decideMergeProvider(srcFk, tgtFk);
      let providerFilled = false;
      if (!providerDecision.crossProvider && providerDecision.filledFrom === 'source' && providerDecision.providerId) {
        await q(
          `UPDATE case_ SET work_provider_id = $2, updated_at = now()
            WHERE id = $1 AND work_provider_id IS NULL`,
          [targetCaseId, providerDecision.providerId],
        );
        const wp = await q<Row>('SELECT display_name FROM work_provider WHERE id = $1', [
          providerDecision.providerId,
        ]);
        const displayName = ((wp[0]?.display_name as string | null) ?? '').trim();
        if (displayName) {
          await q(
            `UPDATE case_ SET eva_work_provider = $2, updated_at = now()
              WHERE id = $1 AND (eva_work_provider IS NULL OR eva_work_provider = '')`,
            [targetCaseId, displayName.slice(0, 200)],
          );
        }
        // Provenance remains supplementary. A savepoint is required here: catching a
        // failed Postgres statement without rolling back to one would leave the whole
        // merge transaction aborted and make the later COMMIT fail.
        await q('SAVEPOINT merge_provider_provenance');
        try {
          await q(
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
          );
          await q('RELEASE SAVEPOINT merge_provider_provenance');
        } catch {
          await q('ROLLBACK TO SAVEPOINT merge_provider_provenance');
          await q('RELEASE SAVEPOINT merge_provider_provenance');
        }
        providerFilled = true;
      }

      await q(
        `UPDATE case_
           SET status_code = $2, duplicate_keys = $3, on_hold = false, updated_at = now()
         WHERE id = $1`,
        [sourceCaseId, statusToInt('linked_to_instruction'), JSON.stringify({ mergedInto: targetCaseId })],
      );

      // The merge is the primary mutation. Make readiness recomputation durable in
      // the same transaction so an interrupted post-commit fast path cannot strand
      // the survivor on its pre-merge status.
      const statusGeneration = await requestStatusRecompute(q, targetCaseId);

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
          collidingEvidence,
          movedEmails: movedEmails.length,
          providerFilled,
        },
        ...(actor ? { actor } : {}),
      }, q);

      return {
        kind: 'merged' as const,
        movedEvidence,
        collidingEvidence,
        movedEmails: movedEmails.length,
        providerFilled,
        statusGeneration,
      };
    });

    if (merged.kind === 'error') {
      return { status: merged.status, jsonBody: { error: merged.error } };
    }

    // Fast path only. The generation requested in the merge transaction stays
    // pending unless both evaluation and its monotonic acknowledgement succeed;
    // failure here must not misreport or retry the committed primary mutation.
    try {
      const evaluated = await recomputeStatus(targetCaseId, actor);
      if (!evaluated) throw new Error('target case was not available for readiness evaluation');
      await acknowledgeStatusRecompute(query, targetCaseId, merged.statusGeneration);
    } catch (e) {
      ctx.warn(
        `[merge] readiness recompute remains pending for ${targetCaseId} ` +
          `(generation ${merged.statusGeneration}): ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    const result: MergeCasesResult = { targetCaseId, movedEvidence: merged.movedEvidence };
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
      // Automatic exclusions stay visible in the REVIEW list so staff can recover a false
      // positive. Staff/provider/cleanup/legacy exclusions stay hidden. Every returned excluded
      // row remains acceptedForEva=false and therefore cannot affect readiness/order/export.
      "SELECT * FROM evidence WHERE case_id = $1 AND kind_code = (SELECT code FROM choice_evidence_kind WHERE name = 'image') AND (excluded = false OR exclusion_decision_source = 'classifier' OR person_reflection = true) ORDER BY sequence_index NULLS LAST, created_at",
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
   Persists intent before the bounded remote call. A timer replays any crash/timeout,
   while repeated staff clicks reuse the same pending generation. */
app.http('caseBoxCopyFileRequest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'cases/{id}/box/copy-file-request',
  handler: withRole('CollisionSpike.User', async (req, ctx, claims) => {
    if (!gates.boxApi() || !gates.boxFileRequest()) {
      return { status: 200, jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." } };
    }
    const caseId = (req.params.id ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { status: 'error', message: 'caseId is required' } };
    const templateId = gates.boxFileRequestTemplateId().trim();
    if (!templateId) {
      return {
        status: 200,
        jsonBody: { status: 'gated_off', message: "Image-upload links aren't available yet." },
      };
    }
    const actor = actorFromClaims(claims);
    try {
      const prepared = await tx(async (q) => {
        const lockedCase = await lockCaseForMutation(q, caseId);
        if (lockedCase.kind === 'missing') return { kind: 'missing' as const };
        if (lockedCase.kind === 'retired') {
          return { kind: 'retired' as const, mergedInto: lockedCase.mergedInto };
        }
        const rows = await q<{
          box_folder_id: string | null;
          box_file_request_id: string | null;
          box_file_request_url: string | null;
        }>(
          `SELECT box_folder_id, box_file_request_id, box_file_request_url
             FROM case_
            WHERE id = $1
            FOR UPDATE`,
          [lockedCase.caseId],
        );
        const row = rows[0];
        const folderId = row?.box_folder_id?.trim() ?? '';
        const stampedId = row?.box_file_request_id?.trim() ?? '';
        const stampedUrl = row?.box_file_request_url?.trim() ?? '';
        if (!row || !folderId) {
          return {
            kind: 'folder_not_ready' as const,
          };
        }
        if (stampedId && stampedUrl) {
          return { kind: 'ready' as const, fileRequestUrl: stampedUrl };
        }
        if (stampedId || stampedUrl) {
          return { kind: 'invalid_stamp' as const };
        }
        const intent = await requestBoxFileRequestIntent(
          q,
          lockedCase.caseId,
          folderId,
          templateId,
        );
        if (intent.alreadyCompleted) return { kind: 'invalid_stamp' as const };
        return { kind: 'pending' as const, caseId: lockedCase.caseId };
      });
      if (prepared.kind === 'missing') {
        return { status: 404, jsonBody: { status: 'error', message: 'Case not found.' } };
      }
      if (prepared.kind === 'retired') {
        return {
          status: 409,
          jsonBody: {
            status: 'error',
            message: 'This case has been merged. Open the current case and try again.',
            mergedInto: prepared.mergedInto,
          },
        };
      }
      if (prepared.kind === 'folder_not_ready') {
        return {
          status: 200,
          jsonBody: { status: 'folder_not_ready', message: 'This case has no archive folder yet.' },
        };
      }
      if (prepared.kind === 'ready') {
        return { status: 200, jsonBody: { status: 'ok', data: { fileRequestUrl: prepared.fileRequestUrl } } };
      }
      if (prepared.kind === 'invalid_stamp') throw new Error('case has an incomplete Box File Request stamp');

      const processed = await processBoxFileRequestIntent(prepared.caseId, actor);
      if (processed.kind === 'ok') {
        return {
          status: 200,
          jsonBody: { status: 'ok', data: { fileRequestUrl: processed.fileRequestUrl } },
        };
      }
      if (processed.kind === 'retired') {
        return {
          status: 409,
          jsonBody: {
            status: 'error',
            message: 'This case has been merged. Open the current case and try again.',
            mergedInto: processed.mergedInto,
          },
        };
      }
      return {
        status: 200,
        jsonBody: {
          status: 'error',
          message: 'The image-upload link is still being created. Please try again shortly.',
        },
      };
    } catch (error) {
      ctx.error('[caseBoxCopyFileRequest] failed', error);
      return {
        status: 200,
        jsonBody: {
          status: 'error',
          message: 'The image-upload link could not be created. Please try again.',
        },
      };
    }
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
    const updated = await tx((q) => markEvaSubmittedUsing(q, id, actorFromClaims(claims)));
    // updated:false covers both "already submitted" (benign idempotent no-op)
    // and "not ready yet" — the caller re-reads the case either way.
    return { status: 200, jsonBody: { updated } };
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
    const updated = await tx((q) => markCaseDoneUsing(q, {
      caseId: id,
      signal: 'manual',
      actor: actorFromClaims(claims),
    }));
    return { status: 200, jsonBody: { updated } };
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
