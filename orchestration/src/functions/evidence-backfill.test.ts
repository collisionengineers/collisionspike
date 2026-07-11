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

/* ---- image classifier: controllable double ---- */
const imageClassify = vi.hoisted(() => ({
  classifyImage: vi.fn(async (_input?: unknown) => null),
  classificationToEvidenceFields: vi.fn(),
}));
vi.mock('../lib/image-classify.js', () => imageClassify);

/* ---- data API: recording doubles + a call-order journal ---- */
const order = vi.hoisted(() => [] as string[]);
const dataApiMock = vi.hoisted(() => ({
  persistEvidence: vi.fn(async (_caseId: string, _rows: unknown[], _options?: { expectedInboundEmailId?: string }) => {
    order.push('persist');
    return { persisted: 2, merged: 0, statusGeneration: 7 };
  }),
  evaluateStatus: vi.fn(async (_caseId: string, _generation?: number) => {
    order.push('status');
    return { value: 'needs_review', completed: true, pending: false };
  }),
  reportEvidenceBackfill: vi.fn(async (_id: string, p: { outcome: string }) => {
    order.push(`report:${p.outcome}`);
  }),
  validateEvidenceBackfillTarget: vi.fn(async (_inboundEmailId: string, targetCaseId: string) => ({ targetCaseId })),
  casesLookup: vi.fn(async (_payload: { caseIds?: string[] }) => ({
    cases: [] as Array<{ caseId: string; casePo: string; status: string; workProviderId: string; vrm: string }>,
  })),
  workProviderAiAllowed: vi.fn(async (_providerId: string): Promise<{ aiAllowed: boolean | null }> => ({ aiAllowed: null })),
  recordAudit: vi.fn(async () => {}),
  reportOutlookMove: vi.fn(async () => {}),
}));
vi.mock('../lib/data-api.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/data-api.js')>();
  return { ...actual, dataApi: dataApiMock };
});

const backfillModule = await import('./evidence-backfill.js'); // registers the queue handler
const backfill = queueRegs.get('evidence-backfill')!;
const { locateBySubjectSearch } = backfillModule;
const {
  EvidenceBackfillReclassificationRequiredError,
  EvidenceBackfillTargetChangedError,
} = await import('../lib/data-api.js');

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
  for (const fn of Object.values(dataApiMock)) fn.mockReset();
  for (const fn of Object.values(imageClassify)) fn.mockReset();
  blob.uploadEvidenceBytes.mockClear();
  dataApiMock.persistEvidence.mockImplementation(async () => {
    order.push('persist');
    return { persisted: 2, merged: 0, statusGeneration: 7 };
  });
  dataApiMock.evaluateStatus.mockImplementation(async () => {
    order.push('status');
    return { value: 'needs_review', completed: true, pending: false };
  });
  dataApiMock.reportEvidenceBackfill.mockImplementation(async (_id: string, p: { outcome: string }) => {
    order.push(`report:${p.outcome}`);
  });
  dataApiMock.validateEvidenceBackfillTarget.mockImplementation(async (_id: string, targetCaseId: string) => ({
    targetCaseId,
  }));
  dataApiMock.casesLookup.mockResolvedValue({ cases: [] });
  dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed: null });
  imageClassify.classifyImage.mockResolvedValue(null);
});
afterEach(() => {
  delete process.env.RETRO_OUTLOOK_SEARCH_ENABLED;
  delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
  delete process.env.AI_MODEL_ENDPOINT;
  delete process.env.AI_MODEL_DEPLOYMENT;
});

describe('evidence-backfill — (a) happy path drives the existing persist chain', () => {
  it('resolve → land (sha256 on every row) → persist → status AFTER persist → report completed', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g-current', parentFolderId: 'f1' });
    graph.getMessageWithAttachments.mockResolvedValue({
      message: { id: 'g-current', internetMessageId: JOB.sourceMessageId },
      attachments: [A_PHOTO],
      attachmentFailures: [],
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
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-target', 7);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith('ie-1', {
      outcome: 'completed',
      targetCaseId: 'case-target',
      persisted: 2,
      merged: 0,
    });
  });
});

