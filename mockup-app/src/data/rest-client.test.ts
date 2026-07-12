import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRestDataAccess } from './rest-client';

/* ============================================================
   rest-client — the inbox error-surfacing + dashboard `now`-threading
   contract (live-test defects #2/#4, SPA side). Mocks global fetch so the
   tests stay offline while exercising the real URL-building + safe() wiring.

   The two behaviours under test:
     - The inbox LIST (`inboundEmails`) must PROPAGATE transport errors so the
       screen can show an error/retry state — NOT swallow them to `[]` and look
       like an empty inbox. The counts read also propagates failure so a
       sectioned dashboard never presents an unavailable total as zero.
     - Dashboard reads must thread the client `now` as `?now=<ISO>` so server
       windowing matches the client clock (it was being dropped).
   ============================================================ */

/** Minimal fetch Response stand-in (only the fields `call()` touches). */
const okJson = (body: unknown) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
});
const errStatus = (status: number, text = 'upstream boom') => ({
  ok: false,
  status,
  json: () => Promise.reject(new Error('not json')),
  text: () => Promise.resolve(text),
});
const versionedJson = (body: Record<string, unknown>, etag?: string) => ({
  ok: true,
  status: 200,
  json: () => Promise.resolve(body),
  text: () => Promise.resolve(JSON.stringify(body)),
  headers: { get: (name: string) => (name.toLowerCase() === 'etag' ? etag ?? null : null) },
});

function clientWith(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock);
  return createRestDataAccess({
    baseUrl: 'https://api.test',
    getToken: () => Promise.resolve('TOKEN'),
  });
}

/** The arguments of the most recent fetch call (index access — ES2020-lib-safe; the
 *  esbuild target lacks Array.prototype.at typings). */
function lastCall(fetchMock: ReturnType<typeof vi.fn>): unknown[] {
  const { calls } = fetchMock.mock;
  return (calls[calls.length - 1] ?? []) as unknown[];
}

/** The URL passed to the most recent fetch call. */
function lastUrl(fetchMock: ReturnType<typeof vi.fn>): string {
  return String(lastCall(fetchMock)[0]);
}

/** The RequestInit (method/headers/body) passed to the most recent fetch call. */
function lastInit(fetchMock: ReturnType<typeof vi.fn>): RequestInit {
  return (lastCall(fetchMock)[1] ?? {}) as RequestInit;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rest-client — inbox list error surfacing (#4)', () => {
  it('inboundEmails REJECTS on a 5xx (no longer masquerades as an empty inbox)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503));
    const da = clientWith(fetchMock);
    await expect(da.inboundEmails()).rejects.toThrow(/503/);
  });

  it('inboundEmails resolves the rows on success', async () => {
    const rows = [{ id: 'e1' }, { id: 'e2' }];
    const fetchMock = vi.fn().mockResolvedValue(okJson(rows));
    const da = clientWith(fetchMock);
    await expect(da.inboundEmails()).resolves.toHaveLength(2);
  });

  it('inboundEmails threads the category/subtype facet into the query string', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    const da = clientWith(fetchMock);
    await da.inboundEmails({ category: 'receiving_work', subtype: 'new_client_work' });
    expect(lastUrl(fetchMock)).toContain('/api/inbound?category=receiving_work&subtype=new_client_work');
  });

  it('inboundEmailCounts rejects on a 5xx so the dashboard can show a partial error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    const da = clientWith(fetchMock);
    await expect(da.inboundEmailCounts()).rejects.toThrow(/500/);
  });
});

