import { describe, expect, it } from 'vitest';
import { buildTriageContextRequest, deriveAttachmentSignals } from './triagePolicy.js';
import type { InboundEnvelope } from './fetchMessage.js';
import type { InboundClassification } from './classifyInbound.js';

function envelope(overrides: Partial<InboundEnvelope> = {}): InboundEnvelope {
  return {
    messageId: 'msg-1',
    internetMessageId: '<msg-1@example.com>',
    conversationId: 'conv-1',
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

function classification(overrides: Partial<InboundClassification> = {}): InboundClassification {
  return {
    category: 'receiving_work',
    subtype: 'existing_provider_instruction',
    confidence: 0.95,
    signals: [],
    bodyVrm: '',
    bodyCaseref: '',
    bodyJobref: '',
    isReply: false,
    ...overrides,
  };
}

describe('buildTriageContextRequest', () => {
  it('prefers the envelope candidateRef/candidateVrm over the classifier body sniff', () => {
    const req = buildTriageContextRequest(
      envelope({ candidateRef: 'QDOS26001', candidateVrm: 'AB12CDE' }),
      classification({ bodyCaseref: 'IGNORED-REF', bodyVrm: 'IGNORED-VRM', bodyJobref: '576299' }),
    );
    expect(req).toEqual({
      caseref: 'QDOS26001',
      jobref: '576299',
      vrm: 'AB12CDE',
      internetMessageId: '<msg-1@example.com>',
      conversationId: 'conv-1',
    });
  });

  it('falls back to the classifier body sniff when the envelope has no candidateRef/candidateVrm', () => {
    const req = buildTriageContextRequest(
      envelope({ candidateRef: '', candidateVrm: '' }),
      classification({ bodyCaseref: 'SBL26149', bodyVrm: 'CD34EFG' }),
    );
    expect(req.caseref).toBe('SBL26149');
    expect(req.vrm).toBe('CD34EFG');
  });

  it('sends empty strings (never omits a key) when nothing is known', () => {
    const req = buildTriageContextRequest(
      envelope({ candidateRef: '', candidateVrm: '', internetMessageId: '', conversationId: '' }),
      classification(),
    );
    expect(req).toEqual({
      caseref: '',
      jobref: '',
      vrm: '',
      internetMessageId: '',
      conversationId: '',
    });
  });

  it('trims whitespace on every field', () => {
    const req = buildTriageContextRequest(
      envelope({ candidateRef: '  QDOS26001  ', candidateVrm: ' AB12CDE ' }),
      classification({ bodyJobref: ' 576299 ' }),
    );
    expect(req.caseref).toBe('QDOS26001');
    expect(req.vrm).toBe('AB12CDE');
    expect(req.jobref).toBe('576299');
  });
});

describe('deriveAttachmentSignals', () => {
  it('no attachments -> hasAttachments/imagesOnly both false, empty kinds', () => {
    const out = deriveAttachmentSignals(envelope({ attachments: [] }));
    expect(out).toEqual({ hasAttachments: false, attachmentKinds: [], imagesOnly: false });
  });

  it('all-image attachments -> imagesOnly true', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [
          { filename: 'photo1.jpg', contentType: 'image/jpeg', blobPath: 'a', size: 10 },
          { filename: 'photo2.png', contentType: 'image/png', blobPath: 'b', size: 20 },
        ],
      }),
    );
    expect(out.hasAttachments).toBe(true);
    expect(out.attachmentKinds).toEqual(['image', 'image']);
    expect(out.imagesOnly).toBe(true);
  });

  it('a mixed attachment set (instruction + image) -> imagesOnly false', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [
          { filename: 'engineer-report.pdf', contentType: 'application/pdf', blobPath: 'a', size: 10 },
          { filename: 'photo1.jpg', contentType: 'image/jpeg', blobPath: 'b', size: 20 },
        ],
      }),
    );
    expect(out.attachmentKinds).toEqual(['instruction', 'image']);
    expect(out.imagesOnly).toBe(false);
  });

  it('a single non-image attachment -> imagesOnly false', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [{ filename: 'invoice.pdf', contentType: 'application/pdf', blobPath: 'a', size: 10 }],
      }),
    );
    expect(out.hasAttachments).toBe(true);
    expect(out.imagesOnly).toBe(false);
  });

  it('a photos-in-a-PDF whose filename advertises images ("images - cvd.pdf") -> imagesOnly true (TKT-043 filename tier)', () => {
    // The extension-derived kind reads this as `instruction`, but the delivered evidence
    // is photos — the FILENAME tier recovers it so the triage policy yields
    // images_received, in lockstep with the classifier's _delivered_images_only.
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [{ filename: 'images - cvd.pdf', contentType: 'application/pdf', blobPath: 'a', size: 10 }],
      }),
    );
    expect(out.attachmentKinds).toEqual(['instruction']);
    expect(out.imagesOnly).toBe(true);
  });

  it('a non-image-advertising PDF alongside a signature logo (tkt093 Audatex shape) -> imagesOnly false', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [
          { filename: 'AJB14044.AudatexMS.pdf', contentType: 'application/pdf', blobPath: 'a', size: 10 },
          { filename: 'image001.png', contentType: 'image/png', blobPath: 'b', size: 10 },
        ],
      }),
    );
    expect(out.imagesOnly).toBe(false);
  });

  it('a signature logo ONLY (image001.png) -> imagesOnly false (PR#45: the all-image KIND fast-path must not fire on signatures)', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [{ filename: 'image001.png', contentType: 'image/png', blobPath: 'a', size: 10 }],
      }),
    );
    expect(out.attachmentKinds).toEqual(['image']); // kind IS image — but it is a signature
    expect(out.imagesOnly).toBe(false);
  });

  it('a real photo alongside a signature logo -> imagesOnly true (the non-signature photo is genuine evidence)', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [
          { filename: 'damage-front.jpg', contentType: 'image/jpeg', blobPath: 'a', size: 20 },
          { filename: 'image001.png', contentType: 'image/png', blobPath: 'b', size: 10 },
        ],
      }),
    );
    expect(out.imagesOnly).toBe(true);
  });

  it('TKT-307 regression: a six-digit Outlook cid signature logo ONLY (image078315.png) -> imagesOnly false', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [{ filename: 'image078315.png', contentType: 'image/png', blobPath: 'a', size: 10 }],
      }),
    );
    expect(out.imagesOnly).toBe(false);
  });
});
