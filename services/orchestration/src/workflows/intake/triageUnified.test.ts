import { describe, expect, it } from 'vitest';
import { decideTriage, type TriagePolicyContext } from '@cs/domain';
import {
  buildPreClassifyContextRequest,
  buildWidenedTriageContextRequest,
  buildParseFedClassifyRequest,
  resolveOpenCaseRefMatchState,
  deriveContentTypings,
  toPolicyClassification,
  buildTriageContextRequest,
  deriveAttachmentSignals,
} from './triageUnified.js';
import { buildClassifyRequest } from './classifyInbound.js';
import type { InboundEnvelope } from './fetchMessage.js';
import type { InboundClassification } from './classifyInbound.js';

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
    conversationId: 'conv-1',
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
    confidence: 0.9,
    signals: [],
    bodyVrm: '',
    bodyCaseref: '',
    bodyJobref: '',
    isReply: false,
    ...overrides,
  };
}

/* ----------  Gate-off structural equivalence  ----------
 * triageUnified's gate-off path reuses buildClassifyRequest (unchanged import) and
 * buildWidenedTriageContextRequest with parsed={} — this proves the latter produces
 * BYTE-IDENTICAL output to triagePolicy.ts's own buildTriageContextRequest across
 * representative fixtures, which is the one new computation triageUnified introduces on
 * the gate-off path (everything else is literally the same imported function). */
describe('triageUnified — gate-off parity with classifyInbound + triagePolicy', () => {
  const fixtures: Array<{ name: string; env: InboundEnvelope; cls: InboundClassification }> = [
    { name: 'bare email, nothing populated', env: envelope({ candidateVrm: '', candidateRef: '' }), cls: classification() },
    { name: 'candidate VRM only', env: envelope({ candidateVrm: 'AB12CDE', candidateRef: '' }), cls: classification() },
    { name: 'candidate ref only', env: envelope({ candidateVrm: '', candidateRef: 'QDOS26001' }), cls: classification() },
    {
      name: 'body-extracted refs only (no candidate)',
      env: envelope({ candidateVrm: '', candidateRef: '' }),
      cls: classification({ bodyVrm: 'XY99ZZZ', bodyCaseref: 'PCH26002', bodyJobref: '576299' }),
    },
    {
      name: 'candidate AND body both populated (candidate should win, matching today)',
      env: envelope({ candidateVrm: 'AB12CDE', candidateRef: 'QDOS26001' }),
      cls: classification({ bodyVrm: 'XY99ZZZ', bodyCaseref: 'PCH26002', bodyJobref: '576299' }),
    },
  ];

  it.each(fixtures)('buildWidenedTriageContextRequest(.., {}) === buildTriageContextRequest(..) — $name', ({ env, cls }) => {
    expect(buildWidenedTriageContextRequest(env, cls)).toEqual(buildTriageContextRequest(env, cls));
  });

  it('buildParseFedClassifyRequest extends buildClassifyRequest\'s exact base fields', () => {
    const env = envelope({
      attachments: [{ filename: 'instruction.pdf', contentType: 'application/pdf', blobPath: 'x', size: 1 }],
    });
    const base = buildClassifyRequest(env, 'matched');
    const extended = buildParseFedClassifyRequest(env, 'matched', 'one', [{ filename: 'instruction.pdf', docType: 'report' }]);
    expect(extended).toMatchObject(base);
    expect(extended.openCaseRefMatch).toBe('one');
    expect(extended.attachmentContentTypings).toEqual([{ filename: 'instruction.pdf', docType: 'report' }]);
  });
});

/* ----------  D1 Lookup A/B — pure builders  ---------- */

