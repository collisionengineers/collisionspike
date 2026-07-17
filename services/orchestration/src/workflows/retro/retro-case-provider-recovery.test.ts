import { describe, expect, it, vi } from 'vitest';

type OrchestrationHandler = (ctx: unknown) => Generator<unknown, unknown, unknown>;
interface TaskCall {
  kind: 'activity' | 'sub-orchestration' | 'task-all';
  name: string;
  input?: unknown;
  tasks?: TaskCall[];
}

const orchestrations = vi.hoisted(() => new Map<string, OrchestrationHandler>());
vi.mock('@azure/functions', () => ({ app: { http: vi.fn() } }));
vi.mock('durable-functions', () => ({
  app: {
    orchestration: (name: string, handler: OrchestrationHandler) => orchestrations.set(name, handler),
    activity: vi.fn(),
  },
  input: { durableClient: vi.fn(() => ({})) },
  getClient: vi.fn(),
  RetryOptions: class {
    backoffCoefficient = 1;
    maxRetryIntervalInMilliseconds = 0;
    constructor(
      public readonly firstRetryIntervalInMilliseconds: number,
      public readonly maxNumberOfAttempts: number,
    ) {}
  },
}));

vi.mock('../../adapters/data-api.js', () => ({ dataApi: {} }));
vi.mock('../../adapters/graph.js', () => ({
  findMessageByInternetMessageId: vi.fn(),
  kqlPhrase: vi.fn((value: string) => value),
  searchMessages: vi.fn(),
}));
vi.mock('../../platform/subscriptions.js', () => ({ intakeMailboxes: vi.fn(() => []) }));
vi.mock('../../adapters/functions-client.js', () => ({ box: {}, callExplodeEml: vi.fn() }));
vi.mock('../../platform/blob.js', () => ({ uploadEvidenceBytes: vi.fn() }));

import { mapRetroParse } from './retro-case.js';

function makeCtx(input: unknown): {
  ctx: unknown;
  callActivityWithRetry: ReturnType<typeof vi.fn>;
  callSubOrchestratorWithRetry: ReturnType<typeof vi.fn>;
} {
  const callActivityWithRetry = vi.fn(
    (name: string, _retry: unknown, activityInput: unknown): TaskCall => ({
      kind: 'activity',
      name,
      input: activityInput,
    }),
  );
  const callSubOrchestratorWithRetry = vi.fn(
    (name: string, _retry: unknown, subInput: unknown): TaskCall => ({
      kind: 'sub-orchestration',
      name,
      input: subInput,
    }),
  );
  const ctx = {
    df: {
      getInput: () => input,
      callActivityWithRetry,
      callSubOrchestratorWithRetry,
      // TKT-219 — the parallel locate fan-out awaits ONE Task.all over both rungs.
      Task: { all: (tasks: TaskCall[]): TaskCall => ({ kind: 'task-all', name: 'Task.all', tasks }) },
      isReplaying: false,
    },
    log: vi.fn(),
  };
  return { ctx, callActivityWithRetry, callSubOrchestratorWithRetry };
}

function nextTask(
  generator: Generator<unknown, unknown, unknown>,
  value?: unknown,
): TaskCall {
  const step = generator.next(value);
  expect(step.done).toBe(false);
  return step.value as TaskCall;
}

const OUTLOOK_HIT = {
  found: true,
  messageId: 'graph-original',
  resource: 'users/info/messages/graph-original',
  mailbox: 'intake@example.test',
  matchedKey: 'external_ref',
};

const OUTLOOK_ORIGINAL = {
  messageId: 'graph-original',
  internetMessageId: '<original@example.test>',
  sourceMailbox: 'intake@example.test',
  subject: 'Instruction REF-123',
  body: 'Please handle reference REF-123.',
  attachments: [],
  receivedAt: '2026-07-13T09:00:00.000Z',
};

