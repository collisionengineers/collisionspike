/**
 * extractImages activity — the TKT-089 reopen classifier-gated suppression (offline
 * acceptance proof). The activity handler is captured through a durable-functions
 * registration double; blob/parser/data-API are recording doubles; `classifyImage` is
 * stubbed but `classificationToEvidenceFields` stays REAL (the box-classify-sweep.test.ts
 * convention) so the persisted rows exercise the actual extraction-lane mapping.
 *
 * Pins:
 *   (a) a crop the classifier reads as non-vehicle "other" (the MGAA 204x204 badge
 *       shape the engine deliberately keeps) persists `excluded: true` with the domain
 *       exclusion reason — it can never mirror to Box (archive-evidence filters excluded);
 *   (b) recall guard — a genuine vehicle crop persists accepted + NOT excluded;
 *   (c) never-throws fail-open — a classify failure (null) persists the row role-unknown
 *       and NOT excluded, exactly the pre-classifier behaviour (recall protection);
 *   (d) gate off — classifyImage is never called and rows persist role-unknown.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/* ---- durable-functions: capture the activity registration (no Durable host) ---- */
interface ActivityReg {
  handler: (input: unknown, ctx: unknown) => Promise<unknown>;
}
const activityRegs = vi.hoisted(() => new Map<string, ActivityReg>());
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, opts: ActivityReg) => {
      activityRegs.set(name, opts);
    },
    orchestration: () => {},
  },
  input: { durableClient: () => ({}) },
  getClient: () => ({}),
  RetryOptions: class {},
}));

/* ---- parser + OCR clients: recording doubles ---- */
const fnClient = vi.hoisted(() => ({
  callExtractImages: vi.fn(),
  callPlateOcr: vi.fn(),
}));
vi.mock('../../lib/functions-client.js', () => fnClient);

/* ---- data API: recording doubles ---- */
const dataApiMock = vi.hoisted(() => ({
  persistImageEvidence: vi.fn(async (_caseId: string, rows: unknown[]) => ({ persisted: rows.length })),
  recordAudit: vi.fn(async () => ({})),
  workProviderAiAllowed: vi.fn(async (): Promise<{ aiAllowed: boolean | null }> => ({ aiAllowed: null })),
}));
vi.mock('../../lib/data-api.js', () => ({ dataApi: dataApiMock }));

/* ---- blob: recording doubles ---- */
const blobMock = vi.hoisted(() => ({
  downloadEvidenceBytes: vi.fn(async () => Buffer.from('%PDF-1.7 stub')),
  uploadEvidenceBytes: vi.fn(async (_msg: string, name: string) => ({
    blobPath: `msg-1/${name}`,
    size: 1234,
    sha256: 'f'.repeat(64),
  })),
}));
vi.mock('../../lib/blob.js', () => blobMock);

/* ---- image classifier: stub classifyImage, keep classificationToEvidenceFields REAL ---- */
const classifyImageMock = vi.hoisted(() => vi.fn());
vi.mock('../../lib/image-classify.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/image-classify.js')>();
  return { ...actual, classifyImage: classifyImageMock };
});

await import('./extractImages.js'); // registers the activity against the captured double
const activity = activityRegs.get('extractImages')!;

function ctx(): { log: ReturnType<typeof vi.fn>; warn: ReturnType<typeof vi.fn> } {
  return { log: vi.fn(), warn: vi.fn() };
}

/** One instruction PDF whose embedded images the parser expands. */
const INPUT = {
  caseId: 'case-1',
  messageId: 'msg-1',
  attachments: [
    { filename: 'LtrtoEngineerIn.pdf', contentType: 'application/pdf', blobPath: 'msg-1/LtrtoEngineerIn.pdf', size: 99_000 },
  ],
  caseVrm: 'KV64 EHB',
};

/** The engine-returned crops: the MGAA-badge shape (engine-kept, classifier-owned) + a photo. */
const BADGE_IMG = {
  filename: 'img_1_2.jpeg',
  content_type: 'image/jpeg',
  content_base64: Buffer.from('badge').toString('base64'),
  sha256: 'b'.repeat(64),
  sequence_index: 1,
};
const PHOTO_IMG = {
  filename: 'img_2_1.jpeg',
  content_type: 'image/jpeg',
  content_base64: Buffer.from('photo').toString('base64'),
  sha256: 'c'.repeat(64),
  sequence_index: 2,
};

const CLS_OTHER = { role: 'other', registrationVisible: false, plateText: '', personReflection: false, confidence: 0.9 };
const CLS_OVERVIEW = { role: 'overview', registrationVisible: true, plateText: 'KV64EHB', personReflection: false, confidence: 0.95 };

