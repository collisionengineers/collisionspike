/**
 * classifyPersist row assembly (TKT-133) — the email-attachment evidence lane must carry
 * each attachment's sha256 (hashed at blob landing) so the Data API can dedup/link the
 * Box FILE.UPLOADED mirror twin on (case_id, sha256). Pure builder only — no Durable
 * harness (the triagePolicy.test.ts convention).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Activity harness for the handler-level tests below (the classifyPersist.status.test.ts
// convention) — the pure-builder tests are unaffected by the mocks.
const activities = vi.hoisted(() =>
  new Map<string, { handler: (input: unknown, ctx: unknown) => Promise<unknown> }>(),
);
vi.mock('durable-functions', () => ({
  app: {
    activity: (name: string, options: { handler: (input: unknown, ctx: unknown) => Promise<unknown> }) =>
      activities.set(name, options),
  },
}));
const dataApiMock = vi.hoisted(() => ({
  persistEvidence: vi.fn(),
  recordAudit: vi.fn(),
  workProviderAiAllowed: vi.fn(),
  evaluateStatus: vi.fn(),
}));
vi.mock('../../adapters/data-api.js', () => ({ dataApi: dataApiMock }));
const blobMock = vi.hoisted(() => ({
  downloadEvidenceBytes: vi.fn(),
  uploadEvidenceBytes: vi.fn(),
}));
vi.mock('../../platform/blob.js', () => blobMock);
vi.mock('../../platform/image-classify.js', () => ({
  classifyImage: vi.fn(),
  classificationToEvidenceFields: vi.fn(),
}));

import { buildBaseEvidenceRows } from './classifyPersist.js';
import type { InboundEnvelope } from '../intake/fetchMessage.js';

const SHA_A = 'a'.repeat(64);
const SHA_B = 'b'.repeat(64);
const SHA_EML = 'e'.repeat(64);

function attachment(
  overrides: Partial<InboundEnvelope['attachments'][number]> = {},
): InboundEnvelope['attachments'][number] {
  return {
    filename: 'IMG_0421.jpg',
    contentType: 'image/jpeg',
    blobPath: 'msg-1/IMG_0421.jpg',
    size: 123_456,
    sha256: SHA_A,
    ...overrides,
  };
}

describe('buildBaseEvidenceRows — TKT-133 sha256 carry-through', () => {
  it('carries sha256 onto every attachment row', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [
        attachment(),
        attachment({ filename: 'instruction.pdf', contentType: 'application/pdf', blobPath: 'msg-1/instruction.pdf', sha256: SHA_B }),
      ],
    });
    expect(rows).toHaveLength(2);
    expect(rows[0].sha256).toBe(SHA_A);
    expect(rows[1].sha256).toBe(SHA_B);
  });

  it('still classifies via describeEvidence (image vs instruction) alongside the hash', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [
        attachment(),
        attachment({ filename: 'instruction.pdf', contentType: 'application/pdf', blobPath: 'msg-1/instruction.pdf', sha256: SHA_B }),
      ],
    });
    expect(rows[0].evidenceClass).toBe('image');
    expect(rows[0].isImage).toBe(true);
    expect(rows[1].evidenceClass).toBe('instruction');
    expect(rows[1].isInstruction).toBe(true);
  });

  it('omits sha256 entirely when the envelope predates the hash (replay-safe)', () => {
    const withoutHash = attachment();
    delete (withoutHash as { sha256?: string }).sha256;
    const rows = buildBaseEvidenceRows({ attachments: [withoutHash] });
    expect(rows).toHaveLength(1);
    expect('sha256' in rows[0]).toBe(false);
  });

  it('adds the raw .eml row as email-class evidence with its own sha256', () => {
    const rows = buildBaseEvidenceRows({
      attachments: [attachment()],
      rawEml: {
        filename: 'message-ab12cd34.eml',
        contentType: 'message/rfc822',
        blobPath: 'msg-1/message-ab12cd34.eml',
        size: 17_600_000,
        sha256: SHA_EML,
      },
    });
    expect(rows).toHaveLength(2);
    const eml = rows[1];
    expect(eml.evidenceClass).toBe('email');
    expect(eml.isImage).toBe(false);
    expect(eml.isInstruction).toBe(false);
    expect(eml.sha256).toBe(SHA_EML);
  });

  it('omits the raw .eml row when the $value capture failed (rawEml absent)', () => {
    const rows = buildBaseEvidenceRows({ attachments: [attachment()] });
    expect(rows).toHaveLength(1);
  });
});

describe('classifyPersist — bodyInstructionFallback opt-out (TKT-225)', () => {
  const activity = () => activities.get('classifyPersist')!;
  // ≥ MIN_BODY_INSTRUCTION_CHARS (40) — would mint a body-instruction row by default.
  const LONG_BODY =
    'Please inspect the vehicle at your earliest convenience and send us the report.';

  function inboundWithBody() {
    return {
      messageId: 'msg-2',
      internetMessageId: '<msg-2@example.test>',
      body: LONG_BODY,
      attachments: [attachment({ blobPath: 'msg-2/IMG_0421.jpg' })],
    };
  }
  const ctx = { log: vi.fn(), warn: vi.fn() };

  beforeEach(() => {
    delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
    delete process.env.AUDIT_CASES_ENABLED;
    dataApiMock.persistEvidence
      .mockReset()
      .mockResolvedValue({ persisted: 1, updated: 0, merged: 0, statusGeneration: 7 });
    dataApiMock.recordAudit.mockReset().mockResolvedValue(undefined);
    dataApiMock.workProviderAiAllowed.mockReset().mockResolvedValue({ aiAllowed: null });
    dataApiMock.evaluateStatus
      .mockReset()
      .mockResolvedValue({ value: 'needs_review', completed: true, pending: false });
    blobMock.uploadEvidenceBytes
      .mockReset()
      .mockResolvedValue({ blobPath: 'msg-2/body.txt', size: 42, sha256: 'f'.repeat(64) });
    ctx.log.mockReset();
    ctx.warn.mockReset();
  });

  function persistedRows(): Array<{ evidenceClass: string; contentType: string }> {
    return dataApiMock.persistEvidence.mock.calls[0][1] as Array<{
      evidenceClass: string;
      contentType: string;
    }>;
  }

  it('default (flag absent): an instruction-less ≥40-char body still mints the body-instruction row', async () => {
    await activity().handler({ caseId: 'case-1', inbound: inboundWithBody() }, ctx);
    expect(
      persistedRows().some((r) => r.evidenceClass === 'instruction' && r.contentType === 'text/plain'),
    ).toBe(true);
    expect(blobMock.uploadEvidenceBytes).toHaveBeenCalledTimes(1);
  });

  it('explicit true: unchanged behaviour', async () => {
    await activity().handler(
      { caseId: 'case-1', inbound: inboundWithBody(), bodyInstructionFallback: true },
      ctx,
    );
    expect(persistedRows().some((r) => r.evidenceClass === 'instruction')).toBe(true);
  });

  it('bodyInstructionFallback:false suppresses the body-instruction row (retro related ingest)', async () => {
    await activity().handler(
      { caseId: 'case-1', inbound: inboundWithBody(), bodyInstructionFallback: false },
      ctx,
    );
    expect(persistedRows().some((r) => r.evidenceClass === 'instruction')).toBe(false);
    expect(blobMock.uploadEvidenceBytes).not.toHaveBeenCalled();
  });
});
