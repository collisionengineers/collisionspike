/** merge-archive-holding — cohesive Data API module. */

import { canonicalizeVrm } from '@cs/domain';
import type { TxQuery } from '../../platform/db/client.js';

export async function reconcileMergeArchiveHolding(
  q: TxQuery,
  sourceCaseId: string,
  targetCaseId: string,
): Promise<string | undefined> {
  const folders = await q<{
    id: string;
    vrm: string | null;
    box_folder_id: string | null;
    box_folder_url: string | null;
  }>(
    `SELECT id,vrm,box_folder_id,box_folder_url FROM case_
      WHERE id=ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId]],
  );
  const source = folders.find((row) => row.id.toLowerCase() === sourceCaseId);
  const target = folders.find((row) => row.id.toLowerCase() === targetCaseId);
  if (!source || !target) return 'Source or target case not found.';
  const sourceVrm = canonicalizeVrm(source.vrm);
  const targetVrm = canonicalizeVrm(target.vrm);
  const mergeVrms = [...new Set([sourceVrm, targetVrm].filter(Boolean))];
  const holdings = await q<{
    id: string;
    adopted_case_id: string | null;
    resolved_case_id: string | null;
    box_folder_id: string;
    canonical_folder_id: string | null;
    normalized_vrm: string;
    state: string;
    claim_active: boolean;
  }>(
    `SELECT id,adopted_case_id,resolved_case_id,box_folder_id,canonical_folder_id,normalized_vrm,state,
        claim_token IS NOT NULL AND claim_expires_at>now() AS claim_active
      FROM archive_holding_folder
      WHERE adopted_case_id=ANY($1::uuid[]) OR resolved_case_id=ANY($1::uuid[])
        OR (state<>'adopted' AND resolved_case_id IS NULL AND adopted_case_id IS NULL
          AND (candidate_case_ids ? $2::text OR candidate_case_ids ? $3::text
          OR normalized_vrm=ANY($4::text[])))
      ORDER BY id FOR UPDATE`,
    [[sourceCaseId, targetCaseId], sourceCaseId, targetCaseId, mergeVrms],
  );
  if (!holdings.length) return undefined;
  if (holdings.some((row) => row.state === 'adopting' && row.claim_active)) {
    return 'A registration image folder is still being filed. Try the merge again when it finishes.';
  }
  const waitingVrms = [...new Set(holdings
    .filter((row) => row.state !== 'adopted')
    .map((row) => row.normalized_vrm))];
  if (waitingVrms.some((vrm) => vrm !== targetVrm)) {
    return 'The survivor uses a different registration from the waiting images. Correct the registration before merging.';
  }
  const sourceFolder = (source.box_folder_id ?? '').trim();
  const targetFolder = (target.box_folder_id ?? '').trim();
  const identities = [
    sourceFolder,
    targetFolder,
    ...holdings.map((row) => (
      row.canonical_folder_id ?? (row.state === 'adopted' ? row.box_folder_id : '') ?? ''
    ).trim()),
  ].filter(Boolean);
  const distinctIdentities = [...new Set(identities)];
  if (distinctIdentities.length > 1) {
    return 'These cases use different archive folders. Reconcile the archive folders before merging.';
  }
  const canonicalFolder = distinctIdentities[0] ?? '';
  const canonicalUrl = target.box_folder_url
    ?? source.box_folder_url
    ?? (canonicalFolder ? `https://app.box.com/folder/${canonicalFolder}` : null);
  if (canonicalFolder && targetFolder !== canonicalFolder) {
    await q(
      'UPDATE case_ SET box_folder_id=$2,box_folder_url=$3,updated_at=now() WHERE id=$1',
      [targetCaseId, canonicalFolder, canonicalUrl],
    );
  }
  await q(
    `UPDATE archive_holding_folder SET adopted_case_id=$2,
      canonical_folder_id=coalesce(nullif($3,''),canonical_folder_id),updated_at=now()
    WHERE adopted_case_id=$1`,
    [sourceCaseId, targetCaseId, canonicalFolder],
  );
  await q(
    `UPDATE archive_holding_folder SET resolved_case_id=$2,updated_at=now()
    WHERE resolved_case_id=$1 AND state<>'adopted'`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `UPDATE archive_holding_folder SET
      candidate_case_ids=(candidate_case_ids-$1::text) ||
        CASE WHEN candidate_case_ids ? $2::text THEN '[]'::jsonb ELSE jsonb_build_array($2::text) END,
      updated_at=now()
    WHERE state<>'adopted' AND candidate_case_ids ? $1::text`,
    [sourceCaseId, targetCaseId],
  );
  await q(
    `WITH desired AS (
      SELECT c.id,EXISTS(SELECT 1 FROM archive_holding_folder h WHERE h.state<>'adopted' AND
        (h.resolved_case_id=c.id OR (h.resolved_case_id IS NULL AND
          (h.candidate_case_ids ? c.id::text OR (h.candidate_case_ids='[]'::jsonb AND
            h.normalized_vrm=regexp_replace(upper(coalesce(c.vrm,'')),'[^A-Z0-9]','','g')))))) AS pending
      FROM case_ c WHERE c.id=ANY($1::uuid[])
    ) UPDATE case_ c SET archive_holding_pending=d.pending,updated_at=now()
      FROM desired d WHERE c.id=d.id AND c.archive_holding_pending IS DISTINCT FROM d.pending`,
    [[sourceCaseId, targetCaseId]],
  );
  await q(
    'UPDATE case_ SET box_folder_id=NULL,box_folder_url=NULL,updated_at=now() WHERE id=$1',
    [sourceCaseId],
  );
  return undefined;
}
