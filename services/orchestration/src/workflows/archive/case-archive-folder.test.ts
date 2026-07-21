import { describe, expect, it, vi } from 'vitest';
import { ensureCaseArchiveFolder, type BoxFolderCreateDeps } from './case-archive-folder.js';

// The real pinned root from tools/box-scope.json's `allowedRoot` — @cs/intake-engine's
// resolveArchiveRoot() (which this file now delegates to) reads that file directly, so
// this constant must track it exactly the way box-folder-create.test.ts's own
// PINNED_TEST_ARCHIVE_ROOT_ID literal used to.
const PINNED_TEST_ARCHIVE_ROOT_ID = '392761581105';

function harness(overrides: Partial<BoxFolderCreateDeps> = {}) {
  const getCaseBoxFolder = vi.fn(async () => ({
    boxFolderId: null,
    boxFolderUrl: null,
    casePo: ' qdos26031 ',
  }));
  const ensureFolder = vi.fn(async (name: string) => ({
    id: 'folder-31',
    name,
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
    ensureFolder,
    stampCaseBoxFolder,
    ...overrides,
  };
  const ctx = { log: vi.fn() };
  return { deps, ctx, getCaseBoxFolder, getFolder, ensureFolder, stampCaseBoxFolder };
}

describe('ensureCaseArchiveFolder', () => {
  it('fails before any read or write when the configured root is not the pinned test root', async () => {
    const h = harness({ archiveRootId: () => 'production-root' });

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .rejects.toThrow('locked to the pinned test root');
    expect(h.getCaseBoxFolder).not.toHaveBeenCalled();
    expect(h.getFolder).not.toHaveBeenCalled();
    expect(h.ensureFolder).not.toHaveBeenCalled();
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
    expect(h.ensureFolder).not.toHaveBeenCalled();
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
    expect(h.ensureFolder).not.toHaveBeenCalled();
    expect(h.stampCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('derives an uppercase folder name from the Data API and creates via the guarded ensure call', async () => {
    const h = harness();

    await expect(ensureCaseArchiveFolder({ caseId: 'case-1' }, h.ctx, h.deps))
      .resolves.toMatchObject({
        folderId: 'folder-31',
        folderName: 'QDOS26031',
        outcome: 'created',
        applied: true,
      });
    expect(h.ensureFolder).toHaveBeenCalledWith('QDOS26031');
    expect(h.stampCaseBoxFolder).toHaveBeenCalledWith('case-1', {
      boxFolderId: 'folder-31',
      boxFolderUrl: 'https://app.box.com/folder/folder-31',
    });
  });

  it('adopts the exact folder id returned by the Box 409 reuse contract', async () => {
    const ensureFolder = vi.fn(async () => ({
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
    const h = harness({ ensureFolder, stampCaseBoxFolder });

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
});