describe('rest-client — dashboard `now` threading (#4)', () => {
  const now = new Date('2026-06-29T10:00:00.000Z');
  const encoded = encodeURIComponent(now.toISOString()); // 2026-06-29T10%3A00%3A00.000Z

  it('liveCounts(now) appends ?now=<ISO>', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ notReady: 0, review: 0, held: 0 }));
    const da = clientWith(fetchMock);
    await da.liveCounts(now);
    expect(lastUrl(fetchMock)).toBe(`https://api.test/api/dashboard/live-counts?now=${encoded}`);
  });

  it('throughput(now) + agingExceptions(now) append ?now=<ISO>', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));
    const da = clientWith(fetchMock);
    await da.throughput(now);
    expect(lastUrl(fetchMock)).toContain(`/api/dashboard/throughput?now=${encoded}`);
    await da.agingExceptions(now);
    expect(lastUrl(fetchMock)).toContain(`/api/dashboard/aging-exceptions?now=${encoded}`);
  });

  it('omits the query entirely when no `now` is supplied (server falls back to its own now())', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ notReady: 0, review: 0, held: 0 }));
    const da = clientWith(fetchMock);
    await da.liveCounts();
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/dashboard/live-counts');
  });

  it('queueCounts threads `now` AND keeps its safe() zero baseline on failure', async () => {
    // success path: now is threaded
    const okMock = vi.fn().mockResolvedValue(okJson({ 'not-ready': 1, review: 2, held: 3 }));
    const daOk = clientWith(okMock);
    await daOk.queueCounts(now);
    expect(lastUrl(okMock)).toContain(`/api/dashboard/queue-counts?now=${encoded}`);
    vi.unstubAllGlobals();

    // failure path: degrades to zero baseline (safe retained)
    const errMock = vi.fn().mockResolvedValue(errStatus(500));
    const daErr = clientWith(errMock);
    await expect(daErr.queueCounts()).resolves.toEqual({ 'not-ready': 0, review: 0, held: 0 });
  });
});

describe('rest-client — resumable Manual Intake create', () => {
  it('sends case and evidence retry identities as headers without changing the case body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ id: 'case-created' }));
    const da = clientWith(fetchMock);
    const body = { vrm: 'AB12CDE' } as Parameters<typeof da.createCase>[0];

    await da.createCase(body, {
      idempotencyKey: 'manual-create-operation-0001',
      evidenceUploadKey: 'manual-upload-operation-0001',
      expectedEvidenceCount: 3,
    });

    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases');
    const init = lastInit(fetchMock);
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify(body));
    expect(init.headers).toMatchObject({
      Authorization: 'Bearer TOKEN',
      'Idempotency-Key': 'manual-create-operation-0001',
      'X-Manual-Intake-Upload-Key': 'manual-upload-operation-0001',
      'X-Manual-Intake-File-Count': '3',
    });
  });
});

describe('rest-client — openCasePoMatches (TKT-068 attach-by-Case/PO)', () => {
  it('GETs /api/cases?case_po=<encoded> and returns the matches', async () => {
    const rows = [{ id: 'c-9', casePo: 'CCPY26050', vrm: 'YT13UTV', status: 'needs_review' }];
    const fetchMock = vi.fn().mockResolvedValue(okJson(rows));
    const da = clientWith(fetchMock);
    const out = await da.openCasePoMatches('CCPY26050');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases?case_po=CCPY26050');
    expect(out).toEqual(rows);
  });

  it('URL-encodes the Case/PO and threads exclude', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    const da = clientWith(fetchMock);
    await da.openCasePoMatches('A.PCH26/1', 'c-1');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases?case_po=A.PCH26%2F1&exclude=c-1');
  });

  it('safe()-empty on a transport error (the card prompts for a registration instead)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    const da = clientWith(fetchMock);
    await expect(da.openCasePoMatches('CCPY26050')).resolves.toEqual([]);
  });
});

