import { createHash } from 'node:crypto';
import type { HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { EVA_FIELD_ORDER } from '@cs/domain';
import { imageRoleCodec } from '@cs/domain/codecs';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EVA_COLUMN_BY_KEY } from '../../shared/mapping/index.js';

interface Registration {
  handler: (req: HttpRequest, ctx: InvocationContext) => Promise<HttpResponseInit>;
}

const registrations = vi.hoisted(() => new Map<string, Registration>());
vi.mock('@azure/functions', () => ({
  app: {
    http: (name: string, options: Registration) => registrations.set(name, options),
    timer: () => {},
  },
}));

const db = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn() }));
vi.mock('../../platform/db/client.js', () => ({ query: db.query, tx: db.tx }));

const evidence = vi.hoisted(() => ({ downloadEvidenceBytes: vi.fn() }));
vi.mock('../evidence/blob-store.js', () => ({ downloadEvidenceBytes: evidence.downloadEvidenceBytes }));

vi.mock('../inbound/internal/service-support.js', () => ({
  AUDIT_ACTION_BY_NAME: {},
  withServiceAuth: async (
    req: HttpRequest,
    ctx: InvocationContext,
    next: Registration['handler'],
  ) => next(req, ctx),
}));
vi.mock('./mutation-locks.js', () => ({ lockCaseForMutation: vi.fn() }));
vi.mock('../../shared/audit.js', () => ({ AUDIT_ACTION: {}, writeAudit: vi.fn() }));

await import('./internal-operations-routes.js');

const handler = registrations.get('internalEvaSubmission')!.handler;
const ctx = { error: vi.fn(), log: vi.fn() } as unknown as InvocationContext;

function request(caseId = 'case-1'): HttpRequest {
  return { params: { id: caseId } } as unknown as HttpRequest;
}

describe('internal EVA submission payload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the twelve-field core and ordered accepted image bytes with a stable hash', async () => {
    const caseRow: Record<string, unknown> = {
      case_po: 'qdos26001',
      case_ref: 'fallback-ref',
      ov_claim_number: 'CLM-42',
      vrm: 'AB12 CDE',
    };
    for (const [index, field] of EVA_FIELD_ORDER.entries()) {
      caseRow[EVA_COLUMN_BY_KEY[field.key]] = `value-${index + 1}`;
    }
    db.query
      .mockResolvedValueOnce([caseRow])
      .mockResolvedValueOnce([
        {
          file_name: 'overview.jpg',
          image_role_code: imageRoleCodec.toInt('overview'),
          registration_visible: true,
          sequence_index: 2,
          storage_path: 'case-1/overview.jpg',
        },
      ]);
    evidence.downloadEvidenceBytes.mockResolvedValue({ bytes: Buffer.from('image-bytes') });

    const response = await handler(request(), ctx);
    expect(response.status).toBe(200);
    const body = response.jsonBody as Record<string, unknown>;
    const unhashed = {
      evaPayload12: Object.fromEntries(EVA_FIELD_ORDER.map((field, index) => [
        field.payloadKey,
        `value-${index + 1}`,
      ])),
      images: [{
        filename: 'overview.jpg',
        role: 'overview',
        registrationVisible: true,
        sequenceIndex: 2,
        content: Buffer.from('image-bytes').toString('base64'),
      }],
      casePo: 'qdos26001',
      vrm: 'AB12 CDE',
      clmNo: 'CLM-42',
    };
    expect(body).toEqual({
      ...unhashed,
      payloadHash: createHash('sha256').update(JSON.stringify(unhashed), 'utf8').digest('hex'),
    });
    expect(evidence.downloadEvidenceBytes).toHaveBeenCalledWith('case-1/overview.jpg');
  });

  it('returns not found without reading evidence when the case does not exist', async () => {
    db.query.mockResolvedValueOnce([]);

    await expect(handler(request('missing'), ctx)).resolves.toMatchObject({
      status: 404,
      jsonBody: { error: 'case not found' },
    });
    expect(evidence.downloadEvidenceBytes).not.toHaveBeenCalled();
  });

  it('fails closed when an accepted image has no durable byte locator', async () => {
    db.query
      .mockResolvedValueOnce([{
        case_po: 'qdos26001',
        case_ref: 'ref',
        ov_claim_number: 'claim',
        vrm: 'AB12CDE',
      }])
      .mockResolvedValueOnce([{ file_name: 'missing.jpg', storage_path: null }]);

    await expect(handler(request(), ctx)).resolves.toMatchObject({
      status: 409,
      jsonBody: { error: 'accepted image bytes are not available in evidence storage' },
    });
    expect(evidence.downloadEvidenceBytes).not.toHaveBeenCalled();
  });
});
