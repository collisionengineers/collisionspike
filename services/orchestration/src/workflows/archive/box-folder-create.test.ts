import { describe, expect, it, vi } from 'vitest';
import {
  ArchiveLinkRefusal,
  PINNED_TEST_ARCHIVE_ROOT_ID,
  ensureCaseArchiveFolder,
  terminalArchiveFailure,
  type BoxFolderCreateDeps,
} from './box-folder-create.js';
import { FocusedFnHttpError } from '../../adapters/functions-client.js';

function harness(overrides: Partial<BoxFolderCreateDeps> = {}) {
  const getCaseBoxFolder = vi.fn(async () => ({
    boxFolderId: null,
    boxFolderUrl: null,
    casePo: ' qdos26031 ',
  }));
  const createFolder = vi.fn(async () => ({
    id: 'folder-31',
    name: 'QDOS26031',
    outcome: 'created' as const,
  }));
  const getFolder = vi.fn(async (folderId: string) => ({
    id: folderId,
    name: 'QDOS26031',
    parent: { id: PINNED_TEST_ARCHIVE_ROOT_ID },
    path_collection: { entries: [{ id: '0' }, { id: PINNED_TEST_ARCHIVE_ROOT_ID }] },
  }));
  const stampCaseBoxFolder = vi.fn(async (
    _caseId: string,
    payload: { boxFolderId: string },
  ) => ({
    found: true,
    applied: true,
    boxFolderId: payload.boxFolderId,
    providerRecoveryCompleted: false,
  }));
  const deps: BoxFolderCreateDeps = {
    archiveRootId: () => PINNED_TEST_ARCHIVE_ROOT_ID,
    getCaseBoxFolder,
    getFolder,
    createFolder,
    stampCaseBoxFolder,
    ...overrides,
  };
  const ctx = { log: vi.fn() };
  return { deps, ctx, getCaseBoxFolder, getFolder, createFolder, stampCaseBoxFolder };
}