describe('rest-client — updateCase / editable VRM (issue #12)', () => {
  const caseId = 'c-123';
  const updated = { id: caseId, vrm: 'MX17PNL', status: 'needs_review' };

  it('PATCHes /api/cases/{id} with the JSON patch body and returns the updated Case', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    const da = clientWith(fetchMock);

    const result = await da.updateCase(caseId, { vrm: 'MX17PNL' });

    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/c-123');
    const init = lastInit(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify({ vrm: 'MX17PNL' }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(result).toEqual(updated);
  });

  it('URL-encodes the case id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    const da = clientWith(fetchMock);
    await da.updateCase('a/b c', { vrm: 'AB12CDE' });
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/a%2Fb%20c');
  });

  it('REJECTS on a non-ok status — a mutation is NEVER safe()-swallowed', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(409, 'conflict'));
    const da = clientWith(fetchMock);
    await expect(da.updateCase(caseId, { vrm: 'MX17PNL' })).rejects.toThrow(/409/);
  });

  it('PATCHes evaFields through the body (durable case-page edits)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    const da = clientWith(fetchMock);
    const patch = { evaFields: { dateOfLoss: '12/06/2026', vehicleModel: 'Audi A3' } };
    await da.updateCase(caseId, patch);
    const init = lastInit(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(patch));
  });

  it('saves a reviewed field/address/decision set in one versioned PATCH', async () => {
    const response = { ...updated, version: 'v8', inspectionDecision: 'manual' };
    const fetchMock = vi.fn().mockResolvedValue(okJson(response));
    const da = clientWith(fetchMock);
    const patch = {
      evaFields: { claimantName: 'Jane Example', inspectionAddress: '10 Example Road' },
      inspectionDecision: {
        decisionMode: 'manual' as const,
        sourceLabel: 'manual',
        sourceNote: 'Entered and confirmed by staff',
        addressLines: ['10 Example Road'],
      },
    };

    await expect(da.saveCaseEdits(caseId, patch, 'v7')).resolves.toEqual(response);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = lastInit(fetchMock);
    expect(init.method).toBe('PATCH');
    expect((init.headers as Record<string, string>)['If-Match']).toBe('v7');
    expect(JSON.parse(String(init.body))).toEqual({ ...patch, editSession: true });
  });

  it('cannot expose an early inspection success while the single save is delayed', async () => {
    let resolveResponse!: (value: ReturnType<typeof okJson>) => void;
    const delayed = new Promise<ReturnType<typeof okJson>>((resolve) => {
      resolveResponse = resolve;
    });
    const fetchMock = vi.fn().mockReturnValue(delayed);
    const da = clientWith(fetchMock);
    const body = {
      evaFields: { inspectionAddress: 'Image Based Assessment' },
      inspectionDecision: {
        decisionMode: 'image_based' as const,
        sourceLabel: 'image_based',
        sourceNote: 'Confirmed by staff',
      },
    };
    let settled = false;
    const save = da.saveCaseEdits(caseId, body, 'v7').finally(() => {
      settled = true;
    });

    await Promise.resolve();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(settled).toBe(false);
    resolveResponse(okJson({ ...updated, version: 'v8' }));
    await save;
    expect(settled).toBe(true);
  });

  it('rejects a failed reviewed save without mutating the retry body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503, '{"message":"Try again."}'));
    const da = clientWith(fetchMock);
    const patch = { evaFields: { claimantName: 'Jane Example' } };
    await expect(da.saveCaseEdits(caseId, patch, 'v7')).rejects.toThrow(/503/);
    expect(patch).toEqual({ evaFields: { claimantName: 'Jane Example' } });
  });
});