describe('evidence-backfill — (b) note-on-terminal-failure', () => {
  it('message not found is retried until the final dequeue, then reports failed', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/no exact match/i);
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();

    await backfill.handler(JSON.stringify(JOB), ctxAt(5));
    expect(graph.findMessageByInternetMessageId).toHaveBeenCalledTimes(2);
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

  it('a moved-message 404 is retried with a fresh resolver pass, then fails only on the final dequeue', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g-stale', parentFolderId: 'f' });
    graph.getMessageWithAttachments.mockRejectedValue(
      new Error('graph GET /users/x/messages/g-stale → 404: not found'),
    );

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/404/);
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
    await backfill.handler(JSON.stringify(JOB), ctxAt(5));

    expect(graph.findMessageByInternetMessageId).toHaveBeenCalledTimes(2);
    expect(graph.getMessageWithAttachments).toHaveBeenCalledTimes(2);
    expect(dataApiMock.reportEvidenceBackfill.mock.calls[0][1]).toMatchObject({ outcome: 'failed' });
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

describe('evidence-backfill — pre-persist storage landing failures', () => {
  it('retries a raw-email Blob ServerBusy response without reporting a terminal failure', async () => {
    arrangeFetch();
    blob.uploadEvidenceBytes
      .mockResolvedValueOnce({
        blobPath: 'g1/attachment-photo.jpg',
        size: 3,
        sha256: 'f'.repeat(64),
      })
      .mockRejectedValueOnce(Object.assign(new Error('storage is busy'), { code: 'ServerBusy' }));

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/storage is busy/i);

    expect(blob.uploadEvidenceBytes).toHaveBeenCalledTimes(2);
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('retries a storage 503 until the final dequeue, then honestly reports failed', async () => {
    arrangeFetch();
    const unavailable = () => Object.assign(new Error('storage unavailable'), { statusCode: 503 });
    blob.uploadEvidenceBytes
      .mockRejectedValueOnce(unavailable())
      .mockRejectedValueOnce(unavailable());

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/storage unavailable/i);
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();

    await backfill.handler(JSON.stringify(JOB), ctxAt(5));

    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(dataApiMock.reportEvidenceBackfill.mock.calls[0][1]).toMatchObject({
      outcome: 'failed',
      detail: expect.stringMatching(/storage unavailable/i),
    });
  });

  it('reports a terminal storage 4xx immediately instead of retrying', async () => {
    arrangeFetch();
    blob.uploadEvidenceBytes.mockRejectedValueOnce(
      Object.assign(new Error('storage authorization failed'), {
        statusCode: 403,
        code: 'AuthorizationFailure',
      }),
    );

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));

    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(dataApiMock.reportEvidenceBackfill.mock.calls[0][1]).toMatchObject({
      outcome: 'failed',
      detail: expect.stringMatching(/storage authorization failed/i),
    });
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
      attachmentFailures: [],
    });
    graph.getMessageRawMime.mockResolvedValue(Buffer.from('raw'));

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));

    expect(graph.searchMessages).toHaveBeenCalledTimes(1);
    // The fetch targeted the CORROBORATED candidate, never the subject-only hit.
    expect(graph.getMessageWithAttachments).toHaveBeenCalledWith(JOB.sourceMailbox, 'match-1');
    expect(order).toEqual(['persist', 'status', 'report:completed']);
  });

  it('503 candidate + only mismatches rethrows so the queue retries', async () => {
    process.env.RETRO_OUTLOOK_SEARCH_ENABLED = 'true';
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    graph.searchMessages.mockResolvedValue([
      { id: 'transient-1', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
      { id: 'noise-2', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
    ]);
    graph.graphFetch.mockImplementation(async (path: string) => {
      if (path.includes('transient-1')) throw new Error('graph GET candidate → 503: unavailable');
      return { internetMessageId: '<other@x>' };
    });

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/503/);
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('a later exact match wins even after an earlier retryable candidate failure', async () => {
    process.env.RETRO_OUTLOOK_SEARCH_ENABLED = 'true';
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    graph.searchMessages.mockResolvedValue([
      { id: 'transient-1', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
      { id: 'match-2', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
    ]);
    graph.graphFetch.mockImplementation(async (path: string) => {
      if (path.includes('transient-1')) throw new Error('graph GET candidate → 503: unavailable');
      return { internetMessageId: JOB.sourceMessageId };
    });
    graph.getMessageWithAttachments.mockResolvedValue({
      message: { id: 'match-2', internetMessageId: JOB.sourceMessageId },
      attachments: [A_PHOTO],
      attachmentFailures: [],
    });
    graph.getMessageRawMime.mockResolvedValue(Buffer.from('raw'));

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(graph.getMessageWithAttachments).toHaveBeenCalledWith(JOB.sourceMailbox, 'match-2');
    expect(order).toEqual(['persist', 'status', 'report:completed']);
  });

  it('corroborates an exact Internet-Message-Id at overall search position 26', async () => {
    const hits = Array.from({ length: 26 }, (_unused, i) => ({
      id: i === 25 ? 'match-26' : `noise-${i + 1}`,
      subject: JOB.subject,
      receivedDateTime: '',
      from: 'a@b.c',
      hasAttachments: true,
    }));
    graph.searchMessages.mockResolvedValue(hits);
    graph.graphFetch.mockImplementation(async (path: string) => ({
      internetMessageId: path.includes('match-26') ? JOB.sourceMessageId : '<other@x>',
    }));

    await expect(
      locateBySubjectSearch(JOB.sourceMailbox, String(JOB.subject), JOB.sourceMessageId),
    ).resolves.toBe('match-26');
    expect(graph.searchMessages).toHaveBeenCalledWith(
      JOB.sourceMailbox,
      expect.any(String),
      100,
    );
    expect(graph.graphFetch).toHaveBeenCalledTimes(26);
  });

  it('404-only candidates are terminal misses, not retryable errors', async () => {
    graph.searchMessages.mockResolvedValue([
      { id: 'gone-1', subject: JOB.subject, receivedDateTime: '', from: 'a@b.c', hasAttachments: true },
    ]);
    graph.graphFetch.mockRejectedValue(new Error('graph GET candidate → 404: not found'));
    await expect(
      locateBySubjectSearch(JOB.sourceMailbox, String(JOB.subject), JOB.sourceMessageId),
    ).resolves.toBeNull();
  });

  it('gate OFF → no $search; a $filter miss still retries resolver until the final dequeue', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/no exact match/i);
    expect(graph.searchMessages).not.toHaveBeenCalled();
    await backfill.handler(JSON.stringify(JOB), ctxAt(5));
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

function arrangeFetch(
  attachments = [A_PHOTO],
  attachmentFailures: Array<{ id: string; name: string; contentType: string; reason: string }> = [],
): void {
  graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g1', parentFolderId: 'f' });
  graph.getMessageWithAttachments.mockResolvedValue({
    message: { id: 'g1', internetMessageId: JOB.sourceMessageId },
    attachments,
    attachmentFailures,
  });
  graph.getMessageRawMime.mockResolvedValue(Buffer.from('raw'));
}

describe('evidence-backfill — target, attachment and policy safety', () => {
  it('drops a stale target before Graph, persistence or reporting', async () => {
    dataApiMock.validateEvidenceBackfillTarget.mockRejectedValue(
      new EvidenceBackfillTargetChangedError('target changed'),
    );
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(graph.findMessageByInternetMessageId).not.toHaveBeenCalled();
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('merge-first: uses the API-verified survivor for persistence, status and reporting', async () => {
    arrangeFetch();
    dataApiMock.validateEvidenceBackfillTarget.mockResolvedValue({ targetCaseId: 'case-survivor' });
    dataApiMock.persistEvidence.mockImplementation(async () => {
      order.push('persist');
      return { persisted: 2, merged: 0, targetCaseId: 'case-survivor', statusGeneration: 7 };
    });

    await backfill.handler(JSON.stringify(JOB), ctxAt(1));

    expect(dataApiMock.persistEvidence).toHaveBeenCalledWith(
      'case-survivor',
      expect.any(Array),
      { expectedInboundEmailId: 'ie-1' },
    );
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-survivor', 7);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ targetCaseId: 'case-survivor', outcome: 'completed' }),
    );
  });

  it('drops a detach/relink race rejected by guarded persistence without status or reporting', async () => {
    arrangeFetch();
    dataApiMock.persistEvidence.mockRejectedValue(
      new EvidenceBackfillTargetChangedError('target changed under lock'),
    );
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(dataApiMock.evaluateStatus).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('retries a merge-time persistence redirect and reloads survivor policy/VRM before reclassification', async () => {
    process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'vision';
    arrangeFetch();
    dataApiMock.validateEvidenceBackfillTarget
      .mockResolvedValueOnce({ targetCaseId: 'case-old' })
      .mockResolvedValueOnce({ targetCaseId: 'case-survivor' });
    dataApiMock.casesLookup.mockImplementation(async (payload: { caseIds?: string[] }) => {
      const id = payload.caseIds?.[0] ?? '';
      return {
        cases: [{
          caseId: id,
          casePo: id === 'case-old' ? 'OLD26001' : 'NEW26001',
          status: 'needs_review',
          workProviderId: id === 'case-old' ? 'wp-old' : 'wp-survivor',
          vrm: id === 'case-old' ? 'OLDVRM' : 'NEWVRM',
        }],
      };
    });
    dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed: true });
    imageClassify.classifyImage.mockResolvedValue({ role: 'overview' } as never);
    imageClassify.classificationToEvidenceFields.mockReturnValue({
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      excluded: false,
      exclusionReason: null,
      personReflection: false,
    });
    dataApiMock.persistEvidence
      .mockRejectedValueOnce(new EvidenceBackfillReclassificationRequiredError(
        'merged while classifying',
        'case-survivor',
      ))
      .mockImplementationOnce(async () => {
        order.push('persist');
        return { persisted: 2, merged: 0, statusGeneration: 9 };
      });

    await expect(
      backfill.handler(JSON.stringify({ ...JOB, targetCaseId: 'case-old' }), ctxAt(1)),
    ).rejects.toBeInstanceOf(EvidenceBackfillReclassificationRequiredError);
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();

    await backfill.handler(JSON.stringify({ ...JOB, targetCaseId: 'case-old' }), ctxAt(2));

    expect(dataApiMock.casesLookup.mock.calls.map(([payload]) => payload.caseIds?.[0]))
      .toEqual(['case-old', 'case-survivor']);
    expect(imageClassify.classifyImage.mock.calls.map(
      ([input]) => (input as { caseVrm?: string }).caseVrm,
    ))
      .toEqual(['OLDVRM', 'NEWVRM']);
    expect(dataApiMock.persistEvidence.mock.calls.map(([caseId]) => caseId))
      .toEqual(['case-old', 'case-survivor']);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-survivor', 9);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'completed', targetCaseId: 'case-survivor' }),
    );
  });

  it('uses attachment identity in Blob keys while retaining equal display filenames', async () => {
    arrangeFetch([
      A_PHOTO,
      { ...A_PHOTO, id: 'att-2', contentBytes: Buffer.from('xyz').toString('base64') },
    ]);
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    const uploads = blob.uploadEvidenceBytes.mock.calls.slice(0, 2);
    expect(uploads[0][1]).not.toBe(uploads[1][1]);
    expect(uploads[0][1]).toMatch(/^attachment-[0-9a-f]{64}-photo\.jpg$/);
    const [, rows, options] = dataApiMock.persistEvidence.mock.calls[0];
    const photos = (rows as Array<{ filename: string; blobPath: string }>).filter((r) => r.filename === 'photo.jpg');
    expect(photos).toHaveLength(2);
    expect(new Set(photos.map((r) => r.blobPath)).size).toBe(2);
    expect(options).toEqual({ expectedInboundEmailId: 'ie-1' });
  });

  it('fails closed for model calls when case policy lookup fails but still persists', async () => {
    process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'vision';
    arrangeFetch();
    dataApiMock.casesLookup.mockRejectedValue(new Error('policy unavailable'));
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(imageClassify.classifyImage).not.toHaveBeenCalled();
    expect(dataApiMock.persistEvidence).toHaveBeenCalledTimes(1);
  });

  it('fails closed when the provider policy lookup fails but still persists', async () => {
    process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'vision';
    arrangeFetch();
    dataApiMock.casesLookup.mockResolvedValue({
      cases: [{ caseId: 'case-target', casePo: 'A.TEST', status: 'needs_review', workProviderId: 'wp-1', vrm: '' }],
    });
    dataApiMock.workProviderAiAllowed.mockRejectedValue(new Error('policy unavailable'));
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(imageClassify.classifyImage).not.toHaveBeenCalled();
    expect(dataApiMock.persistEvidence).toHaveBeenCalledTimes(1);
  });

  it.each([
    { aiAllowed: false, calls: 0 },
    { aiAllowed: true, calls: 1 },
    { aiAllowed: null, calls: 1 },
  ])('honours a successful provider policy lookup ($aiAllowed)', async ({ aiAllowed, calls }) => {
    process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
    process.env.AI_MODEL_ENDPOINT = 'https://model.example';
    process.env.AI_MODEL_DEPLOYMENT = 'vision';
    arrangeFetch();
    dataApiMock.casesLookup.mockResolvedValue({
      cases: [{ caseId: 'case-target', casePo: 'A.TEST', status: 'needs_review', workProviderId: 'wp-1', vrm: '' }],
    });
    dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed });
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(imageClassify.classifyImage).toHaveBeenCalledTimes(calls);
    expect(dataApiMock.persistEvidence).toHaveBeenCalledTimes(1);
  });

  it('retries a transient attachment fetch gap before landing siblings', async () => {
    arrangeFetch([A_PHOTO], [
      { id: 'att-2', name: 'other.jpg', contentType: 'image/jpeg', reason: 'graph GET attachment $value → 503: unavailable' },
    ]);
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/503/);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('retries an attachment $value 404 and reports partial only on the final dequeue', async () => {
    const failure = {
      id: 'att-gone',
      name: 'moved.pdf',
      contentType: 'application/pdf',
      reason: 'graph GET attachment $value → 404: not found',
    };
    arrangeFetch([A_PHOTO], [failure]);

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/404/);
    expect(blob.uploadEvidenceBytes).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();

    await backfill.handler(JSON.stringify(JOB), ctxAt(5));
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'partial', failedAttachments: 1 }),
    );
  });

  it('retries a null/missing attachment identity before reporting the final gap', async () => {
    arrangeFetch([], [{
      id: '',
      name: 'photo.jpg',
      contentType: 'image/jpeg',
      reason: 'attachment identity missing',
    }]);
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(
      /attachment identity missing/i,
    );
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
    await backfill.handler(JSON.stringify(JOB), ctxAt(5));
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'partial', failedAttachments: 1 }),
    );
  });

  it('retries attachment pagination failures instead of accepting a truncated page', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue({ id: 'g1', parentFolderId: 'f' });
    graph.getMessageWithAttachments.mockRejectedValue(
      new Error('graph attachment pagination cycle at page-2'),
    );
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/pagination cycle/);
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    expect(dataApiMock.reportEvidenceBackfill).not.toHaveBeenCalled();
  });

  it('retries raw MIME null/404, then records a final-attempt gap as partial rather than completed', async () => {
    arrangeFetch();
    graph.getMessageRawMime.mockResolvedValueOnce(null).mockRejectedValueOnce(
      new Error('graph GET message $value → 404: not found'),
    );

    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(1))).rejects.toThrow(/raw MIME response was empty/i);
    expect(dataApiMock.persistEvidence).not.toHaveBeenCalled();
    await backfill.handler(JSON.stringify(JOB), ctxAt(5));

    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'partial', failedAttachments: 1 }),
    );
    expect(
      dataApiMock.reportEvidenceBackfill.mock.calls.some(([, payload]) => payload.outcome === 'completed'),
    ).toBe(false);
  });

  it('persists landed siblings and reports partial, never completed, for a terminal gap', async () => {
    arrangeFetch([A_PHOTO], [
      { id: 'att-2', name: 'other.jpg', contentType: 'image/jpeg', reason: 'graph GET attachment $value → 403: denied' },
    ]);
    await backfill.handler(JSON.stringify(JOB), ctxAt(1));
    expect(order).toEqual(['persist', 'status', 'report:partial']);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'partial', failedAttachments: 1 }),
    );
  });
});