describe('buildPreClassifyContextRequest (D1 Lookup A)', () => {
  it('uses only candidate fields when no parse result exists yet (Slice 4a)', () => {
    const req = buildPreClassifyContextRequest(envelope({ candidateVrm: 'AB12CDE', candidateRef: 'QDOS26001' }));
    expect(req).toEqual({
      caseref: 'QDOS26001',
      jobref: '',
      vrm: 'AB12CDE',
      internetMessageId: '<msg-1@example.com>',
      conversationId: 'conv-1',
    });
  });

  it('prefers a parser value over candidate once one exists (Slice 4b forward-compat)', () => {
    const req = buildPreClassifyContextRequest(
      envelope({ candidateVrm: 'AB12CDE', candidateRef: 'QDOS26001' }),
      { parserVrm: 'XY99ZZZ', parserRef: 'PCH26002' },
    );
    expect(req.vrm).toBe('XY99ZZZ');
    expect(req.caseref).toBe('PCH26002');
    expect(req.jobref).toBe('PCH26002');
  });

  it('defaults to empty strings when nothing is available', () => {
    const req = buildPreClassifyContextRequest(envelope({ candidateVrm: '', candidateRef: '' }));
    expect(req.caseref).toBe('');
    expect(req.vrm).toBe('');
  });
});

describe('resolveOpenCaseRefMatchState', () => {
  it('returns none for zero matches', () => {
    expect(resolveOpenCaseRefMatchState([])).toBe('none');
  });

  it('returns one for a single distinct case', () => {
    expect(resolveOpenCaseRefMatchState([{ caseId: 'case-1' }])).toBe('one');
  });

  it('returns one even with duplicate rows for the same case (matched_on case_po AND job_ref)', () => {
    expect(
      resolveOpenCaseRefMatchState([{ caseId: 'case-1' }, { caseId: 'case-1' }]),
    ).toBe('one');
  });

  it('returns ambiguous for more than one distinct case', () => {
    expect(
      resolveOpenCaseRefMatchState([{ caseId: 'case-1' }, { caseId: 'case-2' }]),
    ).toBe('ambiguous');
  });
});

describe('deriveContentTypings', () => {
  it('returns [] when no attachment typings are supplied (Slice 4a — no parse result yet)', () => {
    expect(deriveContentTypings()).toEqual([]);
    expect(deriveContentTypings(undefined)).toEqual([]);
  });

  it('maps a real typings list through unchanged (Slice 4b forward-compat)', () => {
    expect(
      deriveContentTypings([{ filename: 'a.pdf', docType: 'report' }, { filename: 'b.docx', docType: 'junk' }]),
    ).toEqual([
      { filename: 'a.pdf', docType: 'report' },
      { filename: 'b.docx', docType: 'junk' },
    ]);
  });
});

describe('toPolicyClassification — parse-fed ref injection (the document-only-ref fix)', () => {
  it('injects the parsed ref/VRM into the ref signals when the classifier extracted none', () => {
    const pc = toPolicyClassification(
      classification({ bodyCaseref: '', bodyVrm: '', bodyJobref: '' }),
      { parserRef: 'QDOS26050', parserVrm: 'AB12CDE' },
    );
    expect(pc.bodyCaseref).toBe('QDOS26050');
    expect(pc.bodyJobref).toBe('QDOS26050');
    expect(pc.bodyVrm).toBe('AB12CDE');
  });

  it('classifier-extracted refs still win over the parsed values', () => {
    const pc = toPolicyClassification(
      classification({ bodyCaseref: 'PCH26002', bodyVrm: 'XY99ZZZ' }),
      { parserRef: 'QDOS26050', parserVrm: 'AB12CDE' },
    );
    expect(pc.bodyCaseref).toBe('PCH26002');
    expect(pc.bodyVrm).toBe('XY99ZZZ');
  });

  it('injects nothing when no parsed data is supplied (Slice 4a / gate-off) — byte-identical', () => {
    const pc = toPolicyClassification(classification({ bodyCaseref: '', bodyVrm: '', bodyJobref: '' }));
    expect(pc.bodyCaseref).toBe('');
    expect(pc.bodyVrm).toBe('');
    expect(pc.bodyJobref).toBe('');
  });
});

