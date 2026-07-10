/**
 * orchestration/src/functions/evidence-backfill.test.ts — TKT-145 OFFLINE acceptance proof
 * for the case_link evidence-backfill queue consumer.
 *
 * No Functions host, no Graph, no storage: `@azure/functions` registration is captured,
 * `durable-functions` is stubbed (classifyPersist registers an activity at import for its
 * shared buildBaseEvidenceRows), and graph/blob/data-api are controllable doubles.
 *
 * Pins:
 *   (a) HAPPY PATH — resolve → fetch → land (sha256 on every row, so the evidence route's
 *       TKT-133 (case_id, sha256) dedup makes replays/double-accepts safe) → persist →
 *       STATUS RECOMPUTE AFTER PERSIST (the acceptance's second line) → report completed;
 *   (b) NOTE-ON-TERMINAL-FAILURE — message not found → report `failed` (the Data API
 *       writes the "Attachments to add" note), never a throw/poison-loop;
 *   (c) retryable-vs-terminal split — a transient Graph 5xx rethrows for redelivery
 *       (report NOT called) until the LAST attempt, which reports `failed` instead;
 *   (d) the $search fallback (RETRO_OUTLOOK_SEARCH_ENABLED) corroborates candidates on the
 *       exact internetMessageId — a subject hit with the wrong id is never used;
 *   (e) a malformed job is dropped (logged, no report, no throw).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { InvocationContext } from '@azure/functions';

/* ---- @azure/functions: capture storage-queue registrations (no Functions host) ---- */
interface QueueReg {
  queueName: string;
  handler: (item: unknown, ctx: InvocationContext) => Promise<void>;
}
const queueRegs = vi.hoisted(() => new Map<string, QueueReg>());
vi.mock('@azure/functions', () => ({
  app: {
    storageQueue: (name: string, opts: QueueReg) => {
      queueRegs.set(name, opts);
    },
    http: () => {},
    timer: () => {},
  },
}));

/* ---- durable-functions: classifyPersist (imported for buildBaseEvidenceRows) registers
        an activity at module scope — stub the registration surface ---- */
vi.mock('durable-functions', () => ({
  app: { activity: () => {}, orchestration: () => {} },
  input: { durableClient: () => ({}) },
  getClient: () => ({}),
  RetryOptions: class {},
}));

/* ---- graph: keep the pure helpers real (kqlPhrase/odataQuote), double the network ---- */
const graph = vi.hoisted(() => ({
  findMessageByInternetMessageId: vi.fn(),
  getMessageWithAttachments: vi.fn(),
  getMessageRawMime: vi.fn(),
  graphFetch: vi.fn(),
  searchMessages: vi.fn(),
}));
vi.mock('../lib/graph.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/graph.js')>();
  return { ...actual, ...graph };
});

/* ---- blob: deterministic landing (sha256 stamped, as the real uploader does) ---- */
const blob = vi.hoisted(() => ({
  uploadEvidenceBytes: vi.fn(async (messageId: string, filename: string, bytes: Buffer) => ({
    blobPath: `${messageId}/${filename}`,
    size: bytes.length,
    sha256: 'f'.repeat(64),
  })),
  downloadEvidenceBytes: vi.fn(),
  getEvidenceBlobSize: vi.fn(),
  deleteEvidenceBytes: vi.fn(),
}));
vi.mock('../lib/blob.js', () => blob);

/* ---- image classifier: inert double (the gate is off in this harness) ---- */
vi.mock('../lib/image-classify.js', () => ({
  classifyImage: vi.fn(async () => null),
  classificationToEvidenceFields: vi.fn(),
}));