describe('rest-client — assistant confirmation snapshots (TKT-111 repair)', () => {
  const caseAction = {
    capability: 'set_on_hold',
    title: 'Hold a case',
    method: 'POST',
    path: 'cases/c-1/hold',
    body: { onHold: true },
    params: { caseId: 'c-1', onHold: true },
  };

  it('uses the case JSON version ahead of the rolling ETag fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      versionedJson({ id: 'c-1', vrm: 'AB12CDE', version: 'json-v7' }, 'etag-v6'),
    );
    const da = clientWith(fetchMock);

    await expect(da.caseWithVersion('c-1')).resolves.toEqual({
      state: 'available',
      value: { id: 'c-1', vrm: 'AB12CDE' },
      version: 'json-v7',
      versionSource: 'body',
    });
  });

  it('reads an inbound target independently and accepts ETag only as a rolling fallback', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      versionedJson(
        { id: 'mail/1', subject: 'Instruction', triageState: 'new' },
        '"inbound-v3"',
      ),
    );
    const da = clientWith(fetchMock);

    await expect(da.inboundWithVersion('mail/1')).resolves.toEqual({
      state: 'available',
      value: { id: 'mail/1', subject: 'Instruction', triageState: 'new' },
      version: 'inbound-v3',
      versionSource: 'etag',
    });
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/mail%2F1');
  });

  it('returns explicit unavailable states for network, malformed JSON, and a missing version', async () => {
    const network = clientWith(vi.fn().mockRejectedValue(new Error('offline')));
    await expect(network.caseWithVersion('c-1')).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'request_failed',
      status: 0,
    });
    vi.unstubAllGlobals();

    const malformed = clientWith(
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
        headers: { get: () => null },
      }),
    );
    await expect(malformed.caseWithVersion('c-1')).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'invalid_response',
    });
    vi.unstubAllGlobals();

    const unversioned = clientWith(vi.fn().mockResolvedValue(versionedJson({ id: 'c-1' })));
    await expect(unversioned.caseWithVersion('c-1')).resolves.toMatchObject({
      state: 'unavailable',
      reason: 'version_missing',
    });
  });

  it('sends the JSON snapshot version as If-Match and reports success without throwing', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(versionedJson({ id: 'c-1', vrm: 'AB12CDE', version: 'json-v7' }))
      .mockResolvedValueOnce({
        ok: true,
        status: 204,
        headers: { get: () => 'json-v8' },
      });
    const da = clientWith(fetchMock);
    const snapshot = await da.caseWithVersion('c-1');
    expect(snapshot.state).toBe('available');
    if (snapshot.state !== 'available') throw new Error('expected available snapshot');

    await expect(da.executeProposal(caseAction, snapshot.version)).resolves.toEqual({
      ok: true,
      status: 204,
      version: 'json-v8',
    });
    expect((lastInit(fetchMock).headers as Record<string, string>)['If-Match']).toBe('json-v7');
  });

  it('returns the created resource id so a confirmed case remains openable', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: { get: () => null },
      json: () => Promise.resolve({ id: 'case-created-1' }),
    });
    const da = clientWith(fetchMock);
    const createAction = {
      capability: 'create_case',
      title: 'Create a case',
      method: 'POST',
      path: 'cases',
      body: { vrm: 'AB12CDE' },
      params: { vrm: 'AB12CDE' },
    };

    await expect(da.executeProposal(createAction)).resolves.toEqual({
      ok: true,
      status: 201,
      resourceId: 'case-created-1',
    });
  });

  it('never silently omits If-Match for an existing target', async () => {
    const fetchMock = vi.fn();
    const da = clientWith(fetchMock);

    await expect(da.executeProposal(caseAction)).resolves.toMatchObject({
      ok: false,
      status: 428,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns stale and network failures as results instead of throwing', async () => {
    const staleMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      headers: { get: () => null },
    });
    const stale = clientWith(staleMock);
    await expect(stale.executeProposal(caseAction, 'v1')).resolves.toMatchObject({
      ok: false,
      status: 409,
    });
    vi.unstubAllGlobals();

    const network = clientWith(vi.fn().mockRejectedValue(new Error('offline')));
    await expect(network.executeProposal(caseAction, 'v1')).resolves.toMatchObject({
      ok: false,
      status: 0,
      error: expect.any(String),
    });
  });
});

describe('rest-client — durable evidence review', () => {
  it('PATCHes the exact partial review body and returns server truth', async () => {
    const updated = {
      id: 'ev-1',
      fileName: 'photo.jpg',
      kind: 'image',
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      excluded: false,
      sourceLabel: 'auto-intake',
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    const da = clientWith(fetchMock);
    const input = {
      imageRole: 'overview' as const,
      acceptedForEva: true,
      excluded: false,
      exclusionReason: null,
    };

    await expect(da.updateEvidenceReview('ev/1', input)).resolves.toEqual(updated);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/evidence/ev%2F1');
    expect(lastInit(fetchMock).method).toBe('PATCH');
    expect(lastInit(fetchMock).body).toBe(JSON.stringify(input));
  });

  it('rejects a failed PATCH so the screen cannot display an unpersisted decision', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503));
    const da = clientWith(fetchMock);
    await expect(da.updateEvidenceReview('ev-1', { excluded: true })).rejects.toThrow(/503/);
  });
});

