/** *
 * Gated orchestration (plan 22 §C): create the case Box folder at parse-confirm via the
 * box-webhook Function facade (CCG token minted inside that Function — the orchestration
 * NEVER re-mints Box tokens).
 *
 * Gates: BOX_FOLDER_AT_INTAKE_ENABLED **and** BOX_API_ENABLED — both off by default → the
 * HTTP starter no-ops without launching the orchestration, and the activity no-ops when
 * called (so the intake orchestrator's gate-less callSubOrchestrator is replay-safe).
 *
 * Triggers: (1) the intake orchestrator calls `boxFolderCreateOrchestrator` via
 * callSubOrchestrator whenever it has a Case id; (2) the manual HTTP starter, preserved as
 * a recovery lever. The caller never supplies a folder name: this activity reads the saved
 * Case/PO from the Data API and is the sole owner of the Archive-folder name.
 *
 * Idempotent: the activity reads the case's current box_folder_id first and SKIPS if the
 * case already has a folder; Box's exact-name 409 response is adopted; on create/adopt it
 * stamps box_folder_id/box_folder_url onto the case (the Data API writes the
 * box_folder_created audit, first-wins).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { box } from '../../adapters/functions-client.js';
import { dataApi } from '../../adapters/data-api.js';

export const PINNED_TEST_ARCHIVE_ROOT_ID = '392761581105';

export interface BoxFolderCreateInput {
  caseId: string;
}

interface CaseArchiveFolderState {
  boxFolderId: string | null;
  boxFolderUrl: string | null;
  casePo: string | null;
}

export interface BoxFolderCreateDeps {
  archiveRootId: () => string;
  getCaseBoxFolder: (caseId: string) => Promise<CaseArchiveFolderState>;
  getFolder: (folderId: string) => Promise<{
    id: string;
    name?: string;
    parent?: { id?: string };
    path_collection?: { entries?: Array<{ id?: string }> };
  }>;
  createFolder: (
    name: string,
    parentId: string,
  ) => Promise<{ id: string; name?: string; outcome?: 'created' | 'reused' }>;
  stampCaseBoxFolder: (
    caseId: string,
    payload: { boxFolderId: string; boxFolderUrl?: string },
  ) => Promise<{
    found: boolean;
    applied: boolean;
    boxFolderId: string | null;
    providerRecoveryCompleted: boolean;
    statusGeneration?: number;
  }>;
}

interface BoxFolderCreateContext {
  log(message: string): void;
}

const defaultDeps: BoxFolderCreateDeps = {
  archiveRootId: gates.boxFolderRootId,
  getCaseBoxFolder: dataApi.getCaseBoxFolder,
  getFolder: box.getFolder,
  createFolder: box.createFolder,
  stampCaseBoxFolder: dataApi.stampCaseBoxFolder,
};

export function assertPinnedTestArchiveRoot(rootId: string): void {
  if (rootId.trim() !== PINNED_TEST_ARCHIVE_ROOT_ID) {
    throw new Error('Archive folder creation is locked to the pinned test root');
  }
}

async function verifyFolderIdentity(
  deps: BoxFolderCreateDeps,
  folderId: string,
  expectedName: string,
  expectedRootId: string,
): Promise<void> {
  const folder = await deps.getFolder(folderId);
  const pathIds = (folder.path_collection?.entries ?? []).map((entry) => String(entry.id ?? ''));
  if (
    String(folder.id ?? '') !== folderId ||
    String(folder.name ?? '').trim().toUpperCase() !== expectedName ||
    String(folder.parent?.id ?? '') !== expectedRootId ||
    !pathIds.includes(expectedRootId)
  ) {
    throw new Error(
      `Archive folder identity mismatch for case folder ${folderId}: refusing adoption`,
    );
  }
}

/**
 * Ensure one Case/PO-named folder exists for a case under the pinned test root.
 *
 * This seam is deliberately dependency-injected so its fail-closed and first-wins
 * behaviour can be proved without making any live Data API or Box calls.
 */
