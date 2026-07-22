/** *
 * Durable activity: the ONE true Box-folder-creation primitive for the intake-engine
 * rebuild. Adapts this app's existing Box facade client
 * (`../../adapters/functions-client.js`'s `box.getFolder`/`box.createFolder`, itself a
 * thin HTTP client onto the box-webhook Function — this file never re-mints Box tokens)
 * to the `BoxFolderClient` shape `@cs/intake-engine`'s `ensureArchiveFolder` guard
 * expects, then calls it.
 *
 * `ensureArchiveFolder` (services/intake-engine/src/adapters/box-test-guard.ts) resolves
 * the pinned test-scope root from tools/box-scope.json's `allowedRoot` and asserts the
 * target parent folder id against it BEFORE either injected client method runs — any
 * mismatch throws immediately, no Box call happens. That is the entire safety property
 * this rebuild wants at every Box-folder-creation call site (replacing three prior,
 * independently-written implementations — see the callers listed below).
 *
 * `ensureArchiveFolderV2Core` is exported (not just the registered activity) so other
 * activities in THIS app can call the guarded logic in-process — a Durable activity is a
 * plain async function; there is no need to nest a second Durable Task Hub round-trip to
 * reuse it. Current callers:
 *   - services/orchestration/src/workflows/archive/case-archive-folder.ts (the Case/PO
 *     archive folder — the intake-time + provider-archive-monitor lever; the direct
 *     replacement for the deleted box-folder-create.ts).
 *   - services/orchestration/src/workflows/archive/finalize-eva-box.ts (the EVA folder
 *     step — the `boxFolderAugment` activity, whose BODY was rewritten to come through
 *     here; it used to create a raw UUID-named folder with NO safety check. The activity
 *     NAME is deliberately unchanged, for the Durable replay reason above).
 *   - services/orchestration/src/workflows/evidence/imagesUnmatched.ts (the
 *     unmatched-images VRM-named folder — replaces a direct, unguarded
 *     `box.createFolder` call; the reservation/claim-token mechanism around it is a
 *     distinct, unrelated concern and stays exactly as it was).
 *   - services/orchestration/src/workflows/mailbox/archive-holding-monitor.ts (the
 *     TKT-034 holding recovery daemon's VRM-named folder — same guarded replacement.
 *     NOTE its parent id is a PERSISTED `root_folder_id` DB column, so the assertion
 *     compares stored history against the compiled-in pinned root).
 */

import * as df from 'durable-functions';
import { ensureArchiveFolder, type BoxFolderClient } from '@cs/intake-engine';
import { box } from '../../adapters/functions-client.js';

export interface EnsureArchiveFolderV2Input {
  /** The archive folder NAME to create/find — already resolved by the caller (e.g. via
   *  `@cs/intake-engine`'s `resolveArchiveFolderName(casePo)`, or a raw VRM for the
   *  unmatched-images lane). This activity never derives a name itself. */
  name: string;
  /** Overrides the pinned root — TEST USE ONLY (mirrors the guard's own option). Real
   *  callers must never set this; omitting it is what makes the pinned-root assertion
   *  meaningful. */
  parentFolderId?: string;
}

export interface EnsureArchiveFolderV2Result {
  id: string;
  name: string;
  /** Surfaced when the injected Box client's create call resolves an exact-name 409 as
   *  an idempotent reuse (the box-webhook facade's contract) rather than a fresh
   *  create — optional because `@cs/intake-engine`'s own `BoxFolderClient` interface
   *  does not require it; callers that care (case-archive-folder.ts) read it when
   *  present. */
  outcome?: 'created' | 'reused';
}

/** Adapts this app's Box facade (`box.getFolder`/`box.createFolder`) to the
 *  `BoxFolderClient` shape the intake-engine guard expects. Argument order is swapped —
 *  `BoxFolderClient.createFolder(parentFolderId, name)` vs. the facade's
 *  `box.createFolder(name, parentId)`. */
const boxClientAdapter: BoxFolderClient = {
  async getFolder(folderId) {
    const folder = await box.getFolder(folderId);
    return folder?.id ? { id: folder.id, name: folder.name ?? '' } : undefined;
  },
  async createFolder(parentFolderId, name) {
    const created = await box.createFolder(name, parentFolderId);
    return { id: created.id, name: created.name ?? name, outcome: created.outcome } as {
      id: string;
      name: string;
    };
  },
};

/**
 * The guarded Box-folder ensure, callable in-process (no Durable activity round-trip
 * required) by any other activity in this app. `boxClient` is injectable for tests;
 * production callers always use the default (the real Box facade adapter above).
 */
export async function ensureArchiveFolderV2Core(
  input: EnsureArchiveFolderV2Input,
  boxClient: BoxFolderClient = boxClientAdapter,
): Promise<EnsureArchiveFolderV2Result> {
  const name = (input.name ?? '').trim();
  if (!name) throw new Error('ensureArchiveFolderV2: name is required');
  const result = await ensureArchiveFolder(
    name,
    boxClient,
    input.parentFolderId ? { parentFolderId: input.parentFolderId } : {},
  );
  return result as EnsureArchiveFolderV2Result;
}

df.app.activity('ensureArchiveFolderV2', {
  handler: async (input: EnsureArchiveFolderV2Input, ctx): Promise<EnsureArchiveFolderV2Result> => {
    const result = await ensureArchiveFolderV2Core(input);
    ctx.log(JSON.stringify({ evt: 'ensureArchiveFolderV2', name: input.name, folderId: result.id }));
    return result;
  },
});