describe('rest-client — amalgamated dashboard + inbound view (work-todo-spike)', () => {
  const now = new Date('2026-06-29T10:00:00.000Z');
  const encoded = encodeURIComponent(now.toISOString());

  it('dashboardSummary(now) GETs /api/dashboard?now=<ISO> and returns the summary', async () => {
    const summary = { liveCounts: { notReady: 0 }, inbound: { untriaged: 2 } };
    const fetchMock = vi.fn().mockResolvedValue(okJson(summary));
    const da = clientWith(fetchMock);
    const res = await da.dashboardSummary(now);
    expect(lastUrl(fetchMock)).toBe(`https://api.test/api/dashboard?now=${encoded}`);
    expect(res).toEqual(summary);
  });

  it('dashboardSummary() omits the query when no `now` is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));
    const da = clientWith(fetchMock);
    await da.dashboardSummary();
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/dashboard');
  });

  it('dashboardSummary REJECTS on a 5xx (the dashboard shows its error panel)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(503));
    const da = clientWith(fetchMock);
    await expect(da.dashboardSummary()).rejects.toThrow(/503/);
  });

  it('inboundEmails threads `view` alongside the category facet', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    const da = clientWith(fetchMock);
    await da.inboundEmails({ category: 'query', view: 'handled' });
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound?category=query&view=handled');
  });

  it('inboundEmails sends `view` alone when no category facet is set', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    const da = clientWith(fetchMock);
    await da.inboundEmails({ view: 'all' });
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound?view=all');
  });
});

describe('rest-client — removeCase (soft-remove, Superuser)', () => {
  it('DELETEs /api/cases/{id} with the JSON body and returns the result', async () => {
    const result = {
      id: 'c-9',
      status: 'removed',
      alreadyRemoved: false,
      boxFolderUrl: 'https://app.box.com/folder/392761581105',
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(result));
    const da = clientWith(fetchMock);
	    const input = { acknowledgeArchiveFolderHandled: true, reason: 'duplicate of CCPY26050' };
    const res = await da.removeCase('c-9', input);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/c-9');
    const init = lastInit(fetchMock);
    expect(init.method).toBe('DELETE');
    expect(init.body).toBe(JSON.stringify(input));
    expect(res).toEqual(result);
  });

  it('REJECTS on a non-ok status — never a fake "removed"', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(403, 'forbidden'));
    const da = clientWith(fetchMock);
    await expect(da.removeCase('c-9', {})).rejects.toThrow(/403/);
  });

  it('URL-encodes the case id', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okJson({ id: 'a/b', status: 'removed', alreadyRemoved: false }));
    const da = clientWith(fetchMock);
    await da.removeCase('a/b', {});
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/a%2Fb');
  });
});

describe('rest-client — nextCasePo (Case/PO preview)', () => {
  it('GETs /api/cases/next-po?principal=… and returns the result', async () => {
    const result = {
      principal: 'CCPY',
      yy: '26',
      seq: '051',
      nextSeq: 51,
      evaLower: 'ccpy26051',
      boxUpper: 'CCPY26051',
      source: 'db',
    };
    const fetchMock = vi.fn().mockResolvedValue(okJson(result));
    const da = clientWith(fetchMock);
    const res = await da.nextCasePo('CCPY');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/next-po?principal=CCPY');
    expect(res).toEqual(result);
  });

  it('appends &year= when a year is supplied', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({}));
    const da = clientWith(fetchMock);
    await da.nextCasePo('CCPY', 26);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/cases/next-po?principal=CCPY&year=26');
  });
});

describe('rest-client — updateProvider (Superuser)', () => {
  it('PATCHes /api/providers/{idOrCode} with the body and returns the Provider', async () => {
    const updated = { id: 'wp-1', principalCode: 'CCPY', providerAutomationMode: 'review_auto' };
    const fetchMock = vi.fn().mockResolvedValue(okJson(updated));
    const da = clientWith(fetchMock);
    const input = {
      providerAutomationMode: 'review_auto' as const,
      knownEmailDomains: ['acuity-law.co.uk'],
    };
    const res = await da.updateProvider('CCPY', input);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/providers/CCPY');
    const init = lastInit(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(input));
    expect(res).toEqual(updated);
  });

  it('REJECTS on a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(403));
    const da = clientWith(fetchMock);
    await expect(
      da.updateProvider('CCPY', { providerAutomationMode: 'full_auto' }),
    ).rejects.toThrow(/403/);
  });
});