const persistedRows = (): Array<Record<string, unknown>> =>
  (dataApiMock.persistImageEvidence.mock.calls[0]?.[1] ?? []) as Array<Record<string, unknown>>;

function gatesOn(): void {
  process.env.PDF_MAPPER_ENABLED = 'true';
  process.env.IMAGE_ROLE_CLASSIFY_ENABLED = 'true';
  process.env.AI_MODEL_ENDPOINT = 'https://example.cognitiveservices.azure.com';
  process.env.AI_MODEL_DEPLOYMENT = 'gpt-5';
}

beforeEach(() => {
  gatesOn();
  fnClient.callExtractImages.mockReset();
  fnClient.callPlateOcr.mockReset();
  classifyImageMock.mockReset();
  for (const fn of Object.values(dataApiMock)) fn.mockClear();
  blobMock.downloadEvidenceBytes.mockClear();
  blobMock.uploadEvidenceBytes.mockClear();
  dataApiMock.workProviderAiAllowed.mockResolvedValue({ aiAllowed: null });
});
afterEach(() => {
  delete process.env.PDF_MAPPER_ENABLED;
  delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
  delete process.env.AI_MODEL_ENDPOINT;
  delete process.env.AI_MODEL_DEPLOYMENT;
});

describe('extractImages — TKT-089 classifier-gated suppression of non-vehicle crops', () => {
  it('(a) an "other" crop persists excluded=true with the domain reason (never mirror-eligible)', async () => {
    fnClient.callExtractImages.mockResolvedValue({ count: 1, images: [BADGE_IMG] });
    classifyImageMock.mockResolvedValue(CLS_OTHER);

    const res = (await activity.handler(INPUT, ctx())) as { extracted: number };
    expect(res.extracted).toBe(1);

    const rows = persistedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      imageRole: 'other',
      acceptedForEva: false,
      excluded: true,
      exclusionReason: 'This image may not show the vehicle',
      decisionSource: 'classifier',
    });
  });

  it('(b) recall guard — a genuine vehicle crop persists accepted and NOT excluded', async () => {
    fnClient.callExtractImages.mockResolvedValue({ count: 2, images: [BADGE_IMG, PHOTO_IMG] });
    classifyImageMock.mockResolvedValueOnce(CLS_OTHER).mockResolvedValueOnce(CLS_OVERVIEW);

    await activity.handler(INPUT, ctx());

    const rows = persistedRows();
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ excluded: true });
    expect(rows[1]).toMatchObject({
      imageRole: 'overview',
      acceptedForEva: true,
      registrationVisible: true,
      excluded: false,
      exclusionReason: null,
      decisionSource: 'classifier',
    });
  });

  it('(c) fail-open — classify null persists the row role-unknown and NOT excluded (recall protection)', async () => {
    fnClient.callExtractImages.mockResolvedValue({ count: 1, images: [PHOTO_IMG] });
    classifyImageMock.mockResolvedValue(null); // AOAI blip/content-filter — never throws

    await activity.handler(INPUT, ctx());

    const rows = persistedRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ imageRoleCode: 'unknown', acceptedForEva: false });
    expect('decisionSource' in rows[0]).toBe(false);
    expect('excluded' in rows[0]).toBe(false);
  });

  it('(d) gate off — classifyImage is never called; rows persist role-unknown (pre-classifier behaviour)', async () => {
    delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
    fnClient.callExtractImages.mockResolvedValue({ count: 1, images: [BADGE_IMG] });

    await activity.handler(INPUT, ctx());

    expect(classifyImageMock).not.toHaveBeenCalled();
    const rows = persistedRows();
    expect(rows[0]).toMatchObject({ imageRoleCode: 'unknown' });
    expect('excluded' in rows[0]).toBe(false);
    expect('decisionSource' in rows[0]).toBe(false);
  });

  it('logs the excludedNonVehicle counter in the summary event', async () => {
    fnClient.callExtractImages.mockResolvedValue({ count: 2, images: [BADGE_IMG, PHOTO_IMG] });
    classifyImageMock.mockResolvedValueOnce(CLS_OTHER).mockResolvedValueOnce(CLS_OVERVIEW);

    const c = ctx();
    await activity.handler(INPUT, c);

    const summary = c.log.mock.calls
      .map((args) => String(args[0]))
      .find((s) => s.includes('"evt":"extractImages"'));
    expect(summary).toBeTruthy();
    expect(JSON.parse(summary!)).toMatchObject({ extracted: 2, excludedNonVehicle: 1 });
  });
});
