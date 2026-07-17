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
  providerMatchRecords: vi.fn(),
  retroLinkRelated: vi.fn(),
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
const ctxLog = () => (ctx as { log: ReturnType<typeof vi.fn> }).log;
const ctxWarn = () => (ctx as { warn: ReturnType<typeof vi.fn> }).warn;
const findTrigger = () => activities.get('retroFindTrigger')!;
const folderWritable = () => activities.get('retroCaseFolderWritable')!;
const outlookLocate = () => activities.get('retroOutlookLocate')!;
const linkRelated = () => activities.get('retroLinkRelated')!;

beforeEach(() => {
  vi.clearAllMocks();
  gates.retroCase.mockReturnValue(true);
  gates.boxApi.mockReturnValue(true);
  gates.boxFolderAtIntake.mockReturnValue(true);
  gates.retroBoxArchiveRootIds.mockReturnValue('');
  gates.retroOutlookSearch.mockReturnValue(false);
  gates.retroRelatedIngest.mockReturnValue(false);
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

/* ============================================================
   PR-review fix (3×P1) — retroOutlookLocate provider corroboration
   ============================================================ */
describe('retroOutlookLocate — weak-key provider corroboration (PR-review 3×P1)', () => {
  const MAILBOXES = [{ mailbox: 'info@ce.test' }];
  const CORPUS = {
    providers: [
      { workProviderId: 'wp-pch', principalCode: 'PCH', knownEmailDomains: ['pch-ltd.com'], active: true },
      { workProviderId: 'wp-rival', principalCode: 'RVL', knownEmailDomains: ['rival.com'], active: true },
    ],
    imageSources: [],
  };
  const TRIGGER = { senderAddress: 'sender@pch-ltd.com', providerId: 'wp-pch' };
  const hit = (over: Partial<{ id: string; subject: string; receivedDateTime: string; from: string; hasAttachments: boolean }>) => ({
    id: over.id ?? 'm-1',
    subject: over.subject ?? 'KA08XTR',
    receivedDateTime: over.receivedDateTime ?? '2026-01-01T00:00:00Z',
    from: over.from ?? 'claims@pch-ltd.com',
    hasAttachments: over.hasAttachments ?? false,
  });

  beforeEach(() => {
    gates.retroOutlookSearch.mockReturnValue(true);
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    dataApi.providerMatchRecords.mockResolvedValue(CORPUS);
  });

  it('a WEAK-key (vrm) candidate from ANOTHER provider is dropped before ranking; the corroborated one wins (ONE corpus load)', async () => {
    // The rival hit would out-rank the genuine one (attachments beat none) — gating
    // must drop it BEFORE the ranked pick.
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'm-rival', from: 'claims@rival.com', hasAttachments: true }),
      hit({ id: 'm-pch', from: 'claims@pch-ltd.com', hasAttachments: false }),
    ]);
    const result = (await outlookLocate()(
      { keys: { vrm: 'KA08XTR' }, trigger: TRIGGER } as never,
      ctx,
    )) as { found?: boolean; messageId?: string; matchedKey?: string; providerCorroboration?: string };
    expect(result).toMatchObject({ found: true, messageId: 'm-pch', matchedKey: 'vrm' });
    // vrm is a weak rung, not external_ref — no providerCorroboration field surfaces.
    expect(result.providerCorroboration).toBeUndefined();
    // ONE corpus load per invocation despite two variants having candidates.
    expect(dataApi.providerMatchRecords).toHaveBeenCalledTimes(1);
  });

  it('an UNKNOWN trigger identity drops ALL weak candidates (fail-closed, logged, no corpus load)', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'm-rival', from: 'claims@rival.com', hasAttachments: true }),
      hit({ id: 'm-pch', from: 'claims@pch-ltd.com' }),
    ]);
    const result = await outlookLocate()({ keys: { vrm: 'KA08XTR' } } as never, ctx);
    expect(result).toEqual({ found: false });
    expect(dataApi.providerMatchRecords).not.toHaveBeenCalled();
    expect(ctxLog().mock.calls.some(([line]) => String(line).includes('weak_key_uncorroborated'))).toBe(true);
  });

  it('external_ref drops only a POSITIVE mismatch; an unresolvable sender passes through with providerCorroboration unknown', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'm-rival', subject: 'REF-123', from: 'claims@rival.com', hasAttachments: true }),
      hit({ id: 'm-stranger', subject: 'REF-123', from: 'someone@nowhere.test' }),
    ]);
    const result = (await outlookLocate()(
      { keys: { externalRef: 'REF-123' }, trigger: TRIGGER } as never,
      ctx,
    )) as { found?: boolean; messageId?: string; providerCorroboration?: string };
    expect(result).toMatchObject({
      found: true,
      messageId: 'm-stranger',
      matchedKey: 'external_ref',
      providerCorroboration: 'unknown',
    });
  });

  it('external_ref surfaces an AGREED corroboration on the pick', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'm-pch', subject: 'REF-123', from: 'claims@pch-ltd.com', hasAttachments: true }),
    ]);
    const result = (await outlookLocate()(
      { keys: { externalRef: 'REF-123' }, trigger: TRIGGER } as never,
      ctx,
    )) as { providerCorroboration?: string };
    expect(result.providerCorroboration).toBe('agreed');
  });
});

/* ============================================================
   PR-review fixes — retroLinkRelated weak-subject gating + robustness
   ============================================================ */