describe('evidence-backfill — committed phase and terminal reporting', () => {
  it('requires the atomic evaluate response to acknowledge the returned generation', async () => {
    arrangeFetch();
    dataApiMock.evaluateStatus.mockImplementation(async () => {
      order.push('status');
      return { value: 'needs_review', completed: false, pending: true };
    });
    const ctx = ctxAt(1);
    await backfill.handler(JSON.stringify(JOB), ctx);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-target', 7);
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringMatching(/evaluated but not acknowledged/i));
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'completed' }),
    );
  });

  it('keeps committed evidence successful when immediate status evaluation fails, leaving generation pending', async () => {
    arrangeFetch();
    dataApiMock.evaluateStatus.mockRejectedValue(new Error('data-api POST status → 400'));
    const ctx = ctxAt(5);
    await backfill.handler(JSON.stringify(JOB), ctx);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-target', 7);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledWith(
      'ie-1',
      expect.objectContaining({ outcome: 'completed' }),
    );
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringMatching(/evidence committed.*remains pending/i));
  });

  it('rethrows completion-report failure without a contradictory failed report', async () => {
    arrangeFetch();
    dataApiMock.reportEvidenceBackfill.mockRejectedValue(new Error('data-api POST report → 503'));
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(5))).rejects.toThrow(/503/);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(dataApiMock.reportEvidenceBackfill.mock.calls[0][1]).toMatchObject({ outcome: 'completed' });
  });

  it('rethrows when the terminal failed-outcome report fails', async () => {
    graph.findMessageByInternetMessageId.mockResolvedValue(null);
    dataApiMock.reportEvidenceBackfill.mockRejectedValue(new Error('data-api POST report → 503'));
    await expect(backfill.handler(JSON.stringify(JOB), ctxAt(5))).rejects.toThrow(/503/);
    expect(dataApiMock.reportEvidenceBackfill).toHaveBeenCalledTimes(1);
    expect(dataApiMock.reportEvidenceBackfill.mock.calls[0][1]).toMatchObject({ outcome: 'failed' });
  });
});
