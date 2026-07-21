/** *
 * Gated orchestration (plan 22 §C): create the case Box folder at parse-confirm.
 *
 * email-engine-rebuild — REPLACES the former `box-folder-create.ts`. Everything AROUND
 * the actual Box create call is unchanged from that file: idempotent skip when the case
 * already has a linked folder (re-verified against the pinned root + saved Case/PO
 * before adoption), first-wins stamping via the Data API, the same Durable
 * orchestration/activity names and HTTP route. What changed is WHERE the pinned-root
 * assertion and the folder-create call itself come from — both now delegate to
 * `@cs/intake-engine`'s `ensureArchiveFolder` guard via
 * `../intake-v2/ensureArchiveFolder.js`'s `ensureArchiveFolderV2Core`, the ONE guarded
 * Box-folder-creation primitive for this rebuild (see that file's doc comment for the
 * full list of callers it now serves). `tools/box-scope.json`'s `allowedRoot` is the
 * single source of truth for the pinned root — this file no longer keeps its own
 * hardcoded copy of that id (the former `PINNED_TEST_ARCHIVE_ROOT_ID` constant).
 *
 * The Durable orchestration name (`boxFolderCreateOrchestrator`), activity name
 * (`boxFolderCreate`), and HTTP route (`box-folder-create-start` / `box-folder-create`)
 * are DELIBERATELY UNCHANGED: retro-reconstruct.ts, retro-case.ts,
 * retro-related-ingest.ts, provider-archive-monitor.ts, and intakeOrchestrator.ts all
 * invoke this seam by NAME through the Durable Task Hub — none of them import this file
 * directly — so keeping the names stable means the new engine's guard is live under
 * every existing caller (including the out-of-scope retro-reconstruction workflows)
 * with zero changes required at any call site.
 *
 * Gates: BOX_FOLDER_AT_INTAKE_ENABLED **and** BOX_API_ENABLED — both off by default → the
 * HTTP starter no-ops without launching the orchestration, and the activity no-ops when
 * called (so the intake orchestrator's gate-less callSubOrchestrator is replay-safe).
 *
 * Idempotent: the activity reads the case's current box_folder_id first and SKIPS if the
 * case already has a folder; Box's exact-name 409 response is adopted; on create/adopt it
 * stamps box_folder_id/box_folder_url onto the case (the Data API writes the
 * box_folder_created audit, first-wins).
 */

import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import * as df from 'durable-functions';
import { gates } from '@cs/domain/gates';
import { resolveArchiveFolderName, resolveArchiveRoot } from '@cs/intake-engine';
import { box, isTerminalFnFailure } from '../../adapters/functions-client.js';
import { dataApi } from '../../adapters/data-api.js';
import { ensureArchiveFolderV2Core } from '../intake-v2/ensureArchiveFolder.js';

/**
 * A case's saved Archive link cannot be used and no amount of retrying will change that:
 * the folder is outside the pinned root, or it is not the folder the case says it is.
 * Thrown (not returned) so `ensureCaseArchiveFolder` keeps its refuse-loudly contract; the
 * ACTIVITY converts it into a terminal outcome so Durable stops retrying.
 */
export class ArchiveLinkRefusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveLinkRefusal';
  }
}

/** Terminal outcome shape returned by the activity instead of throwing. */
export interface TerminalArchiveOutcome extends Record<string, unknown> {
  skipped: true;
  terminal: true;
  reason: string;
  detail: string;
}

/**
 * A refusal by us, or a fixed 4xx refusal by the Box facade, is terminal. Anything else
 * (5xx, timeout, transport fault) stays retryable exactly as before.
 */
export function terminalArchiveFailure(error: unknown): TerminalArchiveOutcome | null {
  const terminal = error instanceof ArchiveLinkRefusal || isTerminalFnFailure(error);
  if (!terminal) return null;
  return {
    skipped: true,
    terminal: true,
    reason: error instanceof ArchiveLinkRefusal ? 'archive_link_refused' : 'archive_scope_refused',
    detail: error instanceof Error ? error.message : String(error),
  };
}

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
  /** A read-only identity check of an ALREADY-LINKED folder id (not a creation call) —
   *  stays a direct Box facade read; @cs/intake-engine's guard only concerns itself with
   *  folder CREATION under the pinned root, not verifying an arbitrary existing id. */
  getFolder: (folderId: string) => Promise<{
    id: string;
    name?: string;
    parent?: { id?: string };
    path_collection?: { entries?: Array<{ id?: string }> };
  }>;
  /** The ONE guarded creation call — delegates to @cs/intake-engine's ensureArchiveFolder
   *  via intake-v2/ensureArchiveFolder.ts. No direct box.createFolder call in this file. */
  ensureFolder: (name: string) => Promise<{ id: string; name: string; outcome?: 'created' | 'reused' }>;
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
  ensureFolder: (name) => ensureArchiveFolderV2Core({ name }),
  stampCaseBoxFolder: dataApi.stampCaseBoxFolder,
};

/** Fails closed: throws unless `rootId` is exactly the pinned test root
 *  `@cs/intake-engine`'s guard compiles in (kept in step with
 *  `tools/box-scope.json`'s `allowedRoot` by that package's parity test).
 *  TKT-303: an `ArchiveLinkRefusal`, not a bare Error — a misconfigured root can
 *  never come right on a retry, so the activity must park it, not re-drive it. */
export function assertPinnedTestArchiveRoot(rootId: string): void {
  if (rootId.trim() !== resolveArchiveRoot()) {
    throw new ArchiveLinkRefusal('Archive folder creation is locked to the pinned test root');
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
    throw new ArchiveLinkRefusal(
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
  const rawCasePo = (existing.casePo ?? '').trim();
  const folderName = rawCasePo ? resolveArchiveFolderName(rawCasePo) : '';
  if (!folderName) {
    if (existing.boxFolderId) {
      throw new ArchiveLinkRefusal(`Case ${caseId} has an Archive link but no verifiable Case/PO`);
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
      throw new ArchiveLinkRefusal(
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

  // The guarded ensure call surfaces the box facade's exact-name 409 -> 'reused' mapping
  // unchanged (see intake-v2/ensureArchiveFolder.ts), so a retry after remote-create/before-
  // stamp stays safe exactly as before this rebuild.
  const folder = await deps.ensureFolder(folderName);
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
    throw new ArchiveLinkRefusal(
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

    try {
      return await ensureCaseArchiveFolder(input, ctx);
    } catch (e) {
      // A fixed refusal can never succeed on a retry. RETURNING it (instead of throwing)
      // is what stops the retry amplification: `retry` here (3) multiplied by the caller's
      // sub-orchestrator retry (4) turned one permanently-bad case into 12 doomed Box calls
      // per monitor wake, forever. A returned outcome is recorded in Durable history once
      // and replays deterministically.
      const terminal = terminalArchiveFailure(e);
      if (!terminal) throw e;
      ctx.log(JSON.stringify({ evt: 'boxFolderCreate', caseId: input.caseId, ...terminal }));
      return terminal;
    }
  },
});
