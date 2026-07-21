import { beforeEach, describe, expect, it, vi } from 'vitest';

interface HttpRegistration {
  handler: (req: unknown, ctx: unknown) => Promise<unknown>;
}

const httpRoutes = vi.hoisted(() => new Map<string, HttpRegistration>());
vi.mock('@azure/functions', () => ({
  app: { http: (name: string, options: HttpRegistration) => httpRoutes.set(name, options) },
}));

const activities = vi.hoisted(() => new Map<string, { handler: (input: unknown, ctx: unknown) => Promise<unknown> }>());
vi.mock('durable-functions', () => ({
  input: { durableClient: () => ({}) },
  getClient: vi.fn(),
  app: {
    activity: (name: string, options: { handler: (input: unknown, ctx: unknown) => Promise<unknown> }) =>
      activities.set(name, options),
    orchestration: vi.fn(),
  },
  RetryOptions: class {
    backoffCoefficient?: number;
    maxRetryIntervalInMilliseconds?: number;
    constructor(_first: number, _attempts: number) {}
  },
}));

const gateState = vi.hoisted(() => ({ evaOn: false, boxOn: false }));
vi.mock('@cs/domain/gates', () => ({
  gates: {
    evaApi: () => gateState.evaOn,
    boxApi: () => gateState.boxOn,
  },
}));

const dataApiMock = vi.hoisted(() => ({
  evaSubmission: vi.fn(),
  recordAudit: vi.fn(async () => undefined),
  getCaseBoxFolder: vi.fn(),
}));
vi.mock('../../adapters/data-api.js', () => ({ dataApi: dataApiMock }));

vi.mock('../../adapters/functions-client.js', () => ({
  callEvaSubmit: vi.fn(async () => ({ submitted: true })),
}));

const ensureArchiveFolderV2CoreMock = vi.hoisted(() => vi.fn());
vi.mock('../intake-v2/ensureArchiveFolder.js', () => ({
  ensureArchiveFolderV2Core: ensureArchiveFolderV2CoreMock,
}));

import './finalize-eva-box.js';

function fakeCtx() {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() };
}

beforeEach(() => {
  vi.clearAllMocks();
  gateState.evaOn = false;
  gateState.boxOn = false;
});

describe('evaArchiveFolderEnsure activity', () => {
  it('skips when BOX_API_ENABLED is off', async () => {
    const handler = activities.get('evaArchiveFolderEnsure')!.handler;
    const result = await handler({ caseId: 'case-1' }, fakeCtx());
    expect(result).toEqual({ skipped: true });
    expect(dataApiMock.getCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('skips a case with no saved Case/PO yet', async () => {
    gateState.boxOn = true;
    dataApiMock.getCaseBoxFolder.mockResolvedValue({ boxFolderId: null, boxFolderUrl: null, casePo: null });
    const handler = activities.get('evaArchiveFolderEnsure')!.handler;
    const result = await handler({ caseId: 'case-1' }, fakeCtx());
    expect(result).toEqual({ skipped: true, reason: 'no_case_po' });
    expect(ensureArchiveFolderV2CoreMock).not.toHaveBeenCalled();
  });

  it('derives the archive folder name from the saved Case/PO and ensures it via the guarded call', async () => {
    gateState.boxOn = true;
    dataApiMock.getCaseBoxFolder.mockResolvedValue({ boxFolderId: null, boxFolderUrl: null, casePo: ' qdos26031 ' });
    ensureArchiveFolderV2CoreMock.mockResolvedValue({ id: 'folder-31', name: 'QDOS26031' });
    const handler = activities.get('evaArchiveFolderEnsure')!.handler;
    const result = await handler({ caseId: 'case-1' }, fakeCtx());
    expect(ensureArchiveFolderV2CoreMock).toHaveBeenCalledWith({ name: 'QDOS26031' });
    expect(result).toEqual({ folderId: 'folder-31', folderUrl: 'https://app.box.com/folder/folder-31' });
    expect(dataApiMock.recordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'box_synced', caseId: 'case-1' }),
    );
  });

  it('never calls box.createFolder directly — only the guarded core function', async () => {
    gateState.boxOn = true;
    dataApiMock.getCaseBoxFolder.mockResolvedValue({ boxFolderId: null, boxFolderUrl: null, casePo: 'PCH26010' });
    ensureArchiveFolderV2CoreMock.mockResolvedValue({ id: 'folder-10', name: 'PCH26010' });
    const handler = activities.get('evaArchiveFolderEnsure')!.handler;
    await handler({ caseId: 'case-2' }, fakeCtx());
    expect(ensureArchiveFolderV2CoreMock).toHaveBeenCalledTimes(1);
  });
});
