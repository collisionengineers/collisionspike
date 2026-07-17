/**
 * retro-activities.test.ts — TKT-230 activity units:
 *  - item 5: retroFindTrigger probes the stored mailbox FIRST, then every other configured
 *    intake mailbox; a throwing mailbox is skipped; a second-mailbox hit returns THAT
 *    mailbox's resource.
 *  - item 6: retroCaseFolderWritable — the rung-1 writability probe's ancestry matrix,
 *    fail-closed on any read failure, honest gate refusals.
 *
 * Activities are captured from the mocked durable-functions registry and driven directly
 * (no Durable host); adapters/gates are the standard retro-test mock seams.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type ActivityHandler = (input: never, ctx: unknown) => Promise<unknown>;
const activities = vi.hoisted(() => new Map<string, ActivityHandler>());

vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('durable-functions', () => ({
  app: {
    orchestration: vi.fn(),
    activity: (name: string, opts: { handler: ActivityHandler }) =>
      activities.set(name, opts.handler),
  },
  input: { durableClient: vi.fn(() => ({})) },
  getClient: vi.fn(),
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public readonly firstRetryIntervalInMilliseconds: number,
      public readonly maxNumberOfAttempts: number,
    ) {}
  },
}));

const gates = vi.hoisted(() => ({
  retroCase: vi.fn(() => true),
  boxApi: vi.fn(() => true),
  boxFolderAtIntake: vi.fn(() => true),
  retroOutlookSearch: vi.fn(() => false),
  retroRelatedIngest: vi.fn(() => false),
  retroBoxArchiveRootIds: vi.fn(() => ''),
  retroAdoptArchivePo: vi.fn(() => false),
}));
vi.mock('@cs/domain/gates', () => ({ gates }));

const dataApi = vi.hoisted(() => ({
  getCaseBoxFolder: vi.fn(),
  principals: vi.fn(async () => []),
  recordAudit: vi.fn(),
  markInboundAttention: vi.fn(),
}));
vi.mock('../../adapters/data-api.js', () => ({ dataApi }));

const graph = vi.hoisted(() => ({
  findMessageByInternetMessageId: vi.fn(),
  getMessageIdentity: vi.fn(),
  kqlPhrase: vi.fn((value: string) => value),
  searchMessages: vi.fn(),
  getMessageWithAttachments: vi.fn(),
  getMessageHeaders: vi.fn(),
  getMessageRawMime: vi.fn(),
}));
vi.mock('../../adapters/graph.js', () => graph);

const subs = vi.hoisted(() => ({
  intakeMailboxes: vi.fn(() => [] as Array<{ mailbox: string }>),
  mailboxOfResource: vi.fn(),
  looksLikeMailboxAddress: vi.fn(),
  resolveSubscriptionMailbox: vi.fn(),
}));
vi.mock('../../platform/subscriptions.js', () => subs);

const box = vi.hoisted(() => ({
  getFolder: vi.fn(),
  searchContent: vi.fn(),
  listFolderItems: vi.fn(),
  downloadFile: vi.fn(),
}));
vi.mock('../../adapters/functions-client.js', () => ({ box, callExplodeEml: vi.fn() }));
vi.mock('../../platform/blob.js', () => ({ uploadEvidenceBytes: vi.fn() }));

import './retro-activities.js';

const ctx = { log: vi.fn(), warn: vi.fn() } as unknown as never;
const findTrigger = () => activities.get('retroFindTrigger')!;
const folderWritable = () => activities.get('retroCaseFolderWritable')!;

beforeEach(() => {
  vi.clearAllMocks();
  gates.retroCase.mockReturnValue(true);
  gates.boxApi.mockReturnValue(true);
  gates.boxFolderAtIntake.mockReturnValue(true);
  gates.retroBoxArchiveRootIds.mockReturnValue('');
});

/* ============================================================
   TKT-230 item 5 — retroFindTrigger multi-mailbox fallback
   ============================================================ */
