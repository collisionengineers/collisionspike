/**
 * merge-routes.harness — deterministic in-memory Postgres journal test double for the
 * merge protocol suites. Owns the fixtures, mutable table state, and the query/txQuery
 * SQL simulation; the test files own the vitest mock wiring and the assertions.
 */
import type { HttpRequest } from '@azure/functions';
import { statusToInt } from '@cs/domain/codecs';

export type Rec = Record<string, unknown>;

export const txSql: string[] = [];
export const txParams: unknown[][] = [];
export const poolSql: string[] = [];
export const cases = new Map<string, Rec>();
export const evidenceRows: Rec[] = [];
export const fileRequestIntents: Rec[] = [];
export const manualOperations: Rec[] = [];
export const staffUploads: Rec[] = [];
export const staffUploadItems: Rec[] = [];
export const archiveOutbox: Rec[] = [];
export const captureSessions: Rec[] = [];
export const captureAssets: Rec[] = [];
export const archiveHoldings: Rec[] = [];
export const flags = { captureSchemaPresent: false };

export const CASE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const CASE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const CASE_C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const EV_ONE = '11111111-1111-4111-8111-111111111111';
export const EV_TARGET = '22222222-2222-4222-8222-222222222222';
export const EV_SOURCE_COPY = '33333333-3333-4333-8333-333333333333';
export const EV_SOURCE_UNIQUE = '44444444-4444-4444-8444-444444444444';
export const EV_SOURCE_SECOND = '55555555-5555-4555-8555-555555555555';

export function caseRow(id: string, overrides: Rec = {}): Rec {
  return {
    id,
    status_code: statusToInt('ingested'),
    duplicate_keys: null,
    provider_display: '',
    provider_principal: 'P1',
    work_provider_id: 'wp-shared',
    ...overrides,
  };
}

export function request(targetCaseId: string, sourceCaseId: string): HttpRequest {
  return {
    params: { tgt: targetCaseId },
    json: async () => ({ sourceCaseId }),
  } as unknown as HttpRequest;
}

export function resetMergeState(): void {
  txSql.length = 0;
  txParams.length = 0;
  poolSql.length = 0;
  cases.clear();
  evidenceRows.length = 0;
  fileRequestIntents.length = 0;
  manualOperations.length = 0;
  staffUploads.length = 0;
  staffUploadItems.length = 0;
  archiveOutbox.length = 0;
  captureSessions.length = 0;
  captureAssets.length = 0;
  flags.captureSchemaPresent = false;
  archiveHoldings.length = 0;
  cases.set(CASE_A, caseRow(CASE_A));
  cases.set(CASE_B, caseRow(CASE_B));
  evidenceRows.push({
    id: EV_ONE,
    case_id: CASE_A,
    sha256: null,
    created_at: '2026-07-11T10:00:00Z',
  });
}

export async function mergeQueryImpl(sql: string, params: unknown[] = []): Promise<unknown> {
  poolSql.push(sql);
  if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) {
    const row = cases.get(params[0] as string);
    return row ? [row] : [];
  }
  if (/FROM case_ c/i.test(sql) && /ORDER BY c\.created_at DESC/i.test(sql)) {
    return [...cases.values()];
  }
  if (/status_recompute_completed_generation = GREATEST/i.test(sql)) {
    return [{
      status_recompute_requested_generation: '1',
      status_recompute_completed_generation: '1',
    }];
  }
  return [];
}