describe('rest-client — inboundSuggestions (ref-gate affordance, rules-engine-v2 Phase 2)', () => {
  it('GETs /api/inbound/{id}/suggestions and returns the rows', async () => {
    const rows = [{ id: 'sg-1', suggestionType: 'case_link', reviewState: 'pending' }];
    const fetchMock = vi.fn().mockResolvedValue(okJson(rows));
    const da = clientWith(fetchMock);
    const res = await da.inboundSuggestions('ibe-1');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/ibe-1/suggestions');
    expect(res).toEqual(rows);
  });

  it('STAYS safe() — degrades to [] on a 5xx (a secondary, suggestion-only surface)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    const da = clientWith(fetchMock);
    await expect(da.inboundSuggestions('ibe-1')).resolves.toEqual([]);
  });

  it('URL-encodes the inbound email id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson([]));
    const da = clientWith(fetchMock);
    await da.inboundSuggestions('a/b c');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/a%2Fb%20c/suggestions');
  });
});

describe('rest-client — detachInbound (unlink from case, rules-engine-v2 Phase 2)', () => {
  it('POSTs /api/inbound/{id}/detach and returns the result', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const da = clientWith(fetchMock);
    const res = await da.detachInbound('ibe-1');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/ibe-1/detach');
    expect(lastInit(fetchMock).method).toBe('POST');
    expect(res).toEqual({ ok: true });
  });

  it('REJECTS on a non-ok status — never a fake unlink', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(404));
    const da = clientWith(fetchMock);
    await expect(da.detachInbound('nope')).rejects.toThrow(/404/);
  });

  it('URL-encodes the inbound email id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson({ ok: true }));
    const da = clientWith(fetchMock);
    await da.detachInbound('a/b c');
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/a%2Fb%20c/detach');
  });
});

describe('rest-client — reclassifyInbound (staff override)', () => {
  it('PATCHes /api/inbound/{id}/classification with the body and returns the row', async () => {
    const row = { id: 'ibe-1', category: 'receiving_work', subtype: 'existing_provider_diminution' };
    const fetchMock = vi.fn().mockResolvedValue(okJson(row));
    const da = clientWith(fetchMock);
    const input = { tag: 'Diminution' as const, reason: 'staff override' };
    const res = await da.reclassifyInbound('ibe-1', input);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/inbound/ibe-1/classification');
    const init = lastInit(fetchMock);
    expect(init.method).toBe('PATCH');
    expect(init.body).toBe(JSON.stringify(input));
    expect(res).toEqual(row);
  });

  it('REJECTS on a non-ok status', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(404));
    const da = clientWith(fetchMock);
    await expect(da.reclassifyInbound('nope', { category: 'other' })).rejects.toThrow(/404/);
  });
});

describe('rest-client — completedCases (E4: page through, never a truncated count)', () => {
  const page = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `c-${i}` }));

  it('returns a single short page without a second fetch (limit=500, offset=0)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(page(3)));
    const da = clientWith(fetchMock);
    const res = await da.completedCases();
    expect(res).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(lastUrl(fetchMock)).toBe('https://api.test/api/completed/cases?limit=500&offset=0');
  });

  it('pages until a short page ends the list, concatenating every row', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(okJson(page(500)))
      .mockResolvedValueOnce(okJson(page(120)));
    const da = clientWith(fetchMock);
    const res = await da.completedCases();
    expect(res).toHaveLength(620); // 500 + 120 — rows past the first page are no longer lost
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0][0])).toContain('offset=0');
    expect(String(fetchMock.mock.calls[1][0])).toContain('offset=500');
  });

  it('threads the status filter on the paged request', async () => {
    const fetchMock = vi.fn().mockResolvedValue(okJson(page(2)));
    const da = clientWith(fetchMock);
    await da.completedCases('done');
    expect(lastUrl(fetchMock)).toBe(
      'https://api.test/api/completed/cases?limit=500&offset=0&status=done',
    );
  });

  it('STAYS safe() — degrades to [] on a 5xx (a browse surface, never a blocker)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    const da = clientWith(fetchMock);
    await expect(da.completedCases()).resolves.toEqual([]);
  });
});
