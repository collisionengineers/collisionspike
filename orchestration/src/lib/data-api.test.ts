import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const {
  dataApi,
  DataApiHttpError,
  EvidenceBackfillReclassificationRequiredError,
  EvidenceBackfillTargetChangedError,
} = await import('./data-api.js');

beforeEach(() => {
  process.env.DATA_API_URL = 'https://api.example.test';
  process.env.DATA_API_TOKEN = 'token';
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.DATA_API_URL;
  delete process.env.DATA_API_TOKEN;
});

describe('backfill persistence conflict typing', () => {
  it('distinguishes survivor reclassification from an unrelated stale target', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'evidence_backfill_reclassification_required',
      targetCaseId: 'case-survivor',
    }), { status: 409 }));

    const reclass = await dataApi.persistEvidence(
      'case-old',
      [],
      { expectedInboundEmailId: 'ie-1' },
    ).catch((error: unknown) => error);
    expect(reclass).toBeInstanceOf(EvidenceBackfillReclassificationRequiredError);
    expect((reclass as InstanceType<typeof EvidenceBackfillReclassificationRequiredError>).targetCaseId)
      .toBe('case-survivor');

    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      code: 'evidence_backfill_target_changed',
    }), { status: 409 }));
    await expect(dataApi.persistEvidence(
      'case-old',
      [],
      { expectedInboundEmailId: 'ie-1' },
    )).rejects.toBeInstanceOf(EvidenceBackfillTargetChangedError);
  });
});

describe('generation-aware evidence backfill contract', () => {
  it('asks the API-owned outbox publisher to drain pending generations', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ published: 2, failed: 0 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await expect(dataApi.drainEvidenceBackfillRequests()).resolves.toEqual({
      published: 2, failed: 0,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.example.test/api/internal/evidence-backfill-requests/drain',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it('carries the intended partial outcome into the atomic evidence persistence request', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      persisted: 1,
      updated: 0,
      merged: 0,
      backfillGeneration: 4,
      completedResult: {
        outcome: 'partial',
        persisted: 1,
        merged: 0,
        failedAttachments: 2,
        detail: '2 recovery items could not be retrieved',
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await dataApi.persistEvidence('case-1', [], {
      expectedInboundEmailId: 'ie-1',
      evidenceBackfillGeneration: 4,
      evidenceBackfillResult: {
        outcome: 'partial',
        failedAttachments: 2,
        detail: '2 recovery items could not be retrieved',
      },
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/api/internal/cases/case-1/evidence');
    expect(JSON.parse(String(init?.body))).toEqual({
      rows: [],
      expectedInboundEmailId: 'ie-1',
      evidenceBackfillGeneration: 4,
      evidenceBackfillOutcome: 'partial',
      evidenceBackfillFailedAttachments: 2,
      evidenceBackfillDetail: '2 recovery items could not be retrieved',
    });
  });

  it('carries generation through validation and returns the durable replay snapshot', async () => {
    const committedResult = {
      outcome: 'partial' as const,
      persisted: 1,
      merged: 0,
      failedAttachments: 1,
      detail: 'one item missing',
    };
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      targetCaseId: 'case-1',
      generation: 4,
      completed: true,
      committedResult,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(dataApi.validateEvidenceBackfillTarget('ie-1', 'case-1', 4)).resolves.toEqual({
      targetCaseId: 'case-1', generation: 4, completed: true, committedResult,
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toEqual({
      targetCaseId: 'case-1', generation: 4,
    });
  });
});

describe('generation-aware status evaluation contract', () => {
  it('sends the requested generation to the row-locked evaluate route', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      value: 'needs_review', completed: true, pending: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(dataApi.evaluateStatus('case-1', 7)).resolves.toEqual({
      value: 'needs_review', completed: true, pending: false,
    });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/api/internal/cases/case-1/status-evaluate');
    expect(JSON.parse(String(init?.body))).toEqual({ generation: 7 });
  });
});

describe('canonical vehicle lookup contract', () => {
  it('uses the single Data API owner and forwards the durable caller key', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({
      persisted: { applied: ['mileage'], retryable: false, replayed: false },
      lookup: { status: 'found', run_id: 'run-1' },
      mileage: { status: 'estimated', warnings: [] },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await dataApi.lookupVehicle('case-1', 'AB12CDE', 'intake:instance-1:vehicle-data:case-1');
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe('https://api.example.test/api/vehicle-data/lookup');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      caseId: 'case-1',
      registration: 'AB12CDE',
      idempotencyKey: 'intake:instance-1:vehicle-data:case-1',
    });
  });

  it('preserves non-conflict HTTP status for advisory retry classification', async () => {
    fetchMock.mockResolvedValueOnce(new Response('forbidden', { status: 403 }));
    const forbidden = await dataApi.lookupVehicle('case-1', 'AB12CDE').catch(
      (error: unknown) => error,
    );
    expect(forbidden).toBeInstanceOf(DataApiHttpError);
    expect((forbidden as InstanceType<typeof DataApiHttpError>).status).toBe(403);
    expect((forbidden as InstanceType<typeof DataApiHttpError>).detail).toBe('forbidden');

    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 }));
    const unavailable = await dataApi.lookupVehicle('case-1', 'AB12CDE').catch(
      (error: unknown) => error,
    );
    expect(unavailable).toBeInstanceOf(DataApiHttpError);
    expect((unavailable as InstanceType<typeof DataApiHttpError>).status).toBe(503);
  });
});

describe('durable Box classification work contract', () => {
  it('claims capped work with POST rather than the rolling-compatible GET read', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await dataApi.claimUnclassifiedBoxEvidence(25);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.example.test/api/internal/evidence/unclassified-box?limit=25',
    );
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({});
  });

  it('requests a Blob-only claim page while Box access is globally unavailable', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    await dataApi.claimUnclassifiedBoxEvidence(25, false);

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toBe(
      'https://api.example.test/api/internal/evidence/unclassified-box?limit=25&includeBox=false',
    );
    expect(init?.method).toBe('POST');
  });

  it('carries the claim token on success and failure compare-and-set writes', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        updated: true,
        disposition: 'terminal',
        deadLettered: true,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    const claimToken = '00000000-0000-4000-8000-000000000001';
    await dataApi.stampBoxEvidenceClassification(
      'ev-1',
      'case-1',
      {
        filename: 'photo.jpg',
        evidenceClass: 'image',
        boxFileId: 'box-1',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        excluded: false,
        decisionSource: 'classifier',
        personReflection: false,
      },
      claimToken,
    );
    await dataApi.reportBoxEvidenceClassificationFailure(
      'ev-1',
      claimToken,
      { disposition: 'terminal', code: 'model_content_filter' },
    );

    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({ claimToken });
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      claimToken,
      failure: { disposition: 'terminal', code: 'model_content_filter' },
    });
  });
});

describe('durable staff-upload cleanup contract', () => {
  it('claims cleanup owners and reports the exact claim outcome', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ rows: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ updated: true, cleaned: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }));

    await dataApi.claimStaffUploadCleanup(25);
    await dataApi.completeStaffUploadCleanup('item-1', {
      claimToken: '00000000-0000-4000-8000-000000000123',
      outcome: 'deleted',
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://api.example.test/api/internal/staff-upload-cleanup/claim?limit=25',
    );
    expect(fetchMock.mock.calls[0][1]?.method).toBe('POST');
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://api.example.test/api/internal/staff-upload-cleanup/item-1/complete',
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      claimToken: '00000000-0000-4000-8000-000000000123',
      outcome: 'deleted',
    });
  });
});