export async function mergeTxQueryImpl(sql: string, params: unknown[] = []): Promise<unknown> {
  txSql.push(sql);
  txParams.push(params);
  if (/to_regclass\('public\.capture_session'\)/i.test(sql)) {
    return [{ capture_session_regclass: flags.captureSchemaPresent ? 'capture_session' : null }];
  }
  if (/SELECT id FROM capture_session/i.test(sql) && /FOR UPDATE/i.test(sql)) {
    return captureSessions
      .filter((row) => row.case_id === params[0])
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((row) => ({ id: row.id }));
  }
  if (/UPDATE capture_session[\s\S]*SET case_id = \$2/i.test(sql)) {
    const ids = (params[2] as string[]) ?? [];
    const moved = captureSessions.filter(
      (row) => row.case_id === params[0] && ids.includes(row.id as string),
    );
    for (const row of moved) row.case_id = params[1];
    return moved.map((row) => ({ id: row.id }));
  }
  if (/SELECT id FROM capture_asset/i.test(sql) && /FOR UPDATE/i.test(sql)) {
    const sessionIds = (params[0] as string[]) ?? [];
    return captureAssets
      .filter((row) => sessionIds.includes(row.session_id as string))
      .sort((left, right) => String(left.id).localeCompare(String(right.id)))
      .map((row) => ({ id: row.id }));
  }
  if (/UPDATE capture_asset[\s\S]*SET evidence_id = \$2/i.test(sql)) {
    const [redundantEvidenceId, survivorEvidenceId, assetIds] = params as [string, string, string[]];
    const repointed = captureAssets.filter(
      (row) => assetIds.includes(row.id as string) && row.evidence_id === redundantEvidenceId,
    );
    for (const row of repointed) row.evidence_id = survivorEvidenceId;
    return repointed.map((row) => ({ id: row.id }));
  }
  if (/SELECT id FROM case_ WHERE id = ANY/i.test(sql) && /FOR UPDATE/i.test(sql)) {
    return ((params[0] as string[]) ?? []).filter((id) => cases.has(id)).map((id) => ({ id }));
  }
  if (/SELECT id, box_folder_id, box_file_request_id, box_file_request_url/i.test(sql)) {
    return ((params[0] as string[]) ?? []).filter((id) => cases.has(id)).map((id) => ({
      id,
      box_folder_id: cases.get(id)?.box_folder_id ?? `folder-${id}`,
      box_file_request_id: cases.get(id)?.box_file_request_id ?? null,
      box_file_request_url: cases.get(id)?.box_file_request_url ?? null,
    }));
  }
  if (/SELECT id,adopted_case_id,resolved_case_id,box_folder_id,canonical_folder_id,normalized_vrm,state,/i.test(sql)) {
    const ids=(params[0] as string[])??[];
    const sourceId=String(params[1]??'');
    const targetId=String(params[2]??'');
    const vrms=(params[3] as string[])??[];
    return archiveHoldings.filter((row)=>ids.includes(row.adopted_case_id as string)
      ||ids.includes(row.resolved_case_id as string)
      ||(row.state!=='adopted'&&!row.resolved_case_id&&!row.adopted_case_id&&(
        ((row.candidate_case_ids as string[]|undefined)??[]).some((id)=>id===sourceId||id===targetId)
        ||vrms.includes(String(row.normalized_vrm??'')))));
  }
  if (/SELECT id,vrm,box_folder_id,box_folder_url FROM case_/i.test(sql)) {
    return ((params[0] as string[])??[]).filter((id)=>cases.has(id)).map((id)=>({
      id,vrm:cases.get(id)?.vrm??null,box_folder_id:cases.get(id)?.box_folder_id??null,box_folder_url:cases.get(id)?.box_folder_url??null,
    }));
  }
  if (/UPDATE archive_holding_folder SET adopted_case_id=/i.test(sql)) {
    for(const holding of archiveHoldings.filter((row)=>row.adopted_case_id===params[0])){
      holding.adopted_case_id=params[1];holding.canonical_folder_id=params[2]||holding.canonical_folder_id;
    }
    return [];
  }
  if (/UPDATE archive_holding_folder SET resolved_case_id=/i.test(sql)) {
    for(const holding of archiveHoldings.filter((row)=>row.resolved_case_id===params[0]&&row.state!=='adopted'))holding.resolved_case_id=params[1];
    return [];
  }
  if (/candidate_case_ids=\(candidate_case_ids-\$1::text\)/i.test(sql)) {
    for(const holding of archiveHoldings.filter((row)=>row.state!=='adopted'
      &&((row.candidate_case_ids as string[]|undefined)??[]).includes(params[0] as string))){
      holding.candidate_case_ids=[...new Set(((holding.candidate_case_ids as string[])??[])
        .map((id)=>id===params[0]?params[1] as string:id))];
    }
    return [];
  }
  if (/UPDATE case_ SET box_folder_id=\$2,box_folder_url=\$3/i.test(sql)) {
    const row=cases.get(params[0] as string);if(row){row.box_folder_id=params[1];row.box_folder_url=params[2];}return [];
  }
  if (/UPDATE case_ SET box_folder_id=NULL,box_folder_url=NULL/i.test(sql)) {
    const row=cases.get(params[0] as string);if(row){row.box_folder_id=null;row.box_folder_url=null;}return [];
  }
  if (/SELECT id, duplicate_keys FROM case_ WHERE id = \$1 FOR UPDATE/i.test(sql)) {
    const row = cases.get(params[0] as string);
    return row ? [{ id: row.id, duplicate_keys: row.duplicate_keys ?? null }] : [];
  }
  if (/SELECT id[\s\S]*provider_archive_completed_generation < provider_archive_requested_generation/i.test(sql)) {
    const ids = (params[0] as string[]) ?? [];
    return ids.filter((id) => {
      const row = cases.get(id);
      return Number(row?.provider_archive_requested_generation ?? 0) >
        Number(row?.provider_archive_completed_generation ?? 0) ||
        row?.on_hold_reason === 'provider_archive_pending';
    }).map((id) => ({ id }));
  }
  if (/SELECT case_id, expected_file_count, evidence_completed_at, side_effects_completed_at/i.test(sql)) {
    const ids = (params[0] as string[]) ?? [];
    return manualOperations.filter((row) => ids.includes(row.case_id as string));
  }
  if (/SELECT EXISTS[\s\S]*deletion_operation_id IS NOT NULL/i.test(sql)) {
    const ids = (params[0] as string[]) ?? [];
    return [{
      deletion_busy: evidenceRows.some((row) =>
        ids.includes(row.case_id as string) && row.deletion_operation_id != null),
      archive_busy: evidenceRows.some((row) => {
        if (!ids.includes(row.case_id as string) || !row.archive_mirror_claim_token) return false;
        const expiry = new Date(String(row.archive_mirror_claim_expires_at ?? '')).getTime();
        return Number.isFinite(expiry) && expiry > Date.now();
      }),
    }];
  }
  if (/UPDATE staff_evidence_upload_item[\s\S]*SET evidence_id = \$2/i.test(sql)) {
    const [fromEvidence, toEvidence] = params as string[];
    for (const item of staffUploadItems.filter((row) => row.evidence_id === fromEvidence)) {
      item.evidence_id = toEvidence;
    }
    return [];
  }
  if (/UPDATE staff_evidence_upload_item[\s\S]*WHERE case_id = \$1/i.test(sql)) {
    for (const item of staffUploadItems.filter((row) => row.case_id === params[0])) {
      item.case_id = params[1];
    }
    return [];
  }
  if (/UPDATE staff_evidence_upload[\s\S]*WHERE case_id = \$1/i.test(sql)) {
    for (const batch of staffUploads.filter((row) => row.case_id === params[0])) {
      batch.case_id = params[1];
    }
    return [];
  }
  if (/UPDATE manual_intake_case_create_operation[\s\S]*WHERE case_id = \$1/i.test(sql)) {
    for (const operation of manualOperations.filter((row) => row.case_id === params[0])) {
      operation.case_id = params[1];
    }
    return [];
  }
  if (/AS "archiveFailed"/i.test(sql)) {
    const caseId = params[0];
    const pending = manualOperations.some((row) =>
      row.case_id === caseId && Number(row.expected_file_count) > 0 && !row.evidence_completed_at);
    const archiveFailed = staffUploads.some((batch) =>
      batch.case_id === caseId && batch.source === 'manual_intake'
      && staffUploadItems.some((item) =>
        item.idempotency_key === batch.idempotency_key
        && item.case_id === caseId
        && archiveOutbox.some((outbox) =>
          outbox.evidence_id === item.evidence_id && outbox.dead_lettered_at)));
    return [{ pending, archiveFailed }];
  }
  if (/UPDATE archive_mirror_outbox o/i.test(sql) && /staff_evidence_upload_item/i.test(sql)) {
    const caseId = params[0];
    const requeued = archiveOutbox.filter((outbox) =>
      outbox.dead_lettered_at
      && staffUploadItems.some((item) =>
        item.evidence_id === outbox.evidence_id && item.case_id === caseId
        && staffUploads.some((batch) =>
          batch.idempotency_key === item.idempotency_key
          && batch.case_id === caseId
          && batch.source === 'manual_intake')));
    for (const row of requeued) row.dead_lettered_at = null;
    return requeued.map((row) => ({ evidence_id: row.evidence_id }));
  }
  if (/SELECT case_id, requested_generation, completed_generation, attempt_count, claim_token/i.test(sql)) {
    const ids = (params[0] as string[]) ?? [];
    return fileRequestIntents.filter((row) => ids.includes(row.case_id as string));
  }
  if (/UPDATE box_file_request_outbox[\s\S]*SET case_id = \$2/i.test(sql)) {
    const row = fileRequestIntents.find((intent) => intent.case_id === params[0]);
    if (row) {
      row.case_id = params[1];
      row.folder_id = params[2];
    }
    return [];
  }
  if (/FROM case_ c/i.test(sql) && /WHERE c.id = \$1/i.test(sql)) {
    const row = cases.get(params[0] as string);
    return row ? [row] : [];
  }
  if (/SELECT id FROM inbound_email/i.test(sql) && /FOR UPDATE/i.test(sql)) return [{ id: 'ie-1' }];
  if (/SELECT id, case_id, sha256, created_at/i.test(sql) && /FROM evidence/i.test(sql) && /FOR UPDATE/i.test(sql)) {
    const ids = (params[0] as string[]) ?? [];
    return evidenceRows.filter((row) => ids.includes(row.case_id as string));
  }
  if (/UPDATE evidence AS survivor/i.test(sql)) {
    const survivor = evidenceRows.find((row) => row.id === params[0]);
    const redundant = evidenceRows.find((row) => row.id === params[1]);
    if (!survivor || !redundant) return [];
    survivor.storage_path ??= redundant.storage_path ?? null;
    survivor.box_file_id ??= redundant.box_file_id ?? null;
    survivor.excluded ??= false;
    return [{
      id: survivor.id,
      case_id: survivor.case_id,
      excluded: survivor.excluded,
      storage_path: survivor.storage_path ?? null,
      box_file_id: survivor.box_file_id ?? null,
    }];
  }
  if (/UPDATE evidence\s+SET case_id/i.test(sql)) {
    const [sourceId, targetId, excludedIds] = params as [string, string, string[]];
    const moved = evidenceRows.filter(
      (row) => row.case_id === sourceId && !excludedIds.includes(row.id as string),
    );
    for (const row of moved) row.case_id = targetId;
    return moved.map((row) => ({ id: row.id }));
  }
  if (/UPDATE inbound_email SET case_id/i.test(sql)) return [{ id: 'ie-1' }];
  if (/SELECT id, work_provider_id FROM case_/i.test(sql)) {
    return ((params[0] as string[]) ?? []).map((id) => ({
      id,
      work_provider_id: cases.get(id)?.work_provider_id ?? null,
    }));
  }
  if (/SELECT display_name FROM work_provider/i.test(sql)) return [{ display_name: 'Provider One' }];
  if (/UPDATE case_ SET work_provider_id/i.test(sql)) {
    const target = cases.get(params[0] as string);
    if (target) target.work_provider_id = params[1];
    return [];
  }
  if (/UPDATE case_ SET eva_work_provider/i.test(sql)) return [];
  if (/SET status_code = \$2, duplicate_keys = \$3/i.test(sql)) {
    const source = cases.get(params[0] as string);
    if (source) {
      source.status_code = params[1];
      source.duplicate_keys = JSON.parse(params[2] as string);
    }
    return [];
  }
  if (/UPDATE case_ SET status_code = \$2/i.test(sql)) {
    const target = cases.get(params[0] as string);
    if (target) target.status_code = params[1];
    return [];
  }
  if (/status_recompute_requested_generation = status_recompute_requested_generation \+ 1/i.test(sql)) {
    return [{ status_recompute_requested_generation: '1' }];
  }
  if (/provider_archive_requested_generation = provider_archive_requested_generation \+ 1/i.test(sql)) {
    return [{ provider_archive_requested_generation: '1' }];
  }
  if (/INSERT INTO archive_mirror_outbox/i.test(sql)) {
    return [{ requested_generation: '1' }];
  }
  return [];
}
