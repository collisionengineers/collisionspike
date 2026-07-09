import { describe, it, expect } from 'vitest';
import {
  resolveCase,
  type ResolveCaseInput,
  type OpenProviderCase,
  type DedupResolution,
} from './dedup';
import type { CaseStatus } from '../contracts/case-status';

/* ----------  Fixtures  ---------- */

const PROVIDER_A = 'wp-A';
const PROVIDER_B = 'wp-B';

function input(over: Partial<ResolveCaseInput> = {}): ResolveCaseInput {
  return {
    messageId: 'msg-001',
    payloadHash: 'hash-001',
    candidateVrm: 'AB12CDE',
    candidateRef: '',
    workProviderId: PROVIDER_A,
    openProviderCases: [],
    seenMessageIds: [],
    seenPayloadHashes: [],
    ...over,
  };
}

function openCase(over: Partial<OpenProviderCase> = {}): OpenProviderCase {
  return {
    caseId: 'case-100',
    caseRef: 'REF-100',
    status: 'needs_review' as CaseStatus,
    workProviderId: PROVIDER_A,
    ...over,
  };
}

/* ----------  The 5-rung decision table  ---------- */

describe('resolveCase — ADR-0010 five-rung ladder', () => {
  it('rung 1: exact Message-ID repeat -> drop', () => {
    const out = resolveCase(
      input({ seenMessageIds: ['msg-001'], openProviderCases: [openCase()] }),
    );
    expect(out.resolution).toBe<DedupResolution>('drop');
    expect(out.setDuplicateRisk).toBe(false);
    expect(out.auditAction).toBe('duplicate_dropped');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('rung 1: exact payloadHash repeat -> drop (even with a different Message-ID)', () => {
    const out = resolveCase(
      input({ messageId: 'msg-new', seenPayloadHashes: ['hash-001'] }),
    );
    expect(out.resolution).toBe('drop');
    expect(out.auditAction).toBe('duplicate_dropped');
  });

  it('rung 2: reference matches an open same-provider case -> attach', () => {
    const out = resolveCase(
      input({
        candidateRef: 'REF-100',
        openProviderCases: [openCase({ caseId: 'case-100', caseRef: 'REF-100' })],
      }),
    );
    expect(out.resolution).toBe('attach');
    expect(out.targetCaseId).toBe('case-100');
    expect(out.setDuplicateRisk).toBe(false);
    expect(out.caseLinkState).toBe('none');
    expect(out.statusEffect).toBe('keep_target');
    expect(out.auditAction).toBe('case_attached');
  });

  it('rung 2: reference match is case- and whitespace-insensitive', () => {
    const out = resolveCase(
      input({
        candidateRef: '  ref-100 ',
        openProviderCases: [openCase({ caseRef: 'REF-100' })],
      }),
    );
    expect(out.resolution).toBe('attach');
  });

  it('rung 3: reference differs from open case(s) for that VRM -> new_due_to_reference + duplicate_risk', () => {
    const out = resolveCase(
      input({
        candidateRef: 'REF-999',
        openProviderCases: [openCase({ caseRef: 'REF-100' })],
      }),
    );
    expect(out.resolution).toBe('new_due_to_reference');
    expect(out.setDuplicateRisk).toBe(true);
    expect(out.caseLinkState).toBe('none');
    expect(out.statusEffect).toBe('new_email');
    expect(out.auditAction).toBe('duplicate_flagged');
    // Never an auto-attach: the differing reference mints a NEW case.
    expect(out.targetCaseId).toBeUndefined();
  });

  it('rung 4: no reference + VRM matches an open case -> propose_attach (staff confirm)', () => {
    const out = resolveCase(
      input({
        candidateRef: '',
        openProviderCases: [openCase({ caseId: 'case-100' })],
      }),
    );
    expect(out.resolution).toBe('propose_attach');
    expect(out.targetCaseId).toBe('case-100');
    expect(out.setDuplicateRisk).toBe(true);
    expect(out.caseLinkState).toBe('pending'); // human-confirmable, never silent
    expect(out.statusEffect).toBe('duplicate_risk');
    expect(out.auditAction).toBe('duplicate_flagged');
  });

  it('rung 5: no match -> create', () => {
    const out = resolveCase(input({ candidateRef: '', openProviderCases: [] }));
    expect(out.resolution).toBe('create');
    expect(out.setDuplicateRisk).toBe(false);
    expect(out.caseLinkState).toBe('none');
    expect(out.statusEffect).toBe('new_email');
    expect(out.auditAction).toBe('case_created');
  });

  it('rung 5: reference present but NO open cases at all -> create (clean)', () => {
    const out = resolveCase(input({ candidateRef: 'REF-777', openProviderCases: [] }));
    expect(out.resolution).toBe('create');
    expect(out.setDuplicateRisk).toBe(false);
  });
});

/* ----------  The inviolable rules  ---------- */

describe('resolveCase — ADR-0010 inviolable rules', () => {
  it('NEVER matches across different Work Providers (cross-provider can never attach)', () => {
    // An open case with the SAME ref + VRM but a DIFFERENT provider must be ignored.
    const out = resolveCase(
      input({
        workProviderId: PROVIDER_A,
        candidateRef: 'REF-100',
        openProviderCases: [
          openCase({ caseId: 'other-prov', caseRef: 'REF-100', workProviderId: PROVIDER_B }),
        ],
      }),
    );
    // Reference would have matched within a provider, but cross-provider is filtered out,
    // so with a present reference and no eligible cases we CREATE — never attach.
    expect(out.resolution).toBe('create');
    expect(out.targetCaseId).toBeUndefined();
  });

  it('NEVER proposes a cross-provider attach on a bare VRM match', () => {
    const out = resolveCase(
      input({
        workProviderId: PROVIDER_A,
        candidateRef: '',
        openProviderCases: [
          openCase({ caseId: 'other-prov', workProviderId: PROVIDER_B }),
        ],
      }),
    );
    expect(out.resolution).toBe('create');
    expect(out.setDuplicateRisk).toBe(false);
  });

  it('NEVER auto-merges on VRM+time: a bare VRM match only ever PROPOSES (pending, never attach)', () => {
    // Same provider, same VRM, NO reference — the classic "VRM twin" case.
    // The only permitted outcome is propose_attach with caseLinkState=pending.
    const out = resolveCase(
      input({
        candidateRef: '',
        openProviderCases: [openCase({ caseId: 'twin', caseRef: '' })],
      }),
    );
    expect(out.resolution).not.toBe('attach'); // never a silent merge
    expect(out.resolution).toBe('propose_attach');
    expect(out.caseLinkState).toBe('pending');
    expect(out.setDuplicateRisk).toBe(true);
  });

  it('multiple open VRM twins (no ref) -> still only a proposal, never an auto-pick merge', () => {
    const out = resolveCase(
      input({
        candidateRef: '',
        openProviderCases: [
          openCase({ caseId: 'twin-1', caseRef: '' }),
          openCase({ caseId: 'twin-2', caseRef: '' }),
        ],
      }),
    );
    expect(out.resolution).toBe('propose_attach');
    expect(out.caseLinkState).toBe('pending');
    // Proposes the first candidate for staff review; the decision stays human.
    expect(out.targetCaseId).toBe('twin-1');
  });

  it('terminal open cases are not eligible to attach to (eva_submitted/box_synced/error)', () => {
    const terminals: CaseStatus[] = ['eva_submitted', 'box_synced', 'error'];
    for (const status of terminals) {
      const out = resolveCase(
        input({
          candidateRef: 'REF-100',
          openProviderCases: [openCase({ caseRef: 'REF-100', status })],
        }),
      );
      // The only same-ref case is terminal -> filtered out -> CREATE, never attach.
      expect(out.resolution).toBe('create');
    }
  });

  it('drop (rung 1) wins even when a reference would otherwise attach', () => {
    const out = resolveCase(
      input({
        candidateRef: 'REF-100',
        seenPayloadHashes: ['hash-001'],
        openProviderCases: [openCase({ caseRef: 'REF-100' })],
      }),
    );
    expect(out.resolution).toBe('drop');
  });
});

/* ----------  Determinism  ---------- */

describe('resolveCase — determinism', () => {
  it('same input -> same output', () => {
    const i = input({
      candidateRef: 'REF-100',
      openProviderCases: [openCase({ caseRef: 'REF-100' })],
    });
    expect(resolveCase(i)).toEqual(resolveCase(i));
  });
});

/* ----------  TKT-092 regression — the PCH FW:-resend duplicate vectors  ----------
   Live trace (2026-07-03): the same PCH instruction was re-sent as "FW: …" with a fresh
   Internet-Message-Id. PCH26018 + PCH26020 stored the IDENTICAL payload_hash yet both
   minted, and the re-send's parser-extracted ref (00035591/JEFFP) matched the open
   PCH26009's case_ref yet did not attach. The domain ladder decides both correctly —
   these tests pin that so the live activity wiring (internetMessageId as the rung-1 key,
   parserRef folded into candidateRef) can never regress silently. */

describe('resolveCase — TKT-092 FW:-resend vectors (PCH duplicate shape)', () => {
  it('a re-send with a NEW message id but the SAME payload hash -> drop (rung 1)', () => {
    const out = resolveCase(
      input({
        messageId: 'fw-resend-new-id',
        payloadHash: 'bd1ffccdab05ef13',
        candidateVrm: 'PK20FWT',
        candidateRef: '00035591/JEFFP',
        seenMessageIds: ['<original@GBRP123>'],
        seenPayloadHashes: ['bd1ffccdab05ef13'],
        openProviderCases: [openCase({ caseId: 'pch26009', caseRef: '00035591/JEFFP' })],
      }),
    );
    expect(out.resolution).toBe('drop');
    expect(out.auditAction).toBe('duplicate_dropped');
  });

  it('a re-send with a new id AND a new hash but the SAME parser ref -> attach to the open case (rung 2)', () => {
    const out = resolveCase(
      input({
        messageId: 'fw-resend-new-id',
        payloadHash: 'different-hash',
        candidateVrm: 'PK20FWT',
        candidateRef: '00035591/JEFFP', // parserRef folded in by the caseResolve activity
        openProviderCases: [openCase({ caseId: 'pch26009', caseRef: '00035591/JEFFP' })],
      }),
    );
    expect(out.resolution).toBe('attach');
    expect(out.targetCaseId).toBe('pch26009');
  });

  it('TKT-101 shape: a DIFFERENT ref on the same VRM -> new case + duplicate risk, never merged (rung 3)', () => {
    const out = resolveCase(
      input({
        messageId: 'qdos-46671',
        payloadHash: 'hash-46671',
        candidateVrm: 'AND2', // the shared junk VRM both QDOS emails sniffed
        candidateRef: '46671/1',
        openProviderCases: [openCase({ caseId: 'qdos26056', caseRef: '46533/1' })],
      }),
    );
    expect(out.resolution).toBe('new_due_to_reference');
    expect(out.setDuplicateRisk).toBe(true);
    expect(out.targetCaseId).toBeUndefined();
  });
});

/* ----------  TKT-052 — merge provider preference (against the ADR-0010 ladder rules)  ---------- */

import { decideMergeProvider } from './dedup';

describe('decideMergeProvider — TKT-052 merged case must not lose the provider', () => {
  it('image-only survivor + provider-carrying source -> survivor INHERITS the provider (the bug)', () => {
    expect(decideMergeProvider('wp-pch', null)).toEqual({
      providerId: 'wp-pch',
      filledFrom: 'source',
      crossProvider: false,
    });
  });

  it('survivor already knows the provider -> kept', () => {
    expect(decideMergeProvider(null, 'wp-pch')).toEqual({
      providerId: 'wp-pch',
      filledFrom: 'target',
      crossProvider: false,
    });
    expect(decideMergeProvider('wp-pch', 'wp-pch')).toEqual({
      providerId: 'wp-pch',
      filledFrom: 'target',
      crossProvider: false,
    });
  });

  it('BOTH sides carry DIFFERENT providers -> crossProvider (ADR-0010 rule 2: refuse, never prefer)', () => {
    const d = decideMergeProvider('wp-pch', 'wp-qdos');
    expect(d.crossProvider).toBe(true);
  });

  it('neither side knows -> null (nothing to prefer)', () => {
    expect(decideMergeProvider(null, undefined)).toEqual({
      providerId: null,
      filledFrom: null,
      crossProvider: false,
    });
    expect(decideMergeProvider('  ', '')).toEqual({
      providerId: null,
      filledFrom: null,
      crossProvider: false,
    });
  });
});
