import { describe, expect, it } from 'vitest';
import { buildClassifyRequest } from './classifyInbound.js';
import type { InboundEnvelope } from './fetchMessage.js';

function envelope(overrides: Partial<InboundEnvelope> = {}): InboundEnvelope {
  return {
    messageId: 'msg-1',
    internetMessageId: '<msg-1@example.com>',
    subject: 'New instruction — AB12CDE',
    senderAddress: 'ops@provider.example',
    receivedAt: '2026-07-02T09:00:00Z',
    sourceMailbox: 'info@collisionengineers.example',
    payloadHash: 'hash',
    candidateVrm: 'AB12CDE',
    candidateRef: '',
    body: 'Please inspect this vehicle.',
    bodyPreview: 'Please inspect this vehicle.',
    inReplyTo: '',
    references: '',
    attachments: [],
    ...overrides,
  };
}

describe('buildClassifyRequest', () => {
  it('maps the envelope fields onto the classify-email request shape', () => {
    const req = buildClassifyRequest(envelope(), 'matched');

    expect(req.subject).toBe('New instruction — AB12CDE');
    expect(req.from).toBe('ops@provider.example');
    expect(req.senderDomain).toBe('provider.example');
    expect(req.providerMatchState).toBe('one');
    expect(req.hasAttachments).toBe(false);
    expect(req.attachmentKinds).toEqual([]);
    expect(req.attachmentFilenames).toEqual([]);
  });

  it('derives attachment_filenames alongside attachment_kinds from the envelope attachments', () => {
    const req = buildClassifyRequest(
      envelope({
        attachments: [
          { filename: 'engineer-report.pdf', contentType: 'application/pdf', blobPath: 'x', size: 10 },
          { filename: 'photo1.jpg', contentType: 'image/jpeg', blobPath: 'y', size: 20 },
        ],
      }),
      'unmatched',
    );

    expect(req.attachmentFilenames).toEqual(['engineer-report.pdf', 'photo1.jpg']);
    expect(req.attachmentKinds).toEqual(['instruction', 'image']);
    expect(req.hasAttachments).toBe(true);
    expect(req.providerMatchState).toBe('none');
  });

  it('defaults an absent match state to none (unmatched)', () => {
    const req = buildClassifyRequest(envelope());
    expect(req.providerMatchState).toBe('none');
  });

  it('maps an ambiguous match state through unchanged', () => {
    const req = buildClassifyRequest(envelope(), 'ambiguous');
    expect(req.providerMatchState).toBe('ambiguous');
  });

  it('carries the reply headers through untouched', () => {
    const req = buildClassifyRequest(
      envelope({ inReplyTo: '<parent@example.com>', references: '<parent@example.com>' }),
    );
    expect(req.inReplyTo).toBe('<parent@example.com>');
    expect(req.references).toBe('<parent@example.com>');
  });
});
