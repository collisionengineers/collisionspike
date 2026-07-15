import { AUDIT_ACTION, writeAudit } from '../../shared/audit.js';
import type { TxQuery } from '../../platform/db/client.js';

export const IMAGE_CHASER_TEMPLATE_LABELS = [
  'Image request',
  'Image upload link', // earlier rows; the web app no longer offers this duplicate template
  'Overview photo request',
] as const;

const OUTSTANDING_CHASER_CODES = [100000000, 100000001, 100000003] as const;
const CHASER_STATUS_RESPONDED = 100000002;

export function imageChaserRequiresUploadLink(templateLabel: string): boolean {
  const normalized = templateLabel.trim().toLowerCase();
  return IMAGE_CHASER_TEMPLATE_LABELS.some((label) => label.toLowerCase() === normalized)
    || /\b(?:images?|photos?|photographs?|pictures?|pics?)\b/.test(normalized);
}

/** Link any pre-existing image draft (notably the overview-photo suggestion) to
 * the validated request used when the handler copies it. */
export async function associateOutstandingImageChasersWithFileRequest(
  q: TxQuery,
  caseId: string,
  fileRequestId: string,
  fileRequestUrl: string,
): Promise<number> {
  const rows = await q<{ id: string }>(
    `UPDATE chaser
        SET box_file_request_id = $2,
            box_file_request_url = $3,
            updated_at = now()
      WHERE case_id = $1
        AND status_code = ANY($4::int[])
        AND (
          template_used = ANY($5::text[])
          OR lower(template_used) ~ '(^|[^a-z])(image(s)?|photo(s)?|photograph(s)?|picture(s)?|pic(s)?)([^a-z]|$)'
        )
        AND (
          box_file_request_id IS DISTINCT FROM $2
          OR box_file_request_url IS DISTINCT FROM $3
        )
      RETURNING id`,
    [caseId, fileRequestId, fileRequestUrl, [...OUTSTANDING_CHASER_CODES], [...IMAGE_CHASER_TEMPLATE_LABELS]],
  );
  return rows.length;
}

/** A request upload satisfies image chasers only. Instruction/weekly chasers are
 * left outstanding even though the same case received a photo. */
export async function markImageChasersResponded(
  q: TxQuery,
  caseId: string,
  via: string,
): Promise<number> {
  const rows = await q<{ id: string }>(
    `UPDATE chaser
        SET status_code = $2, updated_at = now()
      WHERE case_id = $1
        AND status_code = ANY($3::int[])
        AND (
          box_file_request_id IS NOT NULL
          OR template_used = ANY($4::text[])
          OR lower(template_used) ~ '(^|[^a-z])(image(s)?|photo(s)?|photograph(s)?|picture(s)?|pic(s)?)([^a-z]|$)'
        )
      RETURNING id`,
    [caseId, CHASER_STATUS_RESPONDED, [...OUTSTANDING_CHASER_CODES], [...IMAGE_CHASER_TEMPLATE_LABELS]],
  );
  if (rows.length) {
    await writeAudit({
      action: AUDIT_ACTION.chaser_sent,
      caseId,
      summary: `Image chaser marked responded — photographs arrived (${via})`,
      after: { chaserIds: rows.map((row) => row.id), via, responseKind: 'image_upload' },
    }, q);
  }
  return rows.length;
}