describe('retroCaseOrchestrator — parallel fan-out + Outlook provider recovery', () => {
  it('fans out both locates, reconstructs Outlook-only when Box is gated off, and runs the full record-keeping chain', () => {
    const { ctx, callSubOrchestratorWithRetry } = makeCtx({
      trigger: {
        internetMessageId: '<trigger@example.test>',
        receivedAt: '2026-07-14T10:00:00.000Z',
      },
      category: 'case_update',
      keys: { externalRef: 'REF-123' },
    });
    const generator = orchestrations.get('retroCaseOrchestrator')!(ctx as never);

    expect(nextTask(generator)).toMatchObject({ name: 'retroResolveExisting' });

    // TKT-219 — the two locate rungs are dispatched together in ONE Task.all.
    const fanOut = nextTask(generator, { outcome: 'none' });
    expect(fanOut.kind).toBe('task-all');
    expect(fanOut.tasks?.map((t) => t.name)).toEqual(['retroBoxLocate', 'retroOutlookLocate']);

    // Box gate off / Outlook found → the outlook_only arm.
    expect(nextTask(generator, [{ skipped: 'gate_off' }, OUTLOOK_HIT])).toMatchObject({
      name: 'fetchMessage',
    });
    expect(nextTask(generator, OUTLOOK_ORIGINAL)).toMatchObject({ name: 'parse' });

    const create = nextTask(generator, {
      vrm: { value: 'KA08XTR' },
      reference: { value: 'REF-123' },
      extraction: {
        work_provider: { value: 'QDOS' },
        claimant_name: { value: 'Jane Driver' },
      },
    });
    expect(create).toMatchObject({
      name: 'retroCreatePersist',
      input: expect.objectContaining({ reconstructionSource: 'outlook' }),
    });

    // TKT-219 G2 — the evidence chain carries the case VRM + the RESOLVED provider so the
    // per-provider AI opt-out holds on retro runs; extractImages joins the chain (G1).
    const classify = nextTask(generator, {
      outcome: 'created',
      caseId: 'case-retro',
      casePo: 'QDOS26088',
      resolvedProviderId: 'wp-qdos',
      providerRecovery: 'identity_ready',
    });
    expect(classify).toMatchObject({
      name: 'classifyPersist',
      input: expect.objectContaining({
        caseId: 'case-retro',
        caseVrm: 'KA08XTR',
        workProviderId: 'wp-qdos',
      }),
    });
    expect(nextTask(generator, undefined)).toMatchObject({
      name: 'extractImages',
      input: expect.objectContaining({
        caseId: 'case-retro',
        caseVrm: 'KA08XTR',
        workProviderId: 'wp-qdos',
      }),
    });

    expect(nextTask(generator, undefined)).toEqual({
      kind: 'sub-orchestration',
      name: 'boxFolderCreateOrchestrator',
      input: { caseId: 'case-retro' },
    });
    // TKT-220 (G3) — the freshly ensured WRITABLE folder gets the case's evidence mirrored.
    expect(nextTask(generator, {
      folderId: 'pinned-test-folder',
      providerRecoveryCompleted: true,
    })).toMatchObject({ name: 'boxArchiveEvidence', input: { caseId: 'case-retro' } });
    expect(nextTask(generator, undefined)).toMatchObject({
      kind: 'activity',
      name: 'statusEvaluate',
      input: { caseId: 'case-retro' },
    });

    // TKT-222 — every successful reconstruction backfills related mailbox emails.
    expect(nextTask(generator, { value: 'not_ready' })).toMatchObject({
      name: 'retroLinkRelated',
      input: expect.objectContaining({
        caseId: 'case-retro',
        excludeInternetMessageIds: ['<trigger@example.test>', '<original@example.test>'],
      }),
    });
    // TKT-225 — the activity returned `ingestRows` (the checkpointed gate-ON decision):
    // the related-INGEST child is scheduled with the case identity + evidence-chain facts.
    const ingestRow = {
      internetMessageId: '<related@example.test>',
      messageId: 'graph-related',
      resource: 'users/intake@example.test/messages/graph-related',
      mailbox: 'intake@example.test',
      receivedAt: '2026-07-10T10:00:00.000Z',
    };
    expect(nextTask(generator, { linked: 2, scanned: 5, ingestRows: [ingestRow] })).toMatchObject({
      kind: 'sub-orchestration',
      name: 'retroRelatedIngestOrchestrator',
      input: expect.objectContaining({
        caseId: 'case-retro',
        rows: [ingestRow],
        caseVrm: 'KA08XTR',
        workProviderId: 'wp-qdos',
      }),
    });
    // D8 — this arm archived into the freshly ensured WRITABLE folder above, so the
    // ingested evidence is re-mirrored once (idempotent).
    expect(nextTask(generator, { processed: 1, failed: 0, fieldsApplied: 1 })).toMatchObject({
      name: 'boxArchiveEvidence',
      input: { caseId: 'case-retro' },
    });
    expect(generator.next(undefined)).toEqual({
      done: true,
      value: {
        outcome: 'created',
        caseId: 'case-retro',
        casePo: 'QDOS26088',
        source: 'outlook',
        providerRecovery: 'completed',
      },
    });
    expect(callSubOrchestratorWithRetry).toHaveBeenCalledTimes(2);
  });

  it('COMBINED arm: a folder with nothing parseable + a corroborated Outlook original creates with Box identity', () => {
    const { ctx, callSubOrchestratorWithRetry } = makeCtx({
      trigger: {
        internetMessageId: '<trigger@example.test>',
        receivedAt: '2026-07-14T10:00:00.000Z',
      },
      category: 'case_update',
      keys: { externalRef: 'REF-123' },
    });
    const generator = orchestrations.get('retroCaseOrchestrator')!(ctx as never);

    nextTask(generator); // retroResolveExisting
    nextTask(generator, { outcome: 'none' }); // Task.all fan-out
    expect(nextTask(generator, [
      {
        found: true,
        folder: { id: 'F1', name: 'A.PCH261269' },
        discoveredPo: 'A.PCH261269',
        principalCode: 'PCH',
        marker: 'A.',
        basis: 'ref_tier',
        candidateCount: 1,
      },
      OUTLOOK_HIT,
    ])).toMatchObject({ name: 'retroBoxFetchInstruction' });

    // The archive folder yields NOTHING parseable — pre-TKT-219 this became a data-empty
    // Held anchor; now the in-hand Outlook original fills the material.
    expect(nextTask(generator, {
      envelope: {
        messageId: 'retro-box-folder-F1',
        internetMessageId: 'retro:box:folder:F1',
        subject: 'Retro anchor: A.PCH261269',
        body: '',
        candidateVrm: '',
        attachments: [],
      },
      instructionSource: 'minimal',
      otherFiles: [{ boxFileId: 'f9', filename: 'photo.jpg' }],
    })).toMatchObject({ name: 'fetchMessage' });
    expect(nextTask(generator, OUTLOOK_ORIGINAL)).toMatchObject({ name: 'parse' });

    const create = nextTask(generator, { reference: { value: 'REF-123' }, extraction: {} });
    expect(create).toMatchObject({
      name: 'retroCreatePersist',
      input: expect.objectContaining({
        reconstructionSource: 'outlook',
        casePo: 'A.PCH261269',
        boxFolder: expect.objectContaining({ id: 'F1' }),
        caseType: 'audit', // the archive marker (A.) stays ground truth
        otherFiles: [{ boxFileId: 'f9', filename: 'photo.jpg' }],
        caseTypeSignals: expect.arrayContaining(['combined_reconstruction', 'archive_marker:A.']),
      }),
    });

    nextTask(generator, {
      outcome: 'created',
      caseId: 'case-combined',
      casePo: 'A.PCH261269',
      resolvedProviderId: 'wp-pch',
      providerRecovery: 'not_needed',
    }); // classifyPersist
    nextTask(generator, undefined); // extractImages
    // NO boxFolderCreate — the ARCHIVE folder was stamped in the create.
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'statusEvaluate' });
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'retroLinkRelated' });

    expect(generator.next({ linked: 0, scanned: 0 })).toEqual({
      done: true,
      value: {
        outcome: 'created',
        caseId: 'case-combined',
        casePo: 'A.PCH261269',
        source: 'outlook',
        combined: true,
        providerRecovery: 'not_needed',
      },
    });
    expect(callSubOrchestratorWithRetry).not.toHaveBeenCalled();
  });

  it('a Box-arm refused_category falls back to the IN-HAND Outlook result without re-searching', () => {
    const { ctx, callActivityWithRetry } = makeCtx({
      trigger: {
        internetMessageId: '<trigger@example.test>',
        receivedAt: '2026-07-14T10:00:00.000Z',
      },
      category: 'query',
      keys: { externalRef: 'REF-123' },
    });
    const generator = orchestrations.get('retroCaseOrchestrator')!(ctx as never);

    nextTask(generator); // retroResolveExisting
    nextTask(generator, { outcome: 'none' }); // Task.all fan-out
    nextTask(generator, [
      {
        found: true,
        folder: { id: 'F1', name: 'QDOS26050' },
        discoveredPo: 'QDOS26050',
        principalCode: 'QDOS',
        marker: '',
        candidateCount: 1,
      },
      OUTLOOK_HIT,
    ]); // retroBoxFetchInstruction
    expect(nextTask(generator, {
      envelope: {
        messageId: 'retro-box-eml1',
        internetMessageId: '<archived@example.test>',
        subject: 'Original instruction REF-123',
        body: 'Reference REF-123',
        candidateVrm: '',
        attachments: [{ filename: 'orig.pdf', contentType: 'application/pdf', blobPath: 'p', size: 1 }],
      },
      instructionSource: 'box_eml',
      otherFiles: [],
    })).toMatchObject({ name: 'parse' });

    // The archived "original" turns out to be ack/digest-family — the API refuses it.
    nextTask(generator, { reference: { value: 'REF-123' }, extraction: {} }); // retroCreatePersist (box)
    const fallbackFetch = nextTask(generator, { outcome: 'refused_category', category: 'other' });
    expect(fallbackFetch).toMatchObject({ name: 'fetchMessage' });

    // Exactly ONE retroOutlookLocate ran (the fan-out) — the fallback reuses its hit.
    const locateCalls = callActivityWithRetry.mock.calls.filter(([n]) => n === 'retroOutlookLocate');
    expect(locateCalls).toHaveLength(1);

    expect(nextTask(generator, OUTLOOK_ORIGINAL)).toMatchObject({ name: 'parse' });
    const create = nextTask(generator, { reference: { value: 'REF-123' }, extraction: {} });
    expect(create).toMatchObject({
      name: 'retroCreatePersist',
      input: expect.objectContaining({ reconstructionSource: 'outlook' }),
    });
    expect((create.input as { casePo?: string }).casePo).toBeUndefined();

    nextTask(generator, {
      outcome: 'created',
      caseId: 'case-fallback',
      casePo: null,
      providerRecovery: 'not_needed',
    }); // classifyPersist
    nextTask(generator, undefined); // extractImages
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'statusEvaluate' });
    expect(nextTask(generator, undefined)).toMatchObject({ name: 'retroLinkRelated' });
    expect(generator.next({ linked: 1, scanned: 3 })).toEqual({
      done: true,
      value: {
        outcome: 'created',
        caseId: 'case-fallback',
        casePo: null,
        source: 'outlook',
        providerRecovery: 'not_needed',
      },
    });
  });

  it('maps document/body claimant conflicts with a stable source reference', () => {
    expect(mapRetroParse(
      { extraction: { claimant_name: { value: 'Ms Document Person' } } },
      'Claimant: Mr Body Person',
      '<original@example.test>',
    ).parserEva).toMatchObject({
      claimant_name: 'Ms Document Person',
      source_reference: '<original@example.test>',
      claimant_conflicts: [{
        value: 'Mr Body Person',
        source: 'email_text',
        source_reference: '<original@example.test>',
      }],
    });
  });
});
