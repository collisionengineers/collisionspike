/**
 * orchestration/src/functions/box-classify-sweep.test.ts — TKT-146 OFFLINE acceptance
 * pins for the Box FILE.UPLOADED-lane classify sweep.
 *
 * No Functions host, no Box, no AOAI: `@azure/functions` timer registration is captured,
 * the Box facade / data API / classifyImage are controllable doubles
 * (classificationToEvidenceFields stays REAL — the policy under test is TKT-064's,
 * verbatim). Gates are driven through process.env (gates.ts reads env directly).
 *
 * Pins:
 *   (a) HAPPY PATH — enumerate → facade downloadFile → classify (case-VRM passed) →
 *       stamp via the internal evidence route re-POST → status re-evaluate ONCE per
 *       stamped case; the stamp row mirrors the row's OWN identity
 *       (`box:file:<id>` tag + boxFileId) and NEVER carries a sha256 key (the TKT-133
 *       twin-pass footgun);
 *   (b) identity mirroring — a row WITHOUT a source_message_id tag stamps on
 *       boxFileId alone (no invented sourceMessageId key);
 *   (c) never-throws / never-blocks — a classify null AND a facade throw each leave
 *       their row role-unknown (no stamp, no status re-evaluate for that case) while the
 *       REST of the sweep still completes;
 *   (d) gate fast-path — IMAGE_ROLE_CLASSIFY off (or Box off) → not even the
 *       enumeration GET runs; 0 rows → no facade/classify/stamp calls;
 *   (e) per-provider ai_allowed=false — row skipped BEFORE any byte fetch/classify
 *       (docs/gated.md D6, same policy as classifyPersist/evidence-backfill);
 *   (f) non-vehicle 'other' → stamped role 'other' (the API coalesces it to the
 *       `unknown` code) + acceptedForEva false; person reflection → excluded + reason.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { InvocationContext, Timer } from '@azure/functions';

/* ---- @azure/functions: capture timer registrations (no Functions host) ---- */
interface TimerReg {
  schedule: string;
  handler: (timer: Timer, ctx: InvocationContext) => Promise<void>;
}
const timerRegs = vi.hoisted(() => new Map<string, TimerReg>());
vi.mock('@azure/functions', () => ({
  app: {
    timer: (name: string, opts: TimerReg) => {
      timerRegs.set(name, opts);
    },
    http: () => {},
    storageQueue: () => {},
  },
}));

/* ---- Box facade: recording double ---- */
const boxMock = vi.hoisted(() => ({
  downloadFile: vi.fn(),
}));
vi.mock('../lib/functions-client.js', () => ({ box: boxMock }));

/* ---- image classifier: stub classifyImage, keep classificationToEvidenceFields REAL ---- */
const classifyImageMock = vi.hoisted(() => vi.fn());
vi.mock('../lib/image-classify.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/image-classify.js')>();
  return { ...actual, classifyImage: classifyImageMock };
});

/* ---- data API: recording doubles ---- */
const dataApiMock = vi.hoisted(() => ({
  unclassifiedBoxEvidence: vi.fn(),
  stampBoxEvidenceClassification: vi.fn(
    async (
      _evidenceId: string,
      _caseId: string,
      _row: Record<string, unknown>,
    ): Promise<{ updated: boolean; statusGeneration?: number; stale?: boolean }> => ({
      updated: true,
      statusGeneration: 1,
    }),
  ),
  workProviderAiAllowed: vi.fn(
    async (_id: string): Promise<{ aiAllowed: boolean | null }> => ({ aiAllowed: null }),
  ),
  evaluateStatus: vi.fn(async (_caseId: string) => ({ value: 'needs_review' })),
  pendingStatusRecomputes: vi.fn(
    async (): Promise<{ rows: Array<{ caseId: string; generation: number }> }> => ({ rows: [] }),
  ),
  completeStatusRecompute: vi.fn(async () => ({ completed: true, pending: false })),
}));
vi.mock('../lib/data-api.js', () => ({ dataApi: dataApiMock }));

const { mimeForClassify } = await import('./box-classify-sweep.js'); // registers the timer too
const sweep = timerRegs.get('box-classify-sweep')!;

function ctx(): InvocationContext {
  return { log: vi.fn(), warn: vi.fn(), error: vi.fn() } as unknown as InvocationContext;
}
const TIMER = { isPastDue: false } as unknown as Timer;

