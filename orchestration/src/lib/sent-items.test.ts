/**
 * orchestration/src/lib/sent-items.test.ts — TKT-095 detector (a) pure helpers.
 *
 * The suggestion-grade-conservative doctrine under test: mark done ONLY when a
 * provider-matched recipient AND exactly one `eva_submitted` case of that provider
 * resolve; everything else is a traced no-op.
 */
import { describe, expect, it } from 'vitest';
import type { ProviderMatchRecord } from '@cs/domain';
import {
  buildSentEmailDetail,
  decideSentItemsDone,
  extractRecipientAddresses,
  extractSubjectKeys,
  matchProviderRecipients,
  type CaseLookupRow,
} from './sent-items.js';

const providers: ProviderMatchRecord[] = [
  {
    workProviderId: 'wp-pch',
    principalCode: 'PCH',
    knownEmailDomains: ['pchclaims.example'],
    active: true,
  },
  {
    workProviderId: 'wp-qdos',
    principalCode: 'QDOS',
    knownEmailDomains: ['qdos.example'],
    knownEmailAddresses: ['qdosclaims@gmail.com'],
    active: true,
  },
  {
    workProviderId: 'wp-dead',
    principalCode: 'DEAD',
    knownEmailDomains: ['dead.example'],
    active: false,
  },
];

const caseRow = (over: Partial<CaseLookupRow>): CaseLookupRow => ({
  caseId: 'case-1',
  casePo: 'PCH26100',
  status: 'eva_submitted',
  workProviderId: 'wp-pch',
  vrm: 'AB12CDE',
  ...over,
});

describe('extractRecipientAddresses', () => {
  it('collects to + cc, lower-cased, de-duplicated', () => {
    expect(
      extractRecipientAddresses({
        toRecipients: [
          { emailAddress: { address: 'Claims@PCHclaims.example' } },
          { emailAddress: { address: 'claims@pchclaims.example' } },
        ],
        ccRecipients: [{ emailAddress: { address: 'ops@qdos.example' } }, {}],
      }),
    ).toEqual(['claims@pchclaims.example', 'ops@qdos.example']);
  });

  it('is empty-safe', () => {
    expect(extractRecipientAddresses({})).toEqual([]);
  });
});

describe('matchProviderRecipients', () => {
  it('matches by exact domain (the intake rule) and keeps the recipient', () => {
    expect(matchProviderRecipients(['claims@pchclaims.example'], providers)).toEqual([
      { workProviderId: 'wp-pch', recipient: 'claims@pchclaims.example' },
    ]);
  });

  it('matches a generic-domain provider by exact address', () => {
    expect(matchProviderRecipients(['qdosclaims@gmail.com'], providers)).toEqual([
      { workProviderId: 'wp-qdos', recipient: 'qdosclaims@gmail.com' },
    ]);
  });

  it('contributes nothing for unmatched or inactive-provider recipients', () => {
    expect(matchProviderRecipients(['someone@else.example', 'x@dead.example'], providers)).toEqual([]);
  });
});

describe('extractSubjectKeys', () => {
  it('finds a Case/PO-shaped token (normalised) and the VRM', () => {
    const keys = extractSubjectKeys('RE: CCPY26050 - report attached AB12 CDE');
    expect(keys.casePo).toBe('CCPY26050');
    expect(keys.vrm).toBe('AB12CDE');
  });

  it("returns '' keys for a subject with neither", () => {
    expect(extractSubjectKeys('Invoice for last month')).toEqual({ casePo: '', vrm: '' });
    expect(extractSubjectKeys(undefined)).toEqual({ casePo: '', vrm: '' });
  });
});

describe('decideSentItemsDone — the conservative core', () => {
  const pchHit = [{ workProviderId: 'wp-pch', recipient: 'claims@pchclaims.example' }];

  it('marks done when exactly one eva_submitted case of the matched provider resolves', () => {
    const d = decideSentItemsDone([caseRow({})], pchHit);
    expect(d).toEqual({
      kind: 'mark_done',
      caseId: 'case-1',
      casePo: 'PCH26100',
      recipient: 'claims@pchclaims.example',
    });
  });

  it('no-ops with no provider-matched recipient (never a guess)', () => {
    const d = decideSentItemsDone([caseRow({})], []);
    expect(d).toEqual({ kind: 'no_op', reason: 'no_provider_recipient', candidateCount: 0 });
  });

  it('no-ops when the resolved case is not eva_submitted', () => {
    const d = decideSentItemsDone([caseRow({ status: 'ready_for_eva' })], pchHit);
    expect(d).toEqual({ kind: 'no_op', reason: 'no_eligible_case', candidateCount: 0 });
  });

  it("no-ops when the case's provider does not match the recipient (send to a NON-provider)", () => {
    const d = decideSentItemsDone([caseRow({ workProviderId: 'wp-qdos' })], pchHit);
    expect(d.kind).toBe('no_op');
  });

  it('no-ops on ambiguity (two eligible cases)', () => {
    const d = decideSentItemsDone(
      [caseRow({}), caseRow({ caseId: 'case-2', casePo: 'PCH26101' })],
      pchHit,
    );
    expect(d).toEqual({ kind: 'no_op', reason: 'ambiguous', candidateCount: 2 });
  });

  it('duplicate rows for the SAME case collapse to one eligible (still marks)', () => {
    const d = decideSentItemsDone([caseRow({}), caseRow({})], pchHit);
    expect(d.kind).toBe('mark_done');
  });

  it('a done case is not eligible (idempotent re-processing of the same thread)', () => {
    const d = decideSentItemsDone([caseRow({ status: 'done' })], pchHit);
    expect(d).toEqual({ kind: 'no_op', reason: 'no_eligible_case', candidateCount: 0 });
  });
});

describe('buildSentEmailDetail', () => {
  it('carries the recipient + a whitespace-collapsed subject snippet', () => {
    expect(buildSentEmailDetail('claims@pchclaims.example', '  Report \n attached ')).toBe(
      'to=claims@pchclaims.example; subject=Report attached',
    );
  });

  it('omits the subject clause when empty', () => {
    expect(buildSentEmailDetail('a@b.c', '')).toBe('to=a@b.c');
  });
});
