/** case-support — cohesive Data API module. */

import type { HttpRequest } from '@azure/functions';
import { canSubmitCaseToEva, readinessInputForCase, type Case, type Chaser } from '@cs/domain';
import { reviewStateCodec, sourceTypeCodec } from '@cs/domain/codecs';
import { query, tx, type TxQuery } from '../../platform/db/client.js';
import { isPrefillApplicable, prefillImageBasedInspection } from './inspection-prefill.js';
import { runStatusRecompute } from './status-recompute-core.js';
import { versionToken } from '../../platform/http/concurrency.js';
import { manualIntakeEvidenceState } from './manual-intake-operation.js';
import { markEvaSubmittedUsing } from './terminal-transition.js';
import { CASE_SELECT, CASE_SELECT_WITH_ACTIVITY, rowToCase, rowToEvidence, type Row } from '../../shared/mapping/index.js';

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

function chaserStatusName(code: number | null | undefined): Chaser['status'] {
  if (code === 100000001) return 'sent';
  if (code === 100000002) return 'responded';
  if (code === 100000003) return 'overdue';
  return 'drafted'; // 100000000 or null (DB default)
}

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

export async function loadAllCases(now: Date): Promise<Case[]> {
  const rows = await query<Row>(`${CASE_SELECT_WITH_ACTIVITY} ORDER BY c.created_at DESC`);
  return rows.map((r) => rowToCase(r, { now }));
}

export interface VersionedCaseSnapshot {
  value: Case;
  version: string;
}