describe('ensureCaseArchiveFolder', () => {
  it('fails before any read or write when the configured root is not the pinned test root', async () => {
    const h = harness({ archiveRootId: () => 'production-root' });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toThrow('locked to the pinned test root');
    expect(h.getCaseBoxFolder).not.toHaveBeenCalled();
    expect(h.getFolder).not.toHaveBeenCalled();
    expect(h.createFolder).not.toHaveBeenCalled();
    expect(h.stampCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('refuses an existing database link whose Box folder is outside the pinned root', async () => {
    const stampCaseBoxFolder = vi.fn();
    const h = harness({
      getCaseBoxFolder: vi.fn(async () => ({
        boxFolderId: 'folder-production',
        boxFolderUrl: 'https://app.box.com/folder/folder-production',
        casePo: 'QDOS26031',
      })),
      getFolder: vi.fn(async () => ({
        id: 'folder-production',
        name: 'QDOS26031',
        parent: { id: 'production-root' },
        path_collection: { entries: [{ id: 'production-root' }] },
      })),
      stampCaseBoxFolder,
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toThrow('identity mismatch');
    expect(stampCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('refuses an existing database link whose folder name is not the saved Case/PO', async () => {
    const stampCaseBoxFolder = vi.fn();
    const h = harness({
      getCaseBoxFolder: vi.fn(async () => ({
        boxFolderId: 'folder-wrong-name',
        boxFolderUrl: null,
        casePo: 'QDOS26031',
      })),
      getFolder: vi.fn(async () => ({
        id: 'folder-wrong-name',
        name: 'QDOS26099',
        parent: { id: PINNED_TEST_ARCHIVE_ROOT_ID },
        path_collection: { entries: [{ id: PINNED_TEST_ARCHIVE_ROOT_ID }] },
      })),
      stampCaseBoxFolder,
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toThrow('identity mismatch');
    expect(stampCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('skips a case that already has a durable folder link', async () => {
    const h = harness({
      getCaseBoxFolder: vi.fn(async () => ({
        boxFolderId: 'folder-existing',
        boxFolderUrl: 'https://app.box.com/folder/folder-existing',
        casePo: 'QDOS26031',
      })),
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .resolves.toMatchObject({ skipped: true, reason: 'already_linked', folderId: 'folder-existing' });
    expect(h.createFolder).not.toHaveBeenCalled();
    expect(h.getFolder).toHaveBeenCalledWith('folder-existing');
    expect(h.stampCaseBoxFolder).toHaveBeenCalledWith('case-1', {
      boxFolderId: 'folder-existing',
      boxFolderUrl: 'https://app.box.com/folder/folder-existing',
    });
  });

  it('skips a held case whose saved Case/PO has not been minted yet', async () => {
    const h = harness({
      getCaseBoxFolder: vi.fn(async () => ({
        boxFolderId: null,
        boxFolderUrl: null,
        casePo: null,
      })),
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-held' }, h.ctx, h.deps))
      .resolves.toEqual({ skipped: true, reason: 'no_case_po' });
    expect(h.createFolder).not.toHaveBeenCalled();
    expect(h.stampCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('derives an uppercase folder name from the Data API and creates only under the pinned root', async () => {
    const h = harness();

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .resolves.toMatchObject({
        folderId: 'folder-31',
        folderName: 'QDOS26031',
        outcome: 'created',
        applied: true,
      });
    expect(h.createFolder).toHaveBeenCalledWith('QDOS26031', PINNED_TEST_ARCHIVE_ROOT_ID);
    expect(h.stampCaseBoxFolder).toHaveBeenCalledWith('case-1', {
      boxFolderId: 'folder-31',
      boxFolderUrl: 'https://app.box.com/folder/folder-31',
    });
  });

  it('adopts the exact folder id returned by the Box 409 reuse contract', async () => {
    const createFolder = vi.fn(async () => ({
      id: 'folder-existing-name',
      name: 'QDOS26031',
      outcome: 'reused' as const,
    }));
    const stampCaseBoxFolder = vi.fn(async () => ({
      found: true,
      applied: true,
      boxFolderId: 'folder-existing-name',
      providerRecoveryCompleted: false,
    }));
    const h = harness({ createFolder, stampCaseBoxFolder });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .resolves.toMatchObject({ folderId: 'folder-existing-name', outcome: 'reused' });
    expect(stampCaseBoxFolder).toHaveBeenCalledWith('case-1', {
      boxFolderId: 'folder-existing-name',
      boxFolderUrl: 'https://app.box.com/folder/folder-existing-name',
    });
  });

  it('accepts a concurrent first-wins stamp only when it names the same exact folder id', async () => {
    const h = harness({
      stampCaseBoxFolder: vi.fn(async () => ({
        found: true,
        applied: false,
        boxFolderId: 'folder-31',
        providerRecoveryCompleted: false,
      })),
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .resolves.toMatchObject({ folderId: 'folder-31', applied: false });
  });

  it('fails visibly when a concurrent first-wins stamp points at a different folder', async () => {
    const h = harness({
      stampCaseBoxFolder: vi.fn(async () => ({
        found: true,
        applied: false,
        boxFolderId: 'folder-other',
        providerRecoveryCompleted: false,
      })),
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toThrow('refusing a mismatched linkage');
  });

  it('raises every refusal as a terminal type so the activity can stop the retry cascade', async () => {
    const h = harness({
      getCaseBoxFolder: vi.fn(async () => ({
        boxFolderId: 'folder-production',
        boxFolderUrl: null,
        casePo: 'QDOS26031',
      })),
      getFolder: vi.fn(async () => ({
        id: 'folder-production',
        name: 'QDOS26031',
        parent: { id: 'production-root' },
        path_collection: { entries: [{ id: 'production-root' }] },
      })),
    });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toBeInstanceOf(ArchiveLinkRefusal);
  });
});

describe('terminalArchiveFailure', () => {
  it('treats the Box facade scope-lock 400 as terminal — retrying it can never succeed', () => {
    const error = new FocusedFnHttpError(
      'fn GET box/folders/401801654393 → 400: {"error": "Target is outside the allowed Box root (scope lock).", "status": 400}',
      400,
    );

    expect(terminalArchiveFailure(error)).toMatchObject({
      skipped: true,
      terminal: true,
      reason: 'archive_scope_refused',
    });
  });

  it('treats our own adoption refusal as terminal', () => {
    expect(terminalArchiveFailure(new ArchiveLinkRefusal('refusing adoption')))
      .toMatchObject({ terminal: true, reason: 'archive_link_refused' });
  });

  it.each([500, 502, 503, 408, 429])('keeps %i retryable', (status) => {
    expect(terminalArchiveFailure(new FocusedFnHttpError(`fn GET box/folders/1 → ${status}: x`, status)))
      .toBeNull();
  });

  it('keeps an unclassified transport fault retryable', () => {
    expect(terminalArchiveFailure(new Error('socket hang up'))).toBeNull();
  });
});