const ROW_TAGGED = {
  evidenceId: 'ev-1',
  caseId: 'case-A',
  filename: 'IMG_100.jpg',
  contentType: null,
  boxFileId: '111',
  sourceMessageId: 'box:file:111',
  caseVrm: 'MX17 PNL',
  workProviderId: 'wp-1',
};
const ROW_UNTAGGED = {
  evidenceId: 'ev-2',
  caseId: 'case-B',
  filename: 'IMG_200.png',
  contentType: null,
  boxFileId: '222',
  sourceMessageId: null,
  caseVrm: '',
  workProviderId: '',
};

const CLS_OVERVIEW = {
  role: 'overview',
  registrationVisible: true,
  plateText: 'MX17PNL',
  personReflection: false,
  confidence: 0.95,
};

function gatesOn(): void {
  process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
  process.env.AI_MODEL_ENDPOINT = 'https://example.cognitiveservices.azure.com';
  process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
  process.env.BOX_API_ENABLED = 'true';
}

beforeEach(() => {
  gatesOn();
  boxMock.downloadFile.mockReset();
  classifyImageMock.mockReset();
  for (const fn of Object.values(dataApiMock)) fn.mockClear();
  dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [] });
  dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed: null });
  dataApiMock.pendingStatusRecomputes.mockResolvedValue({ rows: [] });
  dataApiMock.completeStatusRecompute.mockResolvedValue({ completed: true, pending: false });
  dataApiMock.stampBoxEvidenceClassification.mockResolvedValue({
    updated: true,
    statusGeneration: 1,
  });
  boxMock.downloadFile.mockResolvedValue({
    id: '111',
    filename: 'IMG_100.jpg',
    size: 3,
    sha1: 'abc',
    contentBase64: Buffer.from('abc').toString('base64'),
  });
});
afterEach(() => {
  delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
  delete process.env.AI_MODEL_ENDPOINT;
  delete process.env.AI_MODEL_DEPLOYMENT;
  delete process.env.BOX_API_ENABLED;
});

describe('box-classify-sweep — (a) happy path', () => {
  it('enumerates, fetches via the facade, classifies with the case VRM, stamps the row identity (never a sha256), re-evaluates the case once', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    classifyImageMock.mockResolvedValue(CLS_OVERVIEW);

    await sweep.handler(TIMER, ctx());

    expect(boxMock.downloadFile).toHaveBeenCalledWith('111');
    // The case VRM rides into the classifier (the case-VRM-constrained registration read).
    expect(classifyImageMock.mock.calls[0][0]).toMatchObject({ caseVrm: 'MX17 PNL' });

    expect(dataApiMock.stampBoxEvidenceClassification).toHaveBeenCalledTimes(1);
    const [evidenceId, caseId, row] = dataApiMock.stampBoxEvidenceClassification.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(evidenceId).toBe('ev-1');
    expect(caseId).toBe('case-A');
    // Identity mirrored verbatim; role + registration_visible stamped; sha256 NEVER sent.
    expect(row).toMatchObject({
      filename: 'IMG_100.jpg',
      evidenceClass: 'image',
      sourceMessageId: 'box:file:111',
      boxFileId: '111',
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      excluded: false,
      exclusionReason: null,
      decisionSource: 'classifier',
      personReflection: false,
    });
    expect('sha256' in row).toBe(false);

    // Status re-evaluated once for the stamped case.
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledTimes(1);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-A');
    expect(dataApiMock.completeStatusRecompute).toHaveBeenCalledWith('case-A', 1);
  });
});

describe('box-classify-sweep — (b) identity mirroring', () => {
  it('a row without a box:file tag stamps on boxFileId alone (no invented sourceMessageId)', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_UNTAGGED] });
    classifyImageMock.mockResolvedValue(CLS_OVERVIEW);

    await sweep.handler(TIMER, ctx());

    const [, , row] = dataApiMock.stampBoxEvidenceClassification.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect('sourceMessageId' in row).toBe(false);
    expect(row.boxFileId).toBe('222');
    // No case VRM known → the classifier is called without one (any-legible-plate mode).
    expect(classifyImageMock.mock.calls[0][0]).toMatchObject({ caseVrm: undefined });
  });
});