export async function ensureCaseArchiveFolder(
  input: BoxFolderCreateInput,
  ctx: BoxFolderCreateContext,
  deps: BoxFolderCreateDeps = defaultDeps,
): Promise<Record<string, unknown>> {
  const caseId = (input.caseId ?? '').trim();
  if (!caseId) throw new Error('caseId is required');

  const archiveRootId = deps.archiveRootId().trim();
  // Assert before even reading the case: a bad root can never reach a remote write seam.
  assertPinnedTestArchiveRoot(archiveRootId);

  const existing = await deps.getCaseBoxFolder(caseId);
  const folderName = (existing.casePo ?? '').trim().toUpperCase();
  if (!folderName) {
    if (existing.boxFolderId) {
      throw new Error(`Case ${caseId} has an Archive link but no verifiable Case/PO`);
    }
    ctx.log(JSON.stringify({ evt: 'boxFolderCreate', caseId, skipped: 'no_case_po' }));
    return { skipped: true, reason: 'no_case_po' };
  }

  if (existing.boxFolderId) {
    // A database id is not sufficient authority to adopt a folder. Re-read Box and prove
    // exact Case/PO name plus direct ancestry under the pinned test root first. Production
    // Archive roots therefore remain read-only and can never be re-stamped through this seam.
    await verifyFolderIdentity(
      deps,
      existing.boxFolderId,
      folderName,
      archiveRootId,
    );
    // Re-stamp the same id to finish a two-phase provider recovery that linked the
    // folder before the Archive-pending hold could be cleared. The API is first-wins.
    const stamp = await deps.stampCaseBoxFolder(caseId, {
      boxFolderId: existing.boxFolderId,
      ...(existing.boxFolderUrl ? { boxFolderUrl: existing.boxFolderUrl } : {}),
    });
    if (stamp.boxFolderId !== existing.boxFolderId) {
      throw new Error(
        `Archive folder first-wins conflict for case ${caseId}: refusing a mismatched linkage`,
      );
    }
    ctx.log(JSON.stringify({
      evt: 'boxFolderCreate',
      caseId,
      skipped: 'already_linked',
      folderId: existing.boxFolderId,
      providerRecoveryCompleted: stamp.providerRecoveryCompleted,
    }));
    return {
      skipped: true,
      reason: 'already_linked',
      folderId: existing.boxFolderId,
      folderUrl: existing.boxFolderUrl ?? undefined,
      providerRecoveryCompleted: stamp.providerRecoveryCompleted,
      ...(stamp.statusGeneration != null ? { statusGeneration: stamp.statusGeneration } : {}),
    };
  }

  // The Box facade maps exact-name `item_name_in_use` 409s to outcome='reused' with
  // the conflicting folder id. That makes a retry after remote-create/before-stamp safe.
  const folder = await deps.createFolder(folderName, archiveRootId);
  const folderId = (folder.id ?? '').trim();
  if (!folderId) throw new Error('Archive folder creation returned no folder id');
  await verifyFolderIdentity(deps, folderId, folderName, archiveRootId);
  const folderUrl = `https://app.box.com/folder/${encodeURIComponent(folderId)}`;

  const stamp = await deps.stampCaseBoxFolder(caseId, {
    boxFolderId: folderId,
    boxFolderUrl: folderUrl,
  });
  const effectiveFolderId = (stamp.boxFolderId ?? '').trim();
  if (effectiveFolderId !== folderId) {
    throw new Error(
      `Archive folder first-wins conflict for case ${caseId}: refusing a mismatched linkage`,
    );
  }

  const outcome = folder.outcome === 'reused' ? 'reused' : 'created';
  ctx.log(JSON.stringify({
    evt: 'boxFolderCreate',
    caseId,
    folderId,
    outcome,
    applied: stamp.applied,
  }));
  return {
    folderId,
    folderUrl,
    folderName,
    outcome,
    applied: stamp.applied,
    providerRecoveryCompleted: stamp.providerRecoveryCompleted,
    ...(stamp.statusGeneration != null ? { statusGeneration: stamp.statusGeneration } : {}),
  };
}

app.http('box-folder-create-start', {
  methods: ['POST'],
  authLevel: 'function',
  route: 'box-folder-create',
  extraInputs: [df.input.durableClient()],
  handler: async (req: HttpRequest, ctx: InvocationContext): Promise<HttpResponseInit> => {
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) {
      ctx.log('[box-folder-create] skipped — BOX_API_ENABLED and/or BOX_FOLDER_AT_INTAKE_ENABLED off');
      return { status: 200, jsonBody: { skipped: true, reason: 'gated off' } };
    }
    try {
      assertPinnedTestArchiveRoot(gates.boxFolderRootId());
    } catch {
      ctx.error('[box-folder-create] refused — Archive root is not the pinned test root');
      return { status: 503, jsonBody: { error: 'archive_root_not_pinned' } };
    }
    const body = (await req.json().catch(() => ({}))) as Partial<BoxFolderCreateInput>;
    const caseId = (body.caseId ?? '').trim();
    if (!caseId) return { status: 400, jsonBody: { error: 'caseId is required' } };
    const input: BoxFolderCreateInput = { caseId };
    const client = df.getClient(ctx);
    const instanceId = await client.startNew('boxFolderCreateOrchestrator', { input });
    return client.createCheckStatusResponse(req, instanceId);
  },
});

const retry = new df.RetryOptions(5_000, 3);
retry.backoffCoefficient = 2;

df.app.orchestration('boxFolderCreateOrchestrator', function* (ctx) {
  const input = ctx.df.getInput() as BoxFolderCreateInput;
  const result = yield ctx.df.callActivityWithRetry('boxFolderCreate', retry, input);
  return result;
});

df.app.activity('boxFolderCreate', {
  handler: async (input: BoxFolderCreateInput, ctx): Promise<unknown> => {
    // Gate enforced HERE (not in the calling orchestrator) so the decision is recorded in
    // Durable history and stays replay-safe — the parse/enrich/chaser convention.
    if (!gates.boxApi() || !gates.boxFolderAtIntake()) return { skipped: true, reason: 'gated off' };

    return ensureCaseArchiveFolder(input, ctx);
  },
});
