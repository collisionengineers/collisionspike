/** merge-file-request — cohesive Data API module. */

import type { TxQuery } from '../../platform/db/client.js';

export async function reconcileMergeFileRequestIntent(
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