describe('box-classify-sweep — (c) never-throws, never-blocks', () => {
  it('a classify null and a facade throw each leave their row unstamped while the rest completes', async () => {
    const rowC = { ...ROW_UNTAGGED, evidenceId: 'ev-3', caseId: 'case-C', boxFileId: '333' };
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({
      rows: [ROW_TAGGED, ROW_UNTAGGED, rowC],
    });
    boxMock.downloadFile
      .mockResolvedValueOnce({ id: '111', filename: 'a.jpg', size: 3, sha1: 'x', contentBase64: 'YQ==' })
      .mockRejectedValueOnce(new Error('fn GET box/files/222/content → 413: over cap'))
      .mockResolvedValueOnce({ id: '333', filename: 'c.jpg', size: 3, sha1: 'y', contentBase64: 'Yw==' });
    classifyImageMock
      .mockResolvedValueOnce(null) // ROW_TAGGED: classifier degraded → row stays unknown
      .mockResolvedValueOnce(CLS_OVERVIEW); // rowC: classifies fine

    const c = ctx();
    await sweep.handler(TIMER, c);

    // Only rowC stamped; only case-C re-evaluated; the sweep never threw.
    expect(dataApiMock.stampBoxEvidenceClassification).toHaveBeenCalledTimes(1);
    expect(dataApiMock.stampBoxEvidenceClassification.mock.calls[0][1]).toBe('case-C');
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledTimes(1);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-C');
  });
});

describe('box-classify-sweep — (d) gate + 0-row fast paths', () => {
  it('IMAGE_ROLE_CLASSIFY off → not even the enumeration GET runs', async () => {
    delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
    await sweep.handler(TIMER, ctx());
    expect(dataApiMock.unclassifiedBoxEvidence).not.toHaveBeenCalled();
  });

  it('BOX_API off → not even the enumeration GET runs', async () => {
    process.env.BOX_API_ENABLED = 'false';
    await sweep.handler(TIMER, ctx());
    expect(dataApiMock.unclassifiedBoxEvidence).not.toHaveBeenCalled();
  });

  it('0 rows → one enumeration GET, no facade/classify/stamp calls', async () => {
    await sweep.handler(TIMER, ctx());
    expect(dataApiMock.unclassifiedBoxEvidence).toHaveBeenCalledTimes(1);
    expect(boxMock.downloadFile).not.toHaveBeenCalled();
    expect(classifyImageMock).not.toHaveBeenCalled();
    expect(dataApiMock.stampBoxEvidenceClassification).not.toHaveBeenCalled();
  });

  it('an enumeration failure logs and returns (retried next sweep), never throws', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockRejectedValue(new Error('data-api GET → 503'));
    await expect(sweep.handler(TIMER, ctx())).resolves.toBeUndefined();
    expect(boxMock.downloadFile).not.toHaveBeenCalled();
  });
});

describe('box-classify-sweep — (e) per-provider ai_allowed opt-out', () => {
  it('ai_allowed=false skips the row BEFORE any byte fetch or classify', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed: false });

    await sweep.handler(TIMER, ctx());

    expect(dataApiMock.workProviderAiAllowed).toHaveBeenCalledWith('wp-1');
    expect(boxMock.downloadFile).not.toHaveBeenCalled();
    expect(classifyImageMock).not.toHaveBeenCalled();
    expect(dataApiMock.stampBoxEvidenceClassification).not.toHaveBeenCalled();
  });

  it('a lookup error fails closed, is cached for that provider, and does not block another provider', async () => {
    const sameProvider = { ...ROW_TAGGED, evidenceId: 'ev-2', boxFileId: '112' };
    const otherProvider = {
      ...ROW_TAGGED,
      evidenceId: 'ev-3',
      caseId: 'case-Z',
      boxFileId: '333',
      workProviderId: 'wp-2',
    };
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({
      rows: [ROW_TAGGED, sameProvider, otherProvider],
    });
    dataApiMock.workProviderAiAllowed.mockImplementation(async (providerId: string) => {
      if (providerId === 'wp-1') throw new Error('lookup 500');
      return { aiAllowed: true };
    });
    classifyImageMock.mockResolvedValue(CLS_OVERVIEW);

    await sweep.handler(TIMER, ctx());

    expect(dataApiMock.workProviderAiAllowed.mock.calls.filter(([id]) => id === 'wp-1')).toHaveLength(1);
    expect(boxMock.downloadFile).toHaveBeenCalledTimes(1);
    expect(boxMock.downloadFile).toHaveBeenCalledWith('333');
    expect(dataApiMock.stampBoxEvidenceClassification).toHaveBeenCalledTimes(1);
    expect(dataApiMock.stampBoxEvidenceClassification.mock.calls[0][0]).toBe('ev-3');
  });
});

