import { describe, it, expect, vi, afterEach } from 'vitest';
import { createRestDataAccess } from './rest-client';
import { INBOUND_COUNTS_ZERO } from '@cs/domain';

/* ============================================================
   rest-client — the inbox error-surfacing + dashboard `now`-threading
   contract (live-test defects #2/#4, SPA side). Mocks global fetch so the
   tests stay offline while exercising the real URL-building + safe() wiring.

   The two behaviours under test:
     - The inbox LIST (`inboundEmails`) must PROPAGATE transport errors so the
       screen can show an error/retry state — NOT swallow them to `[]` and look
       like an empty inbox. The COUNTS read stays safe() (zero baseline).
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

  it('inboundEmailCounts STAYS safe() — degrades to the zero baseline on a 5xx', async () => {
    const fetchMock = vi.fn().mockResolvedValue(errStatus(500));
    const da = clientWith(fetchMock);
    await expect(da.inboundEmailCounts()).resolves.toEqual(INBOUND_COUNTS_ZERO);
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
