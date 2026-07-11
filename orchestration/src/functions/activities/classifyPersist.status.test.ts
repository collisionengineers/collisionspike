import { beforeEach, describe, expect, it, vi } from 'vitest';

const activities = vi.hoisted(() => new Map<string, { handler: (input: unknown, ctx: unknown) => Promise<unknown> }>());
vi.mock('durable-functions', () => ({
  app: { activity: (name: string, options: { handler: (input: unknown, ctx: unknown) => Promise<unknown> }) => activities.set(name, options) },
}));

const dataApiMock = vi.hoisted(() => ({
  persistEvidence: vi.fn(),
  recordAudit: vi.fn(),
  workProviderAiAllowed: vi.fn(),
  evaluateStatus: vi.fn(),
}));
vi.mock('../../lib/data-api.js', () => ({ dataApi: dataApiMock }));
vi.mock('../../lib/blob.js', () => ({
  downloadEvidenceBytes: vi.fn(),
  uploadEvidenceBytes: vi.fn(),
}));
vi.mock('../../lib/image-classify.js', () => ({
  classifyImage: vi.fn(),
  classificationToEvidenceFields: vi.fn(),
}));

await import('./classifyPersist.js');
const activity = activities.get('classifyPersist')!;

const input = {
  caseId: 'case-1',
  inbound: {
    messageId: 'msg-1',
    internetMessageId: '<msg-1@example.test>',
    body: '',
    attachments: [{
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
      blobPath: 'msg-1/photo.jpg',
      size: 123,
      sha256: 'a'.repeat(64),
    }],
  },
};
const ctx = { log: vi.fn(), warn: vi.fn() };

beforeEach(() => {
  delete process.env.IMAGE_ROLE_CLASSIFY_ENABLED;
  dataApiMock.persistEvidence.mockReset().mockResolvedValue({
    persisted: 1,
    updated: 0,
    merged: 0,
    statusGeneration: 11,
  });
  dataApiMock.recordAudit.mockReset().mockResolvedValue(undefined);
  dataApiMock.workProviderAiAllowed.mockReset().mockResolvedValue({ aiAllowed: null });
  dataApiMock.evaluateStatus.mockReset().mockResolvedValue({
    value: 'needs_review', completed: true, pending: false,
  });
  ctx.log.mockReset();
  ctx.warn.mockReset();
});

describe('classifyPersist status generation', () => {
  it('atomically evaluates and acknowledges the exact persistence generation', async () => {
    await activity.handler(input, ctx);
    expect(dataApiMock.evaluateStatus).toHaveBeenCalledWith('case-1', 11);
  });

  it('does not acknowledge when evaluation fails', async () => {
    dataApiMock.evaluateStatus.mockRejectedValueOnce(new Error('status unavailable'));
    await expect(activity.handler(input, ctx)).resolves.toMatchObject({ persisted: 1 });
    expect(ctx.warn).toHaveBeenCalledWith(expect.stringContaining('remains pending'));
  });
});
