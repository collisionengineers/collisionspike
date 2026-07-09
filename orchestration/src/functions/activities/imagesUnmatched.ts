/**
 * orchestration/src/functions/activities/imagesUnmatched.ts  (TKT-034)
 *
 * The ADR-0015 §5 fallback for an image-bearing email that matched NO case
 * (`decideTriage` action `route_images_unmatched` — TRIAGE_IMAGES_ROUTING_ENABLED):
 *
 *   step 1 (match to an existing case) already ran — the triage-policy context found
 *          nothing, or this activity would never have been scheduled;
 *   step 2 (reg-keyed Box holding folder) — DARK behind BOX_REG_FOLDER_ENABLED
 *          (default off; creating non-Case/PO folders under the Box root is a new
 *          folder-naming semantic the operator must approve). When on + a registration
 *          is present, a folder named with the registration is created under
 *          BOX_FOLDER_ROOT_ID (idempotent server-side: Box 409 name-conflict reuses);
 *   step 3 (flag for manual handling) — ALWAYS: stamp attention_reason
 *          'images_no_match' on the email's triage row so staff see a plain-English
 *          "no matching case" chip instead of a silent nothing.
 *
 * Best-effort throughout (the additive-feature convention): a Box or stamp failure is
 * logged, never thrown into the orchestration.
 */

import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { dataApi } from '../../lib/data-api.js';
import { box } from '../../lib/functions-client.js';

df.app.activity('imagesUnmatched', {
  handler: async (
    input: { internetMessageId?: string; vrm?: string },
    ctx,
  ): Promise<{ stamped: boolean; boxFolderId?: string; boxSkipped?: string }> => {
    const internetMessageId = (input.internetMessageId ?? '').trim();
    const vrm = (input.vrm ?? '').trim().toUpperCase().replace(/\s+/g, '');

    // Step 3 — the always-on visible flag.
    let stamped = false;
    if (internetMessageId) {
      try {
        const res = await dataApi.markInboundAttention({
          sourceMessageId: internetMessageId,
          reason: 'images_no_match',
        });
        stamped = res.stamped;
      } catch (e) {
        ctx.warn(`[imagesUnmatched] attention stamp failed (best-effort): ${String(e)}`);
      }
    }

    // Step 2 — the DARK reg-keyed Box holding folder.
    let boxFolderId: string | undefined;
    let boxSkipped: string | undefined;
    if (!gates.boxRegFolder()) {
      boxSkipped = 'reg_folder_gate_off';
    } else if (!gates.boxApi()) {
      boxSkipped = 'box_gate_off';
    } else if (!vrm) {
      boxSkipped = 'no_registration';
    } else if (!gates.boxFolderRootId()) {
      boxSkipped = 'no_root_id';
    } else {
      try {
        const folder = await box.createFolder(vrm, gates.boxFolderRootId());
        boxFolderId = folder.id;
      } catch (e) {
        boxSkipped = 'create_failed';
        ctx.warn(`[imagesUnmatched] reg-keyed Box folder create failed (best-effort): ${String(e)}`);
      }
    }

    ctx.log(JSON.stringify({ evt: 'imagesUnmatched', stamped, boxFolderId, boxSkipped, vrm: vrm || undefined }));
    return { stamped, ...(boxFolderId ? { boxFolderId } : {}), ...(boxSkipped ? { boxSkipped } : {}) };
  },
});