/* ---- data API: recording doubles + a call-order journal ---- */
const order = vi.hoisted(() => [] as string[]);
const dataApiMock = vi.hoisted(() => ({
  persistEvidence: vi.fn(async () => {
    order.push('persist');
    return { persisted: 2, merged: 0 };
  }),
  evaluateStatus: vi.fn(async () => {
    order.push('status');
    return { value: 'needs_review' };
  }),
  reportEvidenceBackfill: vi.fn(async (_id: string, p: { outcome: string }) => {
    order.push(`report:${p.outcome}`);
  }),
  casesLookup: vi.fn(async () => ({ cases: [] })),
  workProviderAiAllowed: vi.fn(async () => ({ aiAllowed: null })),
  recordAudit: vi.fn(async () => {}),
  reportOutlookMove: vi.fn(async () => {}),
}));
vi.mock('../lib/data-api.js', () => ({ dataApi: dataApiMock }));

await import('./evidence-backfill.js'); // registers 'evidence-backfill' against the captured app
const backfill = queueRegs.get('evidence-backfill')!;

function ctxAt(dequeueCount: number): InvocationContext {
  return {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    triggerMetadata: { dequeueCount },
  } as unknown as InvocationContext;
}

const JOB = {
  inboundEmailId: 'ie-1',
  sourceMailbox: 'info@collisionengineers.co.uk',
  sourceMessageId: '<lead-123@tractable.ai>',
  targetCaseId: 'case-target',
  subject: 'New completed lead for Collision Engineers',
};

const A_PHOTO = {
  id: 'att-1',
  name: 'photo.jpg',
  contentType: 'image/jpeg',
  size: 3,
  contentBytes: Buffer.from('abc').toString('base64'),
};

beforeEach(() => {
  order.length = 0;
  for (const fn of Object.values(graph)) fn.mockReset();
  for (const fn of Object.values(dataApiMock)) fn.mockClear();
  blob.uploadEvidenceBytes.mockClear();
  dataApiMock.persistEvidence.mockImplementation(async () => {
    order.push('persist');
    return { persisted: 2, merged: 0 };
  });
  dataApiMock.evaluateStatus.mockImplementation(async () => {
    order.push('status');
    return { value: 'needs_review' };
  });
  dataApiMock.reportEvidenceBackfill.mockImplementation(async (_id: string, p: { outcome: string }) => {
    order.push(`report:${p.outcome}`);
  });
});
afterEach(() => {
  delete process.env.RETRO_OUTLOOK_SEARCH_ENABLED;
});

describe('evidence-backfill — (a) happy path drives the existing persist chain', () => {
  it('resolve → land (sha256 on every row) → persist → status AFTER persist → report completed', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g-current', parentFolderId: 'f1' });
    graph.getMessageWithAttachments.mockResolvedValue({
      message: { id: 'g-current', internetMessageId: JOB.sourceMessageId },
      attachments: [A_PHOTO],
    });
    graph.getMessageRawMime.mockResolvedValue(Buffer.from('raw-mime'));

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));

    // Landed under the CURRENT Graph id; the .eml captured too.
    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(2);
    expect(blob.uploadEvidenceBytes.mock.calls[0][0]).toBe('g-current');

    // Persisted onto the TARGET case, every row sha256-stamped (the TKT-133 dedup key —
    // this is what makes a queue replay / double-accept produce ZERO duplicate rows).
    expect(dataApiMock.persistEvidence).toHaveBeenCalledTimes(1);
    const [caseId, rows] = dataApiMock.persistEvidence.mock.calls[0] as unknown as [
      string,
      Array<{ sha256?: string; evidenceClass: string }>,
    ];
    expect(caseId).toBe('case-target');
    expect(rows.length).toBe(2); // the photo + the raw .eml
    for (const r of rows) expect(r.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(rows.some((r) => r.evidenceClass === 'image')).toBe(true);
    expect(rows.some((r) => r.evidenceClass === 'email')).toBe(true);

    // The acceptance's second line: the status recompute runs AFTER the backfill persist.
    expect(order).toEqual(['persist', 'status', 'report:completed']);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith('ie-1', {
      outcome: 'completed',
      targetCaseId: 'case-target',
      persisted: 2,
      merged: 0,
    });
  });
});

