/**
 * PLAN-014 Slice 4b — the orchestrator-level reorder + gate proof. Drives the
 * intakeOrchestrator generator by hand (the intake-terminal-replay.test.ts harness, extended
 * to capture each activity's INPUT, not just its name) and asserts:
 *
 *   1. parse now runs BEFORE triageUnified for doc-bearing mail (the hoist), and its result is
 *      threaded into triageUnified's `parsed` bag (D1/D4);
 *   2. GATE-OFF byte-identity at the LANE level — with parseFedGateOn:false the reply-link
 *      lane's ref/VRM come from candidate/body ONLY (the hoisted parser VRM/ref are NOT used),
 *      exactly as before Slice 4b; GATE-ON, the same lane prefers the parser VRM/ref;
 *   3. the TKT-102 collapse — the image-delivery VRM rung reads the SINGLE hoisted parserVrm;
 *      `parse` is called exactly ONCE for the whole email (no dedicated second parse), and
 *      `triedVrm` stays candidate||body (never parserVrm).
 *
 * case-identity.ts (resolveCaseRef/resolveCaseVrm) and parse-candidates.ts (orderParseCandidates)
 * are deliberately NOT mocked — the whole point is to exercise the real precedence + real
 * doc-candidate gate through the orchestrator body.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Marker = { kind: 'activity' | 'sub'; name: string };
type Orchestration = (ctx: Record<string, unknown>) => Generator<Marker, unknown, unknown>;

const orchestrations = vi.hoisted(() => new Map<string, Orchestration>());
const categoryMintsCase = vi.hoisted(() => vi.fn());
const shouldLinkReplyToCase = vi.hoisted(() => vi.fn());
const shouldAttemptPdfVrmMatch = vi.hoisted(() => vi.fn());
const decideRetro = vi.hoisted(() => vi.fn());

vi.mock('durable-functions', () => ({
  RetryOptions: class RetryOptions {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public firstRetryIntervalInMilliseconds: number,
      public maxNumberOfAttempts: number,
    ) {}
  },
  app: {
    orchestration: (name: string, handler: Orchestration) => orchestrations.set(name, handler),
  },
}));

vi.mock('../../platform/supplement-parse.js', () => ({
  supplementClaimantNameFromBody: () => ({ status: 'absent', value: '', candidates: [] }),
  supplementAccidentCircumstancesFromBody: () => '',
  resolveClaimantInputs: () => ({ value: '', conflicts: [], fromEmailBody: false }),
}));
vi.mock('../evidence/imagesReceivedVrmMatch.js', () => ({ shouldAttemptPdfVrmMatch }));
vi.mock('./reply-link-eligibility.js', () => ({ shouldLinkReplyToCase }));
vi.mock('./triage-classify.js', () => ({ shouldAttemptTriageAssist: () => false }));
vi.mock('@cs/domain', () => ({
  categoryMintsCase,
  decideCaseType: () => ({ caseType: 'standard', dual: false, signals: [] }),
  decideRetro,
}));
vi.mock('../../platform/vehicle-data-intake.js', () => ({
  vehicleDataIntakeIdempotencyKey: () => 'unused',
}));

import './intakeOrchestrator.js';

function driveOrchestrator(results: Record<string, unknown>) {
  const calls: Array<{ name: string; input: unknown }> = [];
  const subCalls: string[] = [];
  const ctx = {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    df: {
      getInput: () => ({ messageId: 'graph-msg' }),
      isReplaying: false,
      instanceId: 'instance-1',
      newGuid: () => 'guid-1',
      callActivityWithRetry: (name: string, _retry: unknown, input: unknown): Marker => {
        calls.push({ name, input });
        return { kind: 'activity', name };
      },
      callSubOrchestratorWithRetry: (name: string): Marker => {
        subCalls.push(name);
        return { kind: 'sub', name };
      },
    },
  };
  const generator = orchestrations.get('intakeOrchestrator')!(ctx);
  let step = generator.next();
  while (!step.done) {
    step = generator.next(results[step.value.name]);
  }
  return {
    returnValue: step.value,
    calls,
    names: calls.map((c) => c.name),
    subCalls,
    inputOf: (name: string) => calls.find((c) => c.name === name)?.input as Record<string, unknown> | undefined,
  };
}

const pdfAttachment = {
  filename: 'instruction.pdf',
  contentType: 'application/pdf',
  blobPath: 'blob/instruction.pdf',
  size: 10,
};

beforeEach(() => {
  vi.clearAllMocks();
  shouldAttemptPdfVrmMatch.mockReturnValue(false);
  decideRetro.mockReturnValue({ attempt: false, keys: {}, reasons: [] });
});

describe('Slice 4b — parse is hoisted before triage and threaded into triageUnified', () => {
  it('calls parse BEFORE triageUnified for doc-bearing mail and passes the parsed bag (D1/D4)', () => {
    categoryMintsCase.mockReturnValue(true);
    shouldLinkReplyToCase.mockReturnValue(false);

    const { names, inputOf } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<work@example.test>',
        subject: 'Instruction',
        body: '',
        candidateRef: '',
        candidateVrm: '',
        attachments: [pdfAttachment],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      parse: {
        vrm: { value: 'AB12CDE' },
        reference: { value: 'QDOS26001' },
        attachmentTypings: [
          { blobPath: 'blob/instruction.pdf', filename: 'instruction.pdf', docType: 'instruction', providerName: null, markers: [] },
        ],
      },
      triageUnified: {
        classification: {
          category: 'receiving_work',
          subtype: 'existing_provider_instruction',
          confidence: 1,
          signals: [],
          bodyCaseref: '',
          bodyJobref: '',
          bodyVrm: '',
        },
        decision: { action: 'proceed_default', finalCategory: 'receiving_work', finalSubtype: 'existing_provider_instruction' },
        parseFedGateOn: true,
      },
      caseResolve: { outcome: 'already_ingested', caseId: 'case-1' },
    });

    // Parse comes second (right after providerMatch), triage third — the reorder.
    expect(names.slice(0, 4)).toEqual(['fetchMessage', 'providerMatch', 'parse', 'triageUnified']);

    // The hoisted parse result is threaded into triageUnified verbatim (mapped to wire shape).
    expect((inputOf('triageUnified') as { parsed?: unknown }).parsed).toEqual({
      parserVrm: 'AB12CDE',
      parserRef: 'QDOS26001',
      attachmentTypings: [{ filename: 'instruction.pdf', docType: 'instruction' }],
    });
  });

  it('no-document mail skips the hoisted parse entirely', () => {
    categoryMintsCase.mockReturnValue(true);
    shouldLinkReplyToCase.mockReturnValue(false);

    const { names } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<nodoc@example.test>',
        subject: 'Instruction',
        body: '',
        candidateRef: '',
        candidateVrm: '',
        attachments: [{ filename: 'IMG_1.jpg', contentType: 'image/jpeg', blobPath: 'b', size: 1 }],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      triageUnified: {
        classification: { category: 'receiving_work', subtype: 'instruction', confidence: 1, signals: [], bodyCaseref: '', bodyJobref: '', bodyVrm: '' },
        decision: { action: 'proceed_default', finalCategory: 'receiving_work', finalSubtype: 'instruction' },
        parseFedGateOn: false,
      },
      caseResolve: { outcome: 'already_ingested', caseId: 'case-2' },
    });

    expect(names).not.toContain('parse');
    expect(names.slice(0, 3)).toEqual(['fetchMessage', 'providerMatch', 'triageUnified']);
  });
});

describe('Slice 4b — reply-link lane gate: parser VRM/ref used ONLY when parse-fed', () => {
  function driveReplyLane(parseFedGateOn: boolean) {
    categoryMintsCase.mockReturnValue(false);
    shouldLinkReplyToCase.mockReturnValue(true);
    return driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<reply@example.test>',
        subject: 'Re: your case',
        body: '',
        candidateRef: 'CANDREF',
        candidateVrm: 'CANDVRM',
        attachments: [pdfAttachment],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'matched', principalCode: 'QDOS' },
      parse: { vrm: { value: 'PARSERVRM' }, reference: { value: 'PARSERREF' } },
      triageUnified: {
        classification: {
          category: 'case_update',
          subtype: 'update_general',
          confidence: 1,
          signals: [],
          bodyCaseref: '',
          bodyJobref: '',
          bodyVrm: '',
          isReply: true,
        },
        decision: { action: 'proceed_default', finalCategory: 'case_update', finalSubtype: 'update_general' },
        parseFedGateOn,
      },
      linkReply: { outcome: 'no_match' },
    });
  }

  it('GATE-OFF (parseFedGateOn:false): linkReply gets candidate ref/VRM, NOT the parser values', () => {
    const { inputOf } = driveReplyLane(false);
    const link = inputOf('linkReply')!;
    expect(link.ref).toBe('CANDREF');
    expect(link.vrm).toBe('CANDVRM');
  });

  it('GATE-ON (parseFedGateOn:true): linkReply now prefers the PDF-extracted ref/VRM', () => {
    const { inputOf } = driveReplyLane(true);
    const link = inputOf('linkReply')!;
    expect(link.ref).toBe('PARSERREF');
    expect(link.vrm).toBe('PARSERVRM');
  });
});

describe('Slice 4b — TKT-102 collapse: one parse, hoisted VRM feeds the image-delivery rung', () => {
  it('parses ONCE and passes the hoisted parserVrm to imagesReceivedVrmMatch (triedVrm stays candidate||body)', () => {
    categoryMintsCase.mockReturnValue(false);
    shouldLinkReplyToCase.mockReturnValue(false);
    shouldAttemptPdfVrmMatch.mockReturnValue(true);

    const { names, inputOf } = driveOrchestrator({
      fetchMessage: {
        messageId: 'graph-msg',
        internetMessageId: '<lead@example.test>',
        subject: 'New completed lead',
        body: '',
        candidateRef: '',
        candidateVrm: 'TRIEDVRM',
        attachments: [pdfAttachment],
      },
      providerMatch: { workProviderId: 'provider-1', matchState: 'unmatched', principalCode: 'CNX' },
      parse: { vrm: { value: 'PDFVRM' } },
      triageUnified: {
        classification: { category: 'query', subtype: 'images_received', confidence: 1, signals: [], bodyCaseref: '', bodyJobref: '', bodyVrm: '' },
        decision: { action: 'proceed_default', finalCategory: 'query', finalSubtype: 'images_received' },
        parseFedGateOn: false,
      },
      imagesReceivedVrmMatch: { outcome: 'suggested', caseId: 'case-x' },
    });

    // EXACTLY ONE parse for the whole email — the dedicated inline TKT-102 parse is gone.
    expect(names.filter((n) => n === 'parse')).toEqual(['parse']);
    // Parse ran before triage; the rung ran after triage.
    expect(names.indexOf('parse')).toBeLessThan(names.indexOf('triageUnified'));
    expect(names.indexOf('triageUnified')).toBeLessThan(names.indexOf('imagesReceivedVrmMatch'));

    const rung = inputOf('imagesReceivedVrmMatch')!;
    expect(rung.vrm).toBe('PDFVRM'); // the single hoisted parserVrm (ungated — behaviour-preserving)
    expect(rung.triedVrm).toBe('TRIEDVRM'); // candidate||body, NEVER parserVrm
  });
});
