import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const fetchMock = vi.fn<typeof fetch>();
vi.stubGlobal('fetch', fetchMock);

const {
  dataApi,
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
