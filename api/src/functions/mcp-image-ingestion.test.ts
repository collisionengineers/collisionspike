import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import type { JWTPayload } from 'jose';
import { statusToInt } from '@cs/domain/codecs';
import {
  createImageIngestExecutor,
  preflightBase64Batch,
  resolveImageIngestCase,
  type ImageIngestDependencies,
  type ImagePipelineState,
} from './mcp-image-ingestion.js';

const ctx = { log: vi.fn(), error: vi.fn(), warn: vi.fn() } as unknown as InvocationContext;
const claims = {
  roles: ['CollisionSpike.ImageIngest'],
  oid: 'sp-image-agent',
  azp: 'client-image-agent',
} as JWTPayload;

interface TestCandidateRow extends Record<string, unknown> {
  id: string;
  case_po: string | null;
  status_code: number;
  on_hold: boolean;
  duplicate_keys: unknown;
  box_folder_id: string | null;
}

const openRow: TestCandidateRow = {
  id: 'case-1',
  case_po: 'QDOS26079',
  status_code: statusToInt('missing_images'),
  on_hold: false,
  duplicate_keys: null,
  box_folder_id: 'folder-under-approved-root',
};

function pipeline(
  overrides: Partial<ImagePipelineState> = {},
): ImagePipelineState {
  return {
    files: [{
      evidenceId: 'ev-1',
      fileName: 'photo.jpg',
      classification: 'pending',
      archive: 'waiting_for_image_check',
    }],
    readiness: { state: 'pending', currentStatus: 'missing_images', queue: 'Not ready' },
    ...overrides,
  };
}

function dependencies(input: {
  rows?: TestCandidateRow[];
  upload?: (request: HttpRequest) => Promise<HttpResponseInit>;
  state?: ImagePipelineState;
} = {}): ImageIngestDependencies {
  return {
    listCandidates: vi.fn(async () => input.rows ?? [openRow]),
    verifyArchiveTarget: vi.fn(async () => ({ writable: true, rootId: '392761581105' })),
    upload: vi.fn(async (request) =>
      input.upload?.(request) ?? {
        status: 201,
        jsonBody: {
          added: [{ fileIndex: 0, fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: false }],
          rejected: [],
        },
      }),
    readPipelineState: vi.fn(async () => input.state ?? pipeline()),
  };
}

const IMAGE = Buffer.from('harmless-image-fixture').toString('base64');
const KEY = 'folder-watcher:batch:0001';

function uploadArgs(files: unknown[] = [{
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  dataBase64: IMAGE,
}]) {
  return { registration: 'sp23 obx', idempotencyKey: KEY, files };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.MCP_IMAGE_INGEST_ENABLED = 'true';
  process.env.MCP_IMAGE_INGEST_BOX_ROOT_ID = '392761581105';
  process.env.BOX_FOLDER_ROOT_ID = '392761581105';
  process.env.BOX_API_ENABLED = 'true';
  process.env.BOX_FN_URL = 'https://box-function.example';
  process.env.BOX_FN_KEY = 'test-function-key';
});

