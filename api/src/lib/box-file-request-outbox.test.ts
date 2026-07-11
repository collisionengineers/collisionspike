import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), q: vi.fn() }));
vi.mock('./db.js', () => ({ query: db.query, tx: db.tx }));
const locks = vi.hoisted(() => ({ lock: vi.fn() }));
vi.mock('./case-mutation-locks.js', () => ({ lockCaseForMutation: locks.lock }));
const box = vi.hoisted(() => ({ copy: vi.fn() }));
vi.mock('./functions-client.js', () => ({ callBoxCopyFileRequest: box.copy }));

import {
  normalizeBoxFileRequestCopy,
  processBoxFileRequestIntent,
  requestBoxFileRequestIntent,
} from './box-file-request-outbox.js';

const CASE_ID = '11111111-1111-4111-8111-111111111111';
let caseRow: Record<string, unknown>;
let outbox: Record<string, unknown> | undefined;

beforeEach(() => {
  caseRow = {
    box_folder_id: 'folder-1',
    box_file_request_id: null,
    box_file_request_url: null,
  };
  outbox = undefined;
  box.copy.mockReset();
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
    if (/SET box_file_request_id = \$2/i.test(sql)) {
      caseRow.box_file_request_id = params[1];
      caseRow.box_file_request_url = params[2];
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

describe('Box File Request durable outbox', () => {
  it('normalizes documented relative public links and rejects hostile/non-file-request URLs', () => {
    expect(normalizeBoxFileRequestCopy({ id: '9001', url: '/f/public-token' })).toEqual({
      id: '9001',
      url: 'https://app.box.com/f/public-token',
    });
    expect(normalizeBoxFileRequestCopy({ id: '9001', url: 'https://evil.example/f/token' })).toBeUndefined();
    expect(normalizeBoxFileRequestCopy({ id: '9001', url: 'https://app.box.com/folder/1' })).toBeUndefined();
  });

  it('keeps repeated clicks on the same pending generation', async () => {
    expect(await requestBoxFileRequestIntent(db.q, CASE_ID, 'folder-1', 'template-1')).toEqual({
      generation: 1,
      alreadyCompleted: false,
    });
    expect(await requestBoxFileRequestIntent(db.q, CASE_ID, 'folder-1', 'template-1')).toEqual({
      generation: 1,
      alreadyCompleted: false,
    });
    expect(outbox?.requested_generation).toBe(1);
  });

  it('stamps a relative Box response and completes the generation atomically', async () => {
    await requestBoxFileRequestIntent(db.q, CASE_ID, 'folder-1', 'template-1');
    box.copy.mockResolvedValue({ id: '9001', url: '/f/public-token' });
    await expect(processBoxFileRequestIntent(CASE_ID, 'staff')).resolves.toEqual({
      kind: 'ok', fileRequestUrl: 'https://app.box.com/f/public-token', reused: false,
    });
    expect(caseRow.box_file_request_id).toBe('9001');
    expect(outbox?.completed_generation).toBe(1);
  });

  it('leaves a failed remote call pending and replayable', async () => {
    await requestBoxFileRequestIntent(db.q, CASE_ID, 'folder-1', 'template-1');
    box.copy.mockRejectedValueOnce(new Error('timed out'));
    await expect(processBoxFileRequestIntent(CASE_ID)).resolves.toMatchObject({ kind: 'pending' });
    expect(caseRow.box_file_request_id).toBeNull();
    expect(outbox).toMatchObject({ requested_generation: 1, completed_generation: 0, claim_token: null });
    box.copy.mockResolvedValueOnce({ id: '9001', url: '/f/replayed-token' });
    await expect(processBoxFileRequestIntent(CASE_ID)).resolves.toMatchObject({ kind: 'ok' });
    expect(caseRow.box_file_request_url).toBe('https://app.box.com/f/replayed-token');
  });

  it('does no remote work for a retired merged case', async () => {
    locks.lock.mockResolvedValueOnce({ kind: 'retired', caseId: CASE_ID, mergedInto: 'target-case' });
    await expect(processBoxFileRequestIntent(CASE_ID)).resolves.toEqual({
      kind: 'retired', mergedInto: 'target-case',
    });
    expect(box.copy).not.toHaveBeenCalled();
  });
});
