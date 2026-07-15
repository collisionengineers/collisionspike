import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), q: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));
const locks = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock('../cases/mutation-locks.js', () => ({ lockCaseForMutation: locks.lock }));
const box = vi.hoisted(() => ({ copy: vi.fn(), get: vi.fn(), reactivate: vi.fn() }));
vi.mock('../../platform/http/service-client.js', () => ({
  FunctionCallError: class extends Error {
    constructor(message: string, public readonly status?: number) { super(message); }
  },
  callBoxCopyFileRequest: box.copy,
  callBoxGetFileRequest: box.get,
  callBoxReactivateFileRequest: box.reactivate,
}));

import { FunctionCallError } from '../../platform/http/service-client.js';
import {
  ensureActiveBoxFileRequest,
  normalizeBoxFileRequest,
  processBoxFileRequestIntent,
  requestBoxFileRequestIntent,
} from './file-request-outbox.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
const FOLDER_ID = '398564730902';
const TEMPLATE_ID = '8001';
const future = '2026-08-13T12:00:00.000Z';

function remote(overrides: Record<string, unknown> = {}) {
  return {
    id: '9001',
    url: '/f/public-token',
    folder: { id: FOLDER_ID, type: 'folder' },
    status: 'active',
    expires_at: future,
    ...overrides,
  };
}

let caseRow: Record<string, unknown>;
let outbox: Record<string, unknown> | undefined;

beforeEach(() => {
  vi.useRealTimers();
  caseRow = {
    box_folder_id: FOLDER_ID,
    box_file_request_id: null,
    box_file_request_url: null,
  };
  outbox = undefined;
  box.copy.mockReset();
  box.get.mockReset();
  box.reactivate.mockReset();
  locks.lock.mockReset().mockResolvedValue({ kind: 'active', caseId: CASE_ID });
  db.q.mockReset();
  db.tx.mockReset().mockImplementation(async (fn: (q: typeof db.q) => unknown) => fn(db.q));
  db.q.mockImplementation(async (sql: string, params: unknown[] = []) => {
    if (/SELECT box_folder_id, box_file_request_id/i.test(sql)) return [caseRow];
    if (/SELECT \* FROM box_file_request_outbox/i.test(sql)) return outbox ? [outbox] : [];
    if (/INSERT INTO box_file_request_outbox/i.test(sql)) {
      outbox = {
        case_id: params[0], folder_id: params[1], template_id: params[2],
        requested_generation: 1, completed_generation: 0, attempt_count: 0,
        next_attempt_at: new Date(0), claim_token: null, claim_expires_at: null,
        repair_reason: params[3] ?? null,
      };
      return [];
    }
    if (/SET folder_id = \$2,[\s\S]*requested_generation = \$4/i.test(sql) && outbox) {
      outbox = {
        ...outbox,
        folder_id: params[1],
        template_id: params[2],
        requested_generation: params[3],
        attempt_count: 0,
        next_attempt_at: new Date(0),
        claim_token: null,
        claim_expires_at: null,
        repair_reason: params[4],
      };
      return [];
    }
    if (/SET claim_token = \$2/i.test(sql) && outbox) {
      outbox = {
        ...outbox,
        claim_token: params[1],
        claim_expires_at: new Date(Date.now() + 120_000),
        attempt_count: Number(outbox.attempt_count) + 1,
      };
      return [outbox];
    }
    if (/SET box_file_request_id = NULL/i.test(sql)) {
      caseRow.box_file_request_id = null;
      caseRow.box_file_request_url = null;
      return [];
    }
    if (/SET box_file_request_id = \$2/i.test(sql)) {
      caseRow.box_file_request_id = params[1];
      caseRow.box_file_request_url = params[2];
      return [];
    }
    if (/SET box_file_request_url = \$2/i.test(sql)) {
      caseRow.box_file_request_url = params[1];
      return [];
    }
    if (/SET completed_generation = \$2/i.test(sql) && outbox) {
      outbox = { ...outbox, completed_generation: params[1], claim_token: null, claim_expires_at: null };
      return [];
    }
    if (/SET next_attempt_at = now\(\) \+ make_interval/i.test(sql) && outbox) {
      outbox = { ...outbox, claim_token: null, claim_expires_at: null, next_attempt_at: new Date(0) };
      return [];
    }
    return [];
  });
});

describe('File Request validation', () => {
  it('accepts only the active HTTPS link attached to the expected folder', () => {
    expect(normalizeBoxFileRequest(remote(), FOLDER_ID, Date.parse('2026-07-13T12:00:00Z')))
      .toMatchObject({ id: '9001', active: true, folderId: FOLDER_ID });
    expect(normalizeBoxFileRequest(remote(), '999')).toBeUndefined();
    expect(normalizeBoxFileRequest(remote({ url: 'https://evil.example/f/token' }), FOLDER_ID)).toBeUndefined();
  });

  it('treats a past expiry as inactive even when the remote status has not caught up', () => {
    expect(normalizeBoxFileRequest(
      remote({ expires_at: '2026-07-12T00:00:00Z' }),
      FOLDER_ID,
      Date.parse('2026-07-13T00:00:00Z'),
    )?.active).toBe(false);
  });
});

