import { describe, expect, it } from 'vitest';
import { decideTriage, type TriagePolicyContext } from '@cs/domain';
import {
  buildPreClassifyContextRequest,
  buildWidenedTriageContextRequest,
  buildParseFedClassifyRequest,
  resolveOpenCaseRefMatchState,
  deriveContentTypings,
  toPolicyClassification,
} from './triageUnified.js';
import { buildClassifyRequest } from './classifyInbound.js';
import { buildTriageContextRequest } from './triagePolicy.js';
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