/* ----------  Functional proof: a document-only ref must reach decideTriage's ref-gate  ---------- */
describe('parse-fed document-only ref reaches decideTriage (the whole point of the feature)', () => {
  const gatesAllOn = { refGate: true, cancellation: true, imagesRouting: true, caseUpdate: true, autoAttach: true };
  function policyContext(
    matches: TriagePolicyContext['openCaseMatches'],
  ): TriagePolicyContext {
    return {
      openCaseMatches: matches,
      duplicateInternetMessageId: false,
      conversationSiblingCaseIds: [],
      providerMatchState: 'matched',
      hasAttachments: true,
      attachmentKinds: ['report'],
      imagesOnly: false,
    };
  }

  it('a document-only Case-ref (no classifier body ref) now reaches suggest_attach/attach_case', () => {
    // Without the injection this classification carries NO ref → hasRefSignal is false → the
    // ref-gate rung is skipped → default action, and the found open case is unreachable.
    const withInjection = toPolicyClassification(
      classification({ bodyCaseref: '', bodyVrm: '', bodyJobref: '' }),
      { parserRef: 'QDOS26050' },
    );
    const decision = decideTriage(
      withInjection,
      policyContext([{ caseId: 'case-1', casePo: 'QDOS26050', matchedOn: 'case_po', status: 'needs_review' }]),
      gatesAllOn,
    );
    expect(['suggest_attach', 'attach_case']).toContain(decision.action);

    // Control: WITHOUT the injection the same open match is unreachable (default action).
    const noInjection = toPolicyClassification(
      classification({ bodyCaseref: '', bodyVrm: '', bodyJobref: '' }),
    );
    const control = decideTriage(
      noInjection,
      policyContext([{ caseId: 'case-1', casePo: 'QDOS26050', matchedOn: 'case_po', status: 'needs_review' }]),
      gatesAllOn,
    );
    expect(control.action).toBe('proceed_default');
  });

  it('ADR-0010: a document-only VRM-only match NEVER auto-attaches (suggest-only at most)', () => {
    const pc = toPolicyClassification(
      classification({ bodyCaseref: '', bodyVrm: '', bodyJobref: '' }),
      { parserVrm: 'AB12CDE' },
    );
    const decision = decideTriage(
      pc,
      policyContext([{ caseId: 'case-1', casePo: 'QDOS26050', matchedOn: 'vrm', status: 'needs_review' }]),
      gatesAllOn,
    );
    expect(decision.action).not.toBe('attach_case');
  });
});

/* ----------  Moved from the now-deleted triagePolicy.test.ts (email-engine-rebuild) —
 * these two functions (buildTriageContextRequest, deriveAttachmentSignals) are pure
 * helpers that used to live in triagePolicy.ts; that file's registered Durable activity
 * had no remaining caller, but the helpers themselves are still live (buildTriageContextRequest
 * is retained as this suite's own frozen gate-off-parity reference; deriveAttachmentSignals
 * is triageUnified's live Stage-B attachment-signal derivation). ---------- */

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
    expect(out.attachmentKinds).toEqual(['image']);
    expect(out.imagesOnly).toBe(false);
  });

  /* TKT-307 regression, ported here by hand. The fix landed on triagePolicy.ts, which
   * this rebuild deleted after moving _SIGNATURE_IMAGE_RE into triageUnified.ts — so
   * resolving that delete without re-applying the fix would silently restore the capped
   * \d{1,4} on the only live copy, with the Python twin left fixed and out of lockstep. */
  it('TKT-307 regression: a six-digit Outlook cid signature logo ONLY (image078315.png) -> imagesOnly false', () => {
    const out = deriveAttachmentSignals(
      envelope({
        attachments: [{ filename: 'image078315.png', contentType: 'image/png', blobPath: 'a', size: 10 }],
      }),
    );
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
});