describe('TKT-154 registration resolution', () => {
  it('canonicalises spaced registrations and exposes only minimum case identity/status', async () => {
    const deps = dependencies();
    const exec = createImageIngestExecutor(deps);
    const result = await exec(
      'lookup_open_case_by_registration',
      { registration: 'sp23 obx' },
      { claims, context: ctx },
    ) as Record<string, unknown>;

    expect(deps.listCandidates).toHaveBeenCalledWith('SP23OBX');
    expect(result).toMatchObject({
      ok: true,
      code: 'exact_match',
      registration: 'SP23OBX',
      match: { casePo: 'QDOS26079', status: 'missing_images', queue: 'Not ready' },
    });
    expect(result).not.toHaveProperty('caseId');
    expect(JSON.stringify(result)).not.toContain('folder-under-approved-root');
  });

  it('refuses invalid, absent, ambiguous, merged and terminal matches without guessing', async () => {
    expect(await resolveImageIngestCase('not a plate', dependencies())).toMatchObject({
      ok: false,
      code: 'invalid_registration',
    });
    expect(await resolveImageIngestCase('SP23OBX', dependencies({ rows: [] }))).toMatchObject({
      ok: false,
      code: 'no_match',
    });
    expect(await resolveImageIngestCase('SP23OBX', dependencies({ rows: [openRow, { ...openRow, id: 'case-2' }] }))).toMatchObject({
      ok: false,
      code: 'ambiguous_match',
    });
    expect(await resolveImageIngestCase('SP23OBX', dependencies({
      rows: [{ ...openRow, duplicate_keys: JSON.stringify({ mergedInto: 'case-new' }) }],
    }))).toMatchObject({ ok: false, code: 'ineligible_case' });
    expect(await resolveImageIngestCase('SP23OBX', dependencies({
      rows: [{ ...openRow, status_code: statusToInt('done') }],
    }))).toMatchObject({ ok: false, code: 'ineligible_case' });
    expect(await resolveImageIngestCase('SP23OBX', dependencies({
      rows: [{ ...openRow, status_code: statusToInt('error') }],
    }))).toMatchObject({ ok: false, code: 'ineligible_case' });
  });

  it('refuses a case without a server-owned Archive target', async () => {
    expect(await resolveImageIngestCase('SP23OBX', dependencies({
      rows: [{ ...openRow, box_folder_id: null }],
    }))).toMatchObject({ ok: false, code: 'archive_target_unavailable' });
  });

  it('refuses an unset, wrong or out-of-root facade attestation', async () => {
    for (const attestation of [
      { writable: false, rootId: '392761581105' },
      { writable: true, rootId: 'wrong-root' },
    ]) {
      const deps = dependencies();
      deps.verifyArchiveTarget = vi.fn(async () => attestation);
      expect(await resolveImageIngestCase('SP23OBX', deps)).toMatchObject({
        ok: false,
        code: 'archive_target_unavailable',
      });
    }
    const failed = dependencies();
    failed.verifyArchiveTarget = vi.fn(async () => { throw new Error('scope lock missing'); });
    expect(await resolveImageIngestCase('SP23OBX', failed)).toMatchObject({
      ok: false,
      code: 'archive_target_unavailable',
    });
  });
});