describe('durable creation and concurrency', () => {
  it('keeps repeated clicks on one pending generation', async () => {
    expect(await requestBoxFileRequestIntent(db.q, CASE_ID, FOLDER_ID, TEMPLATE_ID))
      .toMatchObject({ generation: 1, alreadyCompleted: false });
    expect(await requestBoxFileRequestIntent(db.q, CASE_ID, FOLDER_ID, TEMPLATE_ID))
      .toMatchObject({ generation: 1, alreadyCompleted: false });
    expect(outbox?.requested_generation).toBe(1);
  });

  it('creates and stamps the first active request', async () => {
    box.copy.mockResolvedValue(remote());
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID, 'staff')).resolves.toMatchObject({
      kind: 'ok', fileRequestId: '9001', reused: false,
    });
    expect(box.copy).toHaveBeenCalledOnce();
    expect(caseRow.box_file_request_url).toBe('https://app.box.com/f/public-token');
    expect(outbox?.completed_generation).toBe(1);
  });

  it('lets one concurrent caller own the remote copy and leaves the other retryable', async () => {
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    box.copy.mockImplementation(async () => { await held; return remote(); });
    const first = ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID);
    await vi.waitFor(() => expect(box.copy).toHaveBeenCalledOnce());
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID)).resolves.toMatchObject({ kind: 'pending' });
    release();
    await expect(first).resolves.toMatchObject({ kind: 'ok' });
    expect(box.copy).toHaveBeenCalledOnce();
  });

  it('leaves a 5xx/timeout pending and replayable', async () => {
    box.copy.mockRejectedValueOnce(new FunctionCallError('Box unavailable', 503));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID)).resolves.toMatchObject({ kind: 'pending' });
    expect(caseRow.box_file_request_id).toBeNull();
    box.copy.mockResolvedValueOnce(remote());
    await expect(processBoxFileRequestIntent(CASE_ID)).resolves.toMatchObject({ kind: 'ok' });
  });

  it('returns folder_not_ready without any remote call', async () => {
    caseRow.box_folder_id = null;
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID)).resolves.toEqual({
      kind: 'folder_not_ready',
    });
    expect(box.copy).not.toHaveBeenCalled();
  });
});

describe('reuse and repair', () => {
  beforeEach(() => {
    caseRow.box_file_request_id = '9001';
    caseRow.box_file_request_url = 'https://app.box.com/f/public-token';
    outbox = {
      case_id: CASE_ID, folder_id: FOLDER_ID, template_id: TEMPLATE_ID,
      requested_generation: 1, completed_generation: 1, attempt_count: 1,
      next_attempt_at: new Date(0), claim_token: null, claim_expires_at: null,
      repair_reason: null,
    };
  });

  it('revalidates and reuses the persisted active request', async () => {
    box.get.mockResolvedValue(remote());
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID)).resolves.toMatchObject({
      kind: 'ok', reused: true, fileRequestId: '9001',
    });
    expect(box.copy).not.toHaveBeenCalled();
  });

  it.each([
    ['inactive', remote({ status: 'inactive' })],
    ['expired', remote({ expires_at: '2026-01-01T00:00:00Z' })],
  ])('reactivates an %s request and keeps one identity', async (_label, state) => {
    box.get.mockResolvedValue(state);
    box.reactivate.mockResolvedValue(remote({ expires_at: '2026-09-01T00:00:00Z' }));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID, 'staff')).resolves.toMatchObject({
      kind: 'ok', reused: true, fileRequestId: '9001',
    });
    expect(box.reactivate).toHaveBeenCalledWith('9001', FOLDER_ID);
    expect(box.copy).not.toHaveBeenCalled();
  });

  it('replaces an expired request when reactivation is terminally rejected', async () => {
    box.get.mockResolvedValue(remote({ expires_at: '2026-01-01T00:00:00Z' }));
    box.reactivate.mockRejectedValue(new FunctionCallError('cannot reactivate', 400));
    box.copy.mockResolvedValue(remote({ id: '9002', url: '/f/replacement' }));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID, 'staff')).resolves.toMatchObject({
      kind: 'ok', reused: false, fileRequestId: '9002',
    });
    expect(outbox?.requested_generation).toBe(2);
    expect(outbox?.repair_reason).toBe('reactivation_rejected');
  });

  it('replaces an inactive request when reactivation returns an inactive object', async () => {
    box.get.mockResolvedValue(remote({ status: 'inactive' }));
    box.reactivate.mockResolvedValue(remote({ status: 'inactive' }));
    box.copy.mockResolvedValue(remote({ id: '9002', url: '/f/replacement' }));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID, 'staff')).resolves.toMatchObject({
      kind: 'ok', reused: false, fileRequestId: '9002',
    });
    expect(outbox?.repair_reason).toBe('reactivation_returned_inactive');
  });

  it('replaces a deleted request with one audited outbox generation', async () => {
    box.get.mockRejectedValue(new FunctionCallError('not found', 404));
    box.copy.mockResolvedValue(remote({ id: '9002', url: '/f/replacement' }));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID, 'staff')).resolves.toMatchObject({
      kind: 'ok', reused: false, fileRequestId: '9002',
    });
    expect(outbox?.requested_generation).toBe(2);
    expect(outbox?.repair_reason).toBe('remote_request_deleted');
    expect(caseRow.box_file_request_id).toBe('9002');
  });

  it('does not replace a request on a retryable remote read failure', async () => {
    box.get.mockRejectedValue(new FunctionCallError('upstream unavailable', 503));
    await expect(ensureActiveBoxFileRequest(CASE_ID, TEMPLATE_ID)).resolves.toMatchObject({ kind: 'pending' });
    expect(box.copy).not.toHaveBeenCalled();
    expect(caseRow.box_file_request_id).toBe('9001');
  });
});