describe('evidence-backfill — (b) note-on-terminal-failure', () => {
  it('message not found (no fallback gate) → report failed; NO throw, NO persist', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    const ctx = ctxAt(1);
    await backfill.handler(JSON.stringify(JOB), ctx); // must not throw
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    const [, payload] = dataApiMock.reportEvidenceBackfill.mock.calls[0] as [string, { outcome: string; detail?: string }];
    expect(payload.outcome).toBe('failed');
    expect(payload.detail).toMatch(/not found/i);
  });

  it('missing mailbox provenance → terminal failed report (staff note path), no throw', async () => {
    await backfill.handler(JSON.stringify({ ...JOB, sourceMessageId: '' }), ctxAt(1));
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect((dataApiMock.reportEvidenceBackfill.mock.calls[0][1] as { outcome: string }).outcome).toBe('failed');
  });
});

describe('evidence-backfill — (c) retryable vs terminal split', () => {
  it('a transient Graph 503 RETHROWS for queue redelivery (report NOT called)', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g1', parentFolderId: 'f' });
    graph.getMessageWithAttachments.mockRejectedValue(
      new Error('graph GET /users/x/messages/g1 → 503: unavailable'),
    );
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/503/);
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('the SAME transient failure on the LAST attempt reports failed instead of poisoning silently', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g1', parentFolderId: 'f' });
    graph.getMessageWithAttachments.mockRejectedValue(
      new Error('graph GET /users/x/messages/g1 → 503: unavailable'),
    );
    await backfill.handler(JSON.stringify(JOB), ctxAt(5)); // maxDequeueCount
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect((dataApiMock.reportEvidenceBackfill.mock.calls[0][1] as { outcome: string }).outcome).toBe('failed');
  });

  it('a terminal Graph 4xx goes straight to the failed report (no retry churn)', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g1', parentFolderId: 'f' });
    graph.getMessageWithAttachments.mockRejectedValue(
      new Error('graph GET /users/x/messages/g1 → 403: Access is denied'),
    );
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect((dataApiMock.reportEvidenceBackfill.mock.calls[0][1] as { outcome: string }).outcome).toBe('failed');
  });
});

describe('evidence-backfill — (d) the $search fallback corroborates on the exact internetMessageId', () => {
  it('uses the candidate whose internetMessageId matches; ignores subject-only hits', async () => {
    process.env.RETRO_OUTLOOK_SEARCH_ENABLED = 'true';
    graph.findMessageByInternetMessageId.mockResolvedValue(null); // $filter missed
    graph.searchMessages.mockResolvedValue([
      { id: 'noise-1', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
      { id: 'match-1', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
    ]);
    graph.graphFetch.mockImplementation(async (path: string) => {
      if (path.includes('noise-1')) return { internetMessageId: '<other@x>' };
      if (path.includes('match-1')) return { internetMessageId: JOB.sourceMessageId };
      throw new Error(`unexpected graphFetch ${path}`);
    });
    graph.getMessageWithAttachments.mockResolvedValue({
      message: { id: 'match-1', internetMessageId: JOB.sourceMessageId },
      attachments: [A_PHOTO],
    });
    graph.getMessageRawMime.mockResolvedValue(Buffer.from('raw'));

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));

    expect(graph.searchMessages).toHaveBeenCalledTimes(1);
    // The fetch targeted the CORROBORATED candidate, never the subject-only hit.
    expect(graph.getMessageWithAttachments).toHaveBeenCalledWith(JOB.sourceMailbox, 'match-1');
    expect(order).toEqual(['persist', 'status', 'report:completed']);
  });

  it('gate OFF → no $search; a $filter miss is terminal', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(graph.searchMessages).not.toHaveBeenCalled();
    expect((dataApiMock.reportEvidenceBackfill.mock.calls[0][1] as { outcome: string }).outcome).toBe('failed');
  });
});

describe('evidence-backfill — (e) malformed jobs are dropped, never poison-looped', () => {
  it('no inboundEmailId/targetCaseId → logged + dropped (no report, no throw)', async () => {
    const ctx = ctxAt(1);
    await backfill.handler(JSON.stringify({ sourceMailbox: 'x@y' }), ctx);
    expect(ctx.error).toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });
});