describe('TKT-154 bounded canonical upload', () => {
  it('rejects a cumulative payload from encoded lengths before retaining decoded buffers', () => {
    expect(preflightBase64Batch([
      { dataBase64: 'AAAA' },
      { dataBase64: 'AAAA' },
    ], 5)).toEqual({ ok: false, decodedBytes: 6 });
  });

  it('stays dark unless both independent Archive root settings equal the programme test root', async () => {
    const deps = dependencies();
    const exec = createImageIngestExecutor(deps);
    process.env.MCP_IMAGE_INGEST_BOX_ROOT_ID = 'some-other-root';
    const result = await exec('upload_case_images', uploadArgs(), { claims, context: ctx });
    expect(result).toMatchObject({ ok: false, code: 'ingest_disabled' });
    expect(deps.listCandidates).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('refuses client-selected case and Archive folder fields instead of ignoring them', async () => {
    const deps = dependencies();
    const exec = createImageIngestExecutor(deps);
    const result = await exec('upload_case_images', {
      ...uploadArgs(),
      caseId: 'case-other',
      folderId: 'folder-outside-root',
    }, { claims, context: ctx });
    expect(result).toMatchObject({ ok: false, code: 'invalid_arguments' });
    expect(deps.listCandidates).not.toHaveBeenCalled();
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('re-resolves the registration and hands normalised image bytes to the TKT-165 seam', async () => {
    let form!: FormData;
    const deps = dependencies({
      upload: async (request) => {
        form = await request.formData();
        expect(request.params).toEqual({ id: 'case-1' });
        expect(request.headers.get('idempotency-key')).toBe(KEY);
        return {
          status: 201,
          jsonBody: {
            added: [{ fileIndex: 0, fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: false }],
            rejected: [],
          },
        };
      },
    });
    const exec = createImageIngestExecutor(deps);
    const result = await exec(
      'upload_case_images',
      uploadArgs([{ fileName: '../camera\\pho\u202eto.jpg', contentType: 'image/jpeg', dataBase64: IMAGE }]),
      { claims, context: ctx },
    ) as Record<string, unknown>;

    expect(deps.listCandidates).toHaveBeenCalledWith('SP23OBX');
    expect(form.get('source')).toBe('mcp_agent');
    expect(form.get('registration')).toBe('SP23OBX');
    const file = form.get('file') as File;
    expect(file.name).toBe('pho_to.jpg');
    expect(result).toMatchObject({
      ok: false,
      code: 'accepted_pending_processing',
      files: [{ durable: true, classification: 'pending' }],
      readiness: { state: 'pending' },
    });
    expect(JSON.stringify(result)).not.toContain('ev-1');
  });

  it('rejects non-images, invalid base64, oversized payloads and excessive counts before upload', async () => {
    const deps = dependencies();
    const exec = createImageIngestExecutor(deps);
    const rejected = await exec('upload_case_images', uploadArgs([
      { fileName: 'document.pdf', contentType: 'application/pdf', dataBase64: IMAGE },
      { fileName: 'bad.jpg', contentType: 'image/jpeg', dataBase64: '***not-base64***' },
      { fileName: 'huge.jpg', contentType: 'image/jpeg', dataBase64: 'A'.repeat((15 * 1024 * 1024 * 4 / 3) + 8) },
    ]), { claims, context: ctx }) as Record<string, unknown>;
    expect(rejected).toMatchObject({ ok: false, code: 'batch_rejected' });
    expect(deps.upload).not.toHaveBeenCalled();

    const tooMany = await exec(
      'upload_case_images',
      uploadArgs(Array.from({ length: 21 }, (_, index) => ({
        fileName: `${index}.jpg`, contentType: 'image/jpeg', dataBase64: IMAGE,
      }))),
      { claims, context: ctx },
    );
    expect(tooMany).toMatchObject({ ok: false, code: 'invalid_batch' });
    expect(deps.upload).not.toHaveBeenCalled();
  });

  it('returns a retry-safe duplicate as complete only after durable processing readback', async () => {
    const deps = dependencies({
      upload: async () => ({
        status: 200,
        jsonBody: {
          added: [{ fileIndex: 0, fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: true }],
          rejected: [],
        },
      }),
      state: pipeline({
        files: [{ evidenceId: 'ev-1', fileName: 'photo.jpg', classification: 'complete', archive: 'complete' }],
        readiness: { state: 'current', currentStatus: 'needs_review', queue: 'Review' },
      }),
    });
    const exec = createImageIngestExecutor(deps);
    const first = await exec('upload_case_images', uploadArgs(), { claims, context: ctx });
    const second = await exec('upload_case_images', uploadArgs(), { claims, context: ctx });

    expect(first).toMatchObject({ ok: true, code: 'complete', files: [{ outcome: 'already_attached' }] });
    expect(second).toMatchObject({ ok: true, code: 'complete', files: [{ outcome: 'already_attached' }] });
    expect(deps.upload).toHaveBeenCalledTimes(2);
  });

  it('reports partial canonical refusal and Archive retry state without claiming success', async () => {
    const deps = dependencies({
      upload: async () => ({
        status: 207,
        jsonBody: {
          added: [{ fileIndex: 0, fileName: 'photo.jpg', evidenceId: 'ev-1', duplicate: false }],
          rejected: [{ fileIndex: 1, fileName: 'second.jpg', reason: 'That file was not added.' }],
        },
      }),
      state: pipeline({
        files: [{
          evidenceId: 'ev-1',
          fileName: 'photo.jpg',
          classification: 'complete',
          archive: 'retry_pending',
        }],
        readiness: { state: 'pending', currentStatus: 'missing_images', queue: 'Not ready' },
      }),
    });
    const exec = createImageIngestExecutor(deps);
    const result = await exec('upload_case_images', uploadArgs([
      { fileName: 'photo.jpg', contentType: 'image/jpeg', dataBase64: IMAGE },
      { fileName: 'second.jpg', contentType: 'image/jpeg', dataBase64: IMAGE },
    ]), { claims, context: ctx });

    expect(result).toMatchObject({
      ok: false,
      code: 'partial',
      files: [
        { outcome: 'accepted', archive: 'retry_pending' },
        { outcome: 'rejected' },
      ],
      readiness: { state: 'pending' },
    });
    expect(JSON.stringify(result)).not.toContain('temporary Archive failure');
  });

  it('returns a retry-safe, sanitized result when the canonical upload outcome is unknown', async () => {
    const deps = dependencies({
      upload: async () => { throw new Error('postgres password and backend trace'); },
    });
    const exec = createImageIngestExecutor(deps);
    const result = await exec('upload_case_images', uploadArgs(), { claims, context: ctx });

    expect(result).toMatchObject({
      ok: false,
      code: 'write_state_unconfirmed',
      files: [{ outcome: 'retry_required', durable: 'unknown' }],
      note: expect.stringContaining('same idempotency key'),
    });
    expect(JSON.stringify(result)).not.toContain('postgres password');
  });

  it('retains a safe durable receipt when processing-state readback fails', async () => {
    const deps = dependencies();
    deps.readPipelineState = vi.fn(async () => { throw new Error('archive backend details'); });
    const exec = createImageIngestExecutor(deps);
    const result = await exec('upload_case_images', uploadArgs(), { claims, context: ctx });

    expect(result).toMatchObject({
      ok: false,
      code: 'incomplete_readback',
      files: [{ outcome: 'accepted', durable: true, classification: 'unknown', archive: 'unknown' }],
    });
    expect(JSON.stringify(result)).not.toContain('archive backend details');
    expect(JSON.stringify(result)).not.toContain('ev-1');
  });
});