describe('box-classify-sweep — (f) TKT-064 policy rides verbatim', () => {
  it("high-confidence non-vehicle 'other' stamps a recoverable automatic exclusion", async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    classifyImageMock.mockResolvedValue({
      role: 'other',
      registrationVisible: false,
      plateText: '',
      personReflection: false,
      confidence: 0.9,
    });

    await sweep.handler(TIMER, ctx());

    const [, , row] = dataApiMock.stampBoxEvidenceClassification.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(row).toMatchObject({
      imageRole: 'other',
      acceptedForEva: false,
      registrationVisible: false,
      excluded: true,
      exclusionReason: 'This image may not show the vehicle',
      decisionSource: 'classifier',
    });
  });

  it('a person reflection stamps excluded + reason (the domain exclusion rule)', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    classifyImageMock.mockResolvedValue({
      role: 'damage_closeup',
      registrationVisible: false,
      plateText: '',
      personReflection: true,
      confidence: 0.9,
    });

    await sweep.handler(TIMER, ctx());

    const [, , row] = dataApiMock.stampBoxEvidenceClassification.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(row).toMatchObject({
      imageRole: 'damage_closeup',
      acceptedForEva: false,
      excluded: true,
      exclusionReason: 'A person’s reflection may be visible',
      decisionSource: 'classifier',
      personReflection: true,
    });
  });

  it('a mismatched legible plate does NOT clear registration_visible for the case (case-VRM constraint)', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    classifyImageMock.mockResolvedValue({ ...CLS_OVERVIEW, plateText: 'ZZ99ZZZ' });

    await sweep.handler(TIMER, ctx());

    const [, , row] = dataApiMock.stampBoxEvidenceClassification.mock.calls[0] as unknown as [
      string,
      string,
      Record<string, unknown>,
    ];
    expect(row).toMatchObject({ imageRole: 'overview', registrationVisible: false });
  });
});

describe('box-classify-sweep — (g) durable status generations', () => {
  it('leaves a failed status generation pending and acknowledges it on the next invocation', async () => {
    dataApiMock.unclassifiedBoxEvidence
      .mockResolvedValueOnce({ rows: [ROW_TAGGED] })
      .mockResolvedValueOnce({ rows: [] });
    dataApiMock.pendingStatusRecomputes
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ caseId: 'case-A', generation: 7 }] });
    dataApiMock.stampBoxEvidenceClassification.mockResolvedValue({
      updated: true,
      statusGeneration: 7,
    });
    classifyImageMock.mockResolvedValue(CLS_OVERVIEW);
    dataApiMock.evaluateStatus
      .mockRejectedValueOnce(new Error('status API 503'))
      .mockResolvedValueOnce({ value: 'ready_for_eva' });

    await sweep.handler(TIMER, ctx());
    expect(dataApiMock.completeStatusRecompute).not.toHaveBeenCalled();

    await sweep.handler(TIMER, ctx());
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledTimes(2);
    expect(dataApiMock.completeStatusRecompute).toHaveBeenCalledTimes(1);
    expect(dataApiMock.completeStatusRecompute).toHaveBeenCalledWith('case-A', 7);
  });

  it('drains committed status work even when new classifications are gated off', async () => {
    delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
    dataApiMock.pendingStatusRecomputes.mockResolvedValue({
      rows: [{ caseId: 'case-old', generation: 3 }],
    });

    await sweep.handler(TIMER, ctx());

    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-old');
    expect(dataApiMock.completeStatusRecompute).toHaveBeenCalledWith('case-old', 3);
    expect(dataApiMock.unclassifiedBoxEvidence).not.toHaveBeenCalled();
  });

  it('does not request status work when a delayed classification stamp is stale', async () => {
    dataApiMock.unclassifiedBoxEvidence.mockResolvedValue({ rows: [ROW_TAGGED] });
    dataApiMock.stampBoxEvidenceClassification.mockResolvedValue({
      updated: false,
      stale: true,
    });
    classifyImageMock.mockResolvedValue(CLS_OVERVIEW);

    await sweep.handler(TIMER, ctx());

    expect(dataApiMock.evaluateStatus).not.toHaveBeenCalled();
    expect(dataApiMock.completeStatusRecompute).not.toHaveBeenCalled();
  });
});

describe('mimeForClassify', () => {
  it('prefers an honest image/* content_type, falls back to the extension, then image/jpeg', () => {
    expect(mimeForClassify('x.png', 'image/png')).toBe('image/png');
    expect(mimeForClassify('x.png', 'application/octet-stream')).toBe('image/png');
    expect(mimeForClassify('photo.JPG', null)).toBe('image/jpeg');
    expect(mimeForClassify('scan.webp', null)).toBe('image/webp');
    expect(mimeForClassify('noext', null)).toBe('image/jpeg');
  });
});