export async function loadCaseFullSnapshotUsing(
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
  const sourceEvidenceState = await manualIntakeEvidenceState(q, id);
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
  value.sourceEvidencePending = sourceEvidenceState.pending || sourceEvidenceState.archiveFailed;
  value.sourceEvidenceArchiveFailed = sourceEvidenceState.archiveFailed;
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

async function loadCaseFull(id: string, now: Date): Promise<Case | undefined> {
  return loadCaseFullUsing(query, id, now);
}

export async function loadCaseLite(id: string, q: TxQuery = query): Promise<Case | undefined> {
  const rows = await q<Row>(`${CASE_SELECT} WHERE c.id = $1`, [id]);
  return rows[0] ? rowToCase(rows[0]) : undefined;
}

interface MergeClaimantResult {
  filled: boolean;
  conflict: boolean;
}

function comparableClaimant(value: unknown): string {
  return String(value ?? '').trim().toLocaleLowerCase('en-GB');
}

export async function mergeClaimantProvenance(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
  sourceClaimant: string,
  targetClaimant: string,
): Promise<MergeClaimantResult> {
  const sourceValue = sourceClaimant.trim();
  const targetValue = targetClaimant.trim();
  const filled = Boolean(sourceValue) && !targetValue;
  const conflict = Boolean(sourceValue) && Boolean(targetValue) &&
    comparableClaimant(sourceValue) !== comparableClaimant(targetValue);

  if (filled) {
    await q(
      `UPDATE case_
          SET eva_claimant_name = $2, updated_at = now()
        WHERE id = $1
          AND btrim(COALESCE(eva_claimant_name, '')) = ''`,
      [targetCaseId, sourceValue.slice(0, 200)],
    );
  }

  const conflictCode = reviewStateCodec.toInt('conflict') ?? 100000003;
  await q(
    `UPDATE field_level_provenance
        SET case_id = $2,
            name = CONCAT($2::text, ':merged:', id::text),
            source_label = LEFT(
              CASE
                WHEN btrim(COALESCE(source_label, '')) = '' THEN 'Carried over from merged case'
                ELSE source_label || ' — carried over from merged case'
              END,
              400
            ),
            review_state_code = CASE
              WHEN $3::boolean
               AND field_name = 'claimantName'
               AND lower(btrim(COALESCE(value, ''))) = lower(btrim($4))
                THEN $5
              ELSE review_state_code
            END,
            updated_at = now()
      WHERE case_id = $1`,
    [sourceCaseId, targetCaseId, conflict, sourceValue, conflictCode],
  );

  // Earlier rows can carry a claimant value without provenance. Preserve that value on
  // the survivor too; it remains review-required (or conflict) until staff confirms it.
  if (sourceValue) {
    const unknownCode = sourceTypeCodec.toInt('unknown') ?? 100000011;
    const needsReviewCode = reviewStateCodec.toInt('needs_review') ?? 100000001;
    await q(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label, review_state_code,
          source_reference)
       SELECT $1, $2, 'claimantName', $3, $4,
              'Source not recorded — carried over from merged case', $5, $6
       WHERE NOT EXISTS (
         SELECT 1
           FROM field_level_provenance
          WHERE case_id = $2
            AND field_name = 'claimantName'
            AND lower(btrim(COALESCE(value, ''))) = lower(btrim($3))
       )`,
      [
        `${targetCaseId}:claimantName:merged:${sourceCaseId}`,
        targetCaseId,
        sourceValue.slice(0, 200),
        unknownCode,
        conflict ? conflictCode : needsReviewCode,
        `case:${sourceCaseId}`,
      ],
    );
  }

  return { filled, conflict };
}

export async function recomputeStatus(caseId: string, actor?: string): Promise<boolean> {
  // The staff status recompute: the shared writer (TKT-276) with the case-support prefill probe and
  // FOR UPDATE loader. The overview-chase runs on every evaluation inside runStatusRecompute.
  const result = await runStatusRecompute(caseId, {
    actor,
    prefill: async () => {
      // The provider-policy pre-fill owns its own guarded write. Run it before taking the status lock,
      // then re-read all decision inputs inside the transaction below. Calling it while holding the case
      // row would deadlock on its separate pool query.
      const prefillProbe = await loadCaseFull(caseId, new Date());
      if (!prefillProbe) return { found: false };
      if (isPrefillApplicable(prefillProbe)) {
        await prefillImageBasedInspection(caseId, actor);
      }
      return { found: true };
    },
    load: async (q) => {
      // Every terminal/merge writer updates this same case row. Holding it through the re-read,
      // evaluation, and optional update makes the domain terminal lock real at the database boundary
      // instead of relying on an earlier snapshot.
      const full = await loadCaseFullUsing(q, caseId, new Date(), true);
      if (!full) return null;
      return { status: full.status, readinessInput: readinessInputForCase(full) };
    },
  });
  return result.found;
}

export async function markEvaSubmittedIfReady(
  caseId: string,
  actor?: string,
): Promise<boolean> {
  return tx(async (q) => {
    const full = await loadCaseFullUsing(q, caseId, new Date(), true);
    if (
      !full ||
      full.sourceEvidencePending === true ||
      !canSubmitCaseToEva(full)
    ) return false;
    return markEvaSubmittedUsing(q, caseId, actor);
  });
}

export function nowParam(req: HttpRequest): Date {
  const raw = req.query.get('now');
  if (!raw) return new Date();
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

export async function upsertManualProvenance(caseId: string, fieldName: string, value: string): Promise<void> {
  try {
    const staff = sourceTypeCodec.toInt('staff') ?? 100000000;
    const reviewed = reviewStateCodec.toInt('reviewed') ?? 100000002;
    const conflict = reviewStateCodec.toInt('conflict') ?? 100000003;
    await query(
      `UPDATE field_level_provenance
          SET review_state_code = $4, reviewed_by = 'Manual edit (case page)',
              reviewed_at = now(), updated_at = now()
        WHERE case_id = $1 AND field_name = $2 AND review_state_code = $3`,
      [caseId, fieldName, conflict, reviewed],
    );
    const upd = await query<{ id: string }>(
      `UPDATE field_level_provenance
          SET value = $3, source_type_code = $4, source_label = 'Manual edit (case page)',
              review_state_code = $5, updated_at = now()
        WHERE id = (
          SELECT id
          FROM field_level_provenance
          WHERE case_id = $1
            AND field_name = $2
            AND source_type_code = $4
          ORDER BY updated_at DESC, id
          LIMIT 1
        )
        RETURNING id`,
      [caseId, fieldName, value, staff, reviewed],
    );
    if (upd.length === 0) {
      await query(
        `INSERT INTO field_level_provenance
           (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
         VALUES ($1, $2, $3, $4, $5, 'Manual edit (case page)', $6)`,
        [`${caseId}:${fieldName}:staff`, caseId, fieldName, value, staff, reviewed],
      );
    }
  } catch {
    /* provenance is supplementary — never block the edit. */
  }
}

export async function upsertManualProvenanceStrict(
  q: TxQuery,
  caseId: string,
  fieldName: string,
  value: string,
): Promise<void> {
  const staff = sourceTypeCodec.toInt('staff') ?? 100000000;
  const reviewed = reviewStateCodec.toInt('reviewed') ?? 100000002;
  const conflict = reviewStateCodec.toInt('conflict') ?? 100000003;
  await q(
    `UPDATE field_level_provenance
        SET review_state_code = $4, reviewed_by = 'Manual edit (case page)',
            reviewed_at = now(), updated_at = now()
      WHERE case_id = $1 AND field_name = $2 AND review_state_code = $3`,
    [caseId, fieldName, conflict, reviewed],
  );
  const updated = await q<{ id: string }>(
    `UPDATE field_level_provenance
        SET value = $3, source_type_code = $4, source_label = 'Manual edit (case page)',
            review_state_code = $5, updated_at = now()
      WHERE id = (
        SELECT id
        FROM field_level_provenance
        WHERE case_id = $1
          AND field_name = $2
          AND source_type_code = $4
        ORDER BY updated_at DESC, id
        LIMIT 1
      )
      RETURNING id`,
    [caseId, fieldName, value, staff, reviewed],
  );
  if (updated.length === 0) {
    await q(
      `INSERT INTO field_level_provenance
         (name, case_id, field_name, value, source_type_code, source_label, review_state_code)
       VALUES ($1, $2, $3, $4, $5, 'Manual edit (case page)', $6)`,
      [`${caseId}:${fieldName}:staff`, caseId, fieldName, value, staff, reviewed],
    );
  }
}