describe('retroFindTrigger — multi-mailbox fallback (TKT-230 item 5)', () => {
  const INPUT = { internetMessageId: '<t@example.test>', mailbox: 'info@example.test' };
  const MAILBOXES = [
    { mailbox: 'info@example.test' },
    { mailbox: 'engineers@example.test' },
    { mailbox: 'desk@example.test' },
  ];

  it('probes the STORED mailbox first and stops on a first-mailbox hit', async () => {
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    graph.findMessageByInternetMessageId.mockResolvedValueOnce({ id: 'g-1' });
    const result = await findTrigger()(INPUT as never, ctx);
    expect(result).toEqual({
      found: true,
      messageId: 'g-1',
      resource: 'users/info@example.test/messages/g-1',
      mailbox: 'info@example.test',
    });
    expect(graph.findMessageByInternetMessageId).toHaveBeenCalledTimes(1);
    expect(graph.findMessageByInternetMessageId).toHaveBeenCalledWith(
      'info@example.test',
      '<t@example.test>',
    );
  });

  it('falls through to the other configured mailboxes and returns the HIT mailbox resource', async () => {
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    graph.findMessageByInternetMessageId
      .mockResolvedValueOnce(null) // stored: info
      .mockResolvedValueOnce({ id: 'g-2' }); // engineers
    const result = await findTrigger()(INPUT as never, ctx);
    expect(result).toEqual({
      found: true,
      messageId: 'g-2',
      resource: 'users/engineers@example.test/messages/g-2',
      mailbox: 'engineers@example.test',
    });
    // Order pinned: stored first, then the remaining configured mailboxes (deduped).
    expect(graph.findMessageByInternetMessageId.mock.calls.map((c) => c[0])).toEqual([
      'info@example.test',
      'engineers@example.test',
    ]);
  });

  it('skips a THROWING mailbox and keeps probing (per-mailbox salvage)', async () => {
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    graph.findMessageByInternetMessageId
      .mockRejectedValueOnce(new Error('429 throttled')) // stored: info
      .mockResolvedValueOnce(null) // engineers
      .mockResolvedValueOnce({ id: 'g-3' }); // desk
    const result = await findTrigger()(INPUT as never, ctx);
    expect(result).toMatchObject({ found: true, mailbox: 'desk@example.test' });
    expect((ctx as { warn: ReturnType<typeof vi.fn> }).warn).toHaveBeenCalledWith(
      expect.stringContaining('probe failed on info@example.test'),
    );
  });

  it('returns found:false after ALL mailboxes miss (and logs how many were tried)', async () => {
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    const result = await findTrigger()(INPUT as never, ctx);
    expect(result).toEqual({ found: false });
    expect(graph.findMessageByInternetMessageId).toHaveBeenCalledTimes(3);
  });

  it('honours the retro gate', async () => {
    gates.retroCase.mockReturnValue(false);
    expect(await findTrigger()(INPUT as never, ctx)).toEqual({ skipped: 'gate_off' });
    expect(graph.findMessageByInternetMessageId).not.toHaveBeenCalled();
  });
});

/* ============================================================
   TKT-230 item 6 — retroCaseFolderWritable ancestry matrix
   ============================================================ */
describe('retroCaseFolderWritable — rung-1 writability probe (TKT-230 item 6)', () => {
  const INPUT = { caseId: 'case-1' };

  it('honest gate refusals (retro gate; box gate pair — the boxArchiveEvidence pair)', async () => {
    gates.retroCase.mockReturnValue(false);
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'gate_off',
    });

    gates.retroCase.mockReturnValue(true);
    gates.boxFolderAtIntake.mockReturnValue(false);
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'box_gated_off',
    });
    expect(dataApi.getCaseBoxFolder).not.toHaveBeenCalled();
  });

  it('fail-closed when the case folder linkage cannot be read', async () => {
    dataApi.getCaseBoxFolder.mockRejectedValue(new Error('api 503'));
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'folder_unreadable',
    });
  });

  it('not writable when the case has NO folder', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: null, boxFolderUrl: null, casePo: null });
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'no_folder',
    });
  });

  it('writable WITHOUT a Box lookup when no RO roots are configured', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: 'f-77', boxFolderUrl: null, casePo: null });
    gates.retroBoxArchiveRootIds.mockReturnValue('');
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({ writable: true });
    expect(box.getFolder).not.toHaveBeenCalled();
  });

  it('read-only when the folder IS one of the RO roots', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: 'ro-root-2', boxFolderUrl: null, casePo: null });
    gates.retroBoxArchiveRootIds.mockReturnValue('ro-root-1, ro-root-2');
    box.getFolder.mockResolvedValue({ id: 'ro-root-2', path_collection: { entries: [{ id: '0' }] } });
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'readonly_archive_root',
    });
  });

  it('read-only when an RO root sits among the folder ancestors (path_collection)', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: 'f-case', boxFolderUrl: null, casePo: null });
    gates.retroBoxArchiveRootIds.mockReturnValue('ro-root-1');
    box.getFolder.mockResolvedValue({
      id: 'f-case',
      path_collection: { entries: [{ id: '0' }, { id: 'ro-root-1' }, { id: 'f-year' }] },
    });
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'readonly_archive_root',
    });
  });

  it('writable when the folder lives under the pinned (RW) root', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: 'f-case', boxFolderUrl: null, casePo: null });
    gates.retroBoxArchiveRootIds.mockReturnValue('ro-root-1');
    box.getFolder.mockResolvedValue({
      id: 'f-case',
      path_collection: { entries: [{ id: '0' }, { id: 'rw-pinned-root' }] },
    });
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({ writable: true });
  });

  it('fail-closed when the Box folder read throws (never upload blind)', async () => {
    dataApi.getCaseBoxFolder.mockResolvedValue({ boxFolderId: 'f-case', boxFolderUrl: null, casePo: null });
    gates.retroBoxArchiveRootIds.mockReturnValue('ro-root-1');
    box.getFolder.mockRejectedValue(new Error('box 502'));
    expect(await folderWritable()(INPUT as never, ctx)).toEqual({
      writable: false,
      reason: 'folder_unreadable',
    });
  });
});