describe('retroLinkRelated — weak-subject corroboration, per-candidate salvage, no pre-cap (PR-review)', () => {
  const MAILBOXES = [{ mailbox: 'info@ce.test' }];
  const CORPUS = {
    providers: [
      { workProviderId: 'wp-pch', principalCode: 'PCH', knownEmailDomains: ['pch-ltd.com'], active: true },
    ],
    imageSources: [],
  };
  const TRIGGER = { senderAddress: 'sender@pch-ltd.com', providerId: 'wp-pch' };
  const KEYS = { externalRef: 'REF-123', vrm: 'KA08XTR' };
  const hit = (over: Partial<{ id: string; subject: string; from: string }>) => ({
    id: over.id ?? 'h-1',
    subject: over.subject ?? 'RE: REF-123',
    receivedDateTime: '2026-01-01T00:00:00Z',
    from: over.from ?? 'claims@pch-ltd.com',
    hasAttachments: false,
  });

  beforeEach(() => {
    gates.retroOutlookSearch.mockReturnValue(true);
    subs.intakeMailboxes.mockReturnValue(MAILBOXES);
    dataApi.providerMatchRecords.mockResolvedValue(CORPUS);
    graph.getMessageIdentity.mockImplementation(async (_mailbox: string, id: string) => ({
      internetMessageId: `<${id}@x>`,
      subject: 's',
      from: 'f@x.test',
      receivedDateTime: '2026-01-01T00:00:00Z',
    }));
    dataApi.retroLinkRelated.mockResolvedValue({ linked: 1, skipped: 0 });
  });

  it('weak-subject-only third-party mail is SKIPPED and counted; own-mailbox, provider-agreed and ref-subject mail is kept', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'h-ref', subject: 'RE: REF-123 update', from: 'claims@rival.com' }), // strong subject — kept
      hit({ id: 'h-third', subject: 'KA08XTR photos', from: 'third@party.test' }), // weak-only 3rd party — skipped
      hit({ id: 'h-own', subject: 'KA08XTR chaser', from: 'info@ce.test' }), // weak-only, OWN mailbox — kept
      hit({ id: 'h-prov', subject: 'KA08XTR docs', from: 'claims@pch-ltd.com' }), // weak-only, provider agrees — kept
    ]);
    const result = (await linkRelated()(
      { caseId: 'case-1', keys: KEYS, trigger: TRIGGER } as never,
      ctx,
    )) as { weakUncorroborated?: number };
    expect(result.weakUncorroborated).toBe(1);
    const rows = dataApi.retroLinkRelated.mock.calls[0][0].rows as Array<{ internetMessageId: string }>;
    expect(rows.map((r) => r.internetMessageId)).toEqual(['<h-ref@x>', '<h-own@x>', '<h-prov@x>']);
    expect(ctxLog().mock.calls.some(([line]) => String(line).includes('weak_key_uncorroborated'))).toBe(true);
    // The related sweep now passes the truncation callback (the locate sweep's idiom).
    expect(graph.searchMessages).toHaveBeenCalledWith('info@ce.test', 'REF-123', 50, expect.any(Function));
  });

  it('an UNKNOWN trigger identity fails third-party weak-only candidates closed (own-mailbox mail still links)', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'h-own', subject: 'KA08XTR chaser', from: 'info@ce.test' }),
      hit({ id: 'h-prov', subject: 'KA08XTR docs', from: 'claims@pch-ltd.com' }),
    ]);
    const result = (await linkRelated()(
      { caseId: 'case-1', keys: KEYS } as never,
      ctx,
    )) as { weakUncorroborated?: number };
    expect(result.weakUncorroborated).toBe(1);
    const rows = dataApi.retroLinkRelated.mock.calls[0][0].rows as Array<{ internetMessageId: string }>;
    expect(rows.map((r) => r.internetMessageId)).toEqual(['<h-own@x>']);
  });

  it('one FAILED identity read no longer discards the accumulated rows (per-candidate salvage)', async () => {
    graph.searchMessages.mockResolvedValue([
      hit({ id: 'h-1', subject: 'REF-123 a' }),
      hit({ id: 'h-2', subject: 'REF-123 b' }),
      hit({ id: 'h-3', subject: 'REF-123 c' }),
    ]);
    graph.getMessageIdentity
      .mockRejectedValueOnce(new Error('graph 429'))
      .mockImplementation(async (_mailbox: string, id: string) => ({
        internetMessageId: `<${id}@x>`,
        subject: 's',
        from: 'f@x.test',
        receivedDateTime: '2026-01-01T00:00:00Z',
      }));
    await linkRelated()({ caseId: 'case-1', keys: KEYS, trigger: TRIGGER } as never, ctx);
    const rows = dataApi.retroLinkRelated.mock.calls[0][0].rows as Array<{ internetMessageId: string }>;
    expect(rows.map((r) => r.internetMessageId)).toEqual(['<h-2@x>', '<h-3@x>']);
    expect(ctxWarn().mock.calls.some(([line]) => String(line).includes('identity read failed'))).toBe(true);
  });

  it('NO activity-side pre-cap: all corroborated rows go to the route; the route cap surfaces as skippedByCap', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      hit({ id: `h-${i + 1}`, subject: `REF-123 item ${i + 1}` }),
    );
    graph.searchMessages.mockResolvedValue(many);
    dataApi.retroLinkRelated.mockResolvedValue({ linked: 25, skipped: 0, skippedByCap: 5 });
    const result = (await linkRelated()(
      { caseId: 'case-1', keys: KEYS, trigger: TRIGGER } as never,
      ctx,
    )) as { linked?: number; skippedByCap?: number };
    const rows = dataApi.retroLinkRelated.mock.calls[0][0].rows as unknown[];
    expect(rows).toHaveLength(30); // pre-fix this was sliced to 25 before identity resolution
    expect(result.skippedByCap).toBe(5);
    expect(result.linked).toBe(25);
  });
});
