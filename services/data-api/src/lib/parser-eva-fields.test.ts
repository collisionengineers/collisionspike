import { describe, it, expect } from 'vitest';
import {
  corpusWorkProviderCandidate,
  isEngineerReportLayoutSentinel,
  isUnknownWorkProviderSentinel,
  matchWorkProviderByContentString,
  normalizeProviderMatchKey,
  selectParserEvaCandidates,
  type ParserEvaFields,
  type WorkProviderContentMatchRecord,
} from './parser-eva-fields.js';

/**
 * selectParserEvaCandidates is the constraint guard between the parser's 12-field extraction
 * and the case_ eva_* columns. These tests pin the two things that matter: (1) the full
 * parser-owned set maps to the right columns/provenance keys, and (2) a value that would
 * violate a column CHECK constraint (bad date, non-Yes/No VAT) is SKIPPED, never passed
 * through to break the intake UPDATE.
 */
describe('selectParserEvaCandidates', () => {
  it('returns [] for absent / empty input', () => {
    expect(selectParserEvaCandidates(undefined)).toEqual([]);
    expect(selectParserEvaCandidates(null)).toEqual([]);
    expect(selectParserEvaCandidates({})).toEqual([]);
    expect(
      selectParserEvaCandidates({ claimant_name: '', vehicle_model: '   ' }),
    ).toEqual([]);
  });

  it('maps every parser-owned field to its column + camelCase provenance key, in contract order', () => {
    const input: ParserEvaFields = {
      work_provider: 'Knightsbridge Solicitors',
      vehicle_model: 'Toyota Prius',
      claimant_name: 'Mazhar Hussain Butt',
      claimant_telephone: '07700 900123',
      claimant_email: 'claimant@example.com',
      date_of_loss: '01/02/2026',
      date_of_instruction: '05/02/2026',
      accident_circumstances: 'Client was stationary when the third party collided with the rear.',
      vat_status: 'No',
    };
    const out = selectParserEvaCandidates(input);
    expect(out.map((c) => [c.column, c.provenanceField, c.value])).toEqual([
      ['eva_work_provider', 'workProvider', 'Knightsbridge Solicitors'],
      ['eva_vehicle_model', 'vehicleModel', 'Toyota Prius'],
      ['eva_claimant_name', 'claimantName', 'Mazhar Hussain Butt'],
      ['eva_claimant_telephone', 'claimantTelephone', '07700 900123'],
      ['eva_claimant_email', 'claimantEmail', 'claimant@example.com'],
      ['eva_date_of_loss', 'dateOfLoss', '01/02/2026'],
      ['eva_date_of_instruction', 'dateOfInstruction', '05/02/2026'],
      [
        'eva_accident_circumstances',
        'accidentCircumstances',
        'Client was stationary when the third party collided with the rear.',
      ],
      ['eva_vat_status', 'vatStatus', 'No'],
    ]);
  });

  it('SKIPS the UNKNOWN work_provider sentinel (manual-intake / parser-client parity)', () => {
    expect(selectParserEvaCandidates({ work_provider: 'UNKNOWN' })).toEqual([]);
    expect(selectParserEvaCandidates({ work_provider: 'unknown' })).toEqual([]);
    expect(selectParserEvaCandidates({ work_provider: '  Unknown  ' })).toEqual([]);
    expect(
      selectParserEvaCandidates({ work_provider: 'UNKNOWN', vehicle_model: 'Ford Focus' }),
    ).toEqual([{ column: 'eva_vehicle_model', provenanceField: 'vehicleModel', value: 'Ford Focus' }]);
  });

  it('trims surrounding whitespace before persisting', () => {
    const out = selectParserEvaCandidates({ claimant_name: '  Uzair Khan  ' });
    expect(out).toEqual([
      { column: 'eva_claimant_name', provenanceField: 'claimantName', value: 'Uzair Khan' },
    ]);
  });

  it('marks an e-mail-body claimant with e-mail provenance', () => {
    const out = selectParserEvaCandidates({
      claimant_name: 'Ms Jane Example',
      sources: { claimant_name: 'email_text' },
    });
    expect(out).toEqual([
      {
        column: 'eva_claimant_name',
        provenanceField: 'claimantName',
        value: 'Ms Jane Example',
        sourceType: 'email_text',
        sourceLabel: 'From email body',
      },
    ]);
  });

  it('SKIPS a date that is not DD/MM/YYYY (would violate ck_case_eva_date_of_*)', () => {
    expect(selectParserEvaCandidates({ date_of_loss: '2026-02-01' })).toEqual([]);
    expect(selectParserEvaCandidates({ date_of_loss: 'February 2026' })).toEqual([]);
    expect(selectParserEvaCandidates({ date_of_instruction: '5/2/26' })).toEqual([]);
    // a valid one alongside an invalid one → only the valid one survives
    const out = selectParserEvaCandidates({ date_of_loss: '01/02/2026', date_of_instruction: 'soon' });
    expect(out).toEqual([
      { column: 'eva_date_of_loss', provenanceField: 'dateOfLoss', value: '01/02/2026' },
    ]);
  });

  it('SKIPS a VAT value that is not exactly Yes/No (would violate ck_case_eva_vat_status)', () => {
    expect(selectParserEvaCandidates({ vat_status: 'VAT Registered' })).toEqual([]);
    expect(selectParserEvaCandidates({ vat_status: 'yes' })).toEqual([]); // case-sensitive guard
    expect(selectParserEvaCandidates({ vat_status: 'Unknown' })).toEqual([]);
    expect(selectParserEvaCandidates({ vat_status: 'Yes' })).toEqual([
      { column: 'eva_vat_status', provenanceField: 'vatStatus', value: 'Yes' },
    ]);
  });

  it('length-caps values to their column width', () => {
    const longModel = 'X'.repeat(500);
    const longCirc = 'Y'.repeat(5000);
    const out = selectParserEvaCandidates({
      vehicle_model: longModel,
      accident_circumstances: longCirc,
    });
    const byCol = Object.fromEntries(out.map((c) => [c.column, c.value]));
    expect(byCol['eva_vehicle_model']).toHaveLength(200);
    expect(byCol['eva_accident_circumstances']).toHaveLength(4000);
  });
});

describe('isUnknownWorkProviderSentinel', () => {
  it('detects UNKNOWN case-insensitively', () => {
    expect(isUnknownWorkProviderSentinel('UNKNOWN')).toBe(true);
    expect(isUnknownWorkProviderSentinel('unknown')).toBe(true);
    expect(isUnknownWorkProviderSentinel('  Unknown ')).toBe(true);
    expect(isUnknownWorkProviderSentinel('ALS')).toBe(false);
  });
});

describe('corpusWorkProviderCandidate', () => {
  it('returns null for absent/blank display names', () => {
    expect(corpusWorkProviderCandidate(undefined)).toBeNull();
    expect(corpusWorkProviderCandidate('')).toBeNull();
    expect(corpusWorkProviderCandidate('   ')).toBeNull();
  });

  it('maps corpus display_name to eva_work_provider candidate', () => {
    expect(corpusWorkProviderCandidate('Acuity Loss Adjusters')).toEqual({
      column: 'eva_work_provider',
      provenanceField: 'workProvider',
      value: 'Acuity Loss Adjusters',
    });
  });

  it('length-caps display_name to 200 chars', () => {
    const long = 'P'.repeat(300);
    expect(corpusWorkProviderCandidate(long)?.value).toHaveLength(200);
  });
});

/**
 * matchWorkProviderByContentString is the rules-engine-v2 Phase 3 (ADR-0011) mapping from
 * a parser-detected work_provider STRING to a real work_provider_id. The normalization
 * rules are pinned by the 2026-07-02 verify-first probe (see the module doc): the engine
 * emits a SHORT code verbatim for the providers actually probed (PCH/SBL/QDOS), so this
 * must match principal_code exactly (case/light-punctuation-insensitive); the EXISTING
 * "Knightsbridge Solicitors" fixture above shows a full display-name-shaped string is also
 * a real possibility, so display_name is matched too.
 */
describe('normalizeProviderMatchKey', () => {
  it('trims, uppercases, and collapses whitespace', () => {
    expect(normalizeProviderMatchKey('  pch  ')).toBe('PCH');
    expect(normalizeProviderMatchKey('Knightsbridge   Solicitors')).toBe('KNIGHTSBRIDGE SOLICITORS');
  });

  it('strips light punctuation the parser/corpus are inconsistent about', () => {
    expect(normalizeProviderMatchKey('P.C.H.')).toBe('PCH');
    expect(normalizeProviderMatchKey("O'Brien & Sons")).toBe('OBRIEN SONS');
    expect(normalizeProviderMatchKey('Smith, Jones Ltd')).toBe('SMITH JONES LTD');
  });
});

describe('matchWorkProviderByContentString', () => {
  const PROVIDERS: WorkProviderContentMatchRecord[] = [
    { workProviderId: 'wp-pch', principalCode: 'PCH', displayName: 'PCH (Performance Car Hire)' },
    { workProviderId: 'wp-sbl', principalCode: 'SBL', displayName: 'SBL' },
    { workProviderId: 'wp-qdos', principalCode: 'QDOS', displayName: 'Qdos Broker & Underwriting' },
    { workProviderId: 'wp-ks', principalCode: 'KBS', displayName: 'Knightsbridge Solicitors' },
  ];

  it('matches the OBSERVED short-code strings verbatim against principal_code (PCH/SBL/QDOS)', () => {
    expect(matchWorkProviderByContentString('PCH', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-pch' });
    expect(matchWorkProviderByContentString('SBL', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-sbl' });
    expect(matchWorkProviderByContentString('QDOS', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-qdos' });
  });

  it('matches a full display-name-shaped string against display_name (the corpus fallback shape)', () => {
    expect(matchWorkProviderByContentString('Knightsbridge Solicitors', PROVIDERS)).toEqual({
      outcome: 'matched',
      workProviderId: 'wp-ks',
    });
  });

  it('is case- and light-punctuation-insensitive', () => {
    expect(matchWorkProviderByContentString('pch', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-pch' });
    expect(matchWorkProviderByContentString('P.C.H.', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-pch' });
    expect(matchWorkProviderByContentString('  sbl  ', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-sbl' });
  });

  it('treats the UNKNOWN sentinel and blank/whitespace input as unmatched, never a guess', () => {
    expect(matchWorkProviderByContentString('UNKNOWN', PROVIDERS)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('  Unknown ', PROVIDERS)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('', PROVIDERS)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('   ', PROVIDERS)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString(undefined, PROVIDERS)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString(null, PROVIDERS)).toEqual({ outcome: 'unmatched' });
  });

  it('a string matching no provider is unmatched (never invents a row)', () => {
    expect(matchWorkProviderByContentString('Totally Unrelated Company', PROVIDERS)).toEqual({ outcome: 'unmatched' });
  });

  it('never auto-picks when two DIFFERENT providers normalize to the same key (ambiguous)', () => {
    const collidingProviders: WorkProviderContentMatchRecord[] = [
      { workProviderId: 'wp-a', principalCode: 'DUP', displayName: 'Dup Co' },
      { workProviderId: 'wp-b', principalCode: 'XYZ', displayName: 'DUP CO' },
    ];
    expect(matchWorkProviderByContentString('Dup Co', collidingProviders)).toEqual({ outcome: 'ambiguous' });
  });

  it('the SAME provider matching on both principal_code and display_name is still one match, not ambiguous', () => {
    // "PCH" matches wp-pch's principal_code; it happens to also be a substring of its
    // display_name, but only an EXACT normalized-key match counts, so this stays a clean
    // single hit — the Set dedupe on workProviderId is what keeps this from double-counting.
    expect(matchWorkProviderByContentString('PCH', PROVIDERS)).toEqual({ outcome: 'matched', workProviderId: 'wp-pch' });
  });

  it('TKT-051: an engineer-report layout name never matches, even against a matching corpus row', () => {
    // A stale "EVA" work_provider row in the live corpus must not be reachable from the
    // parser's engineer-report layout name — the audited firm is never the instructing provider.
    const withEvaRow: WorkProviderContentMatchRecord[] = [
      ...PROVIDERS,
      { workProviderId: 'wp-eva', principalCode: 'EVA', displayName: 'EVA (Engineers)' },
    ];
    expect(matchWorkProviderByContentString('EVA (Engineers)', withEvaRow)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('eva (engineers)', withEvaRow)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('Exclusive Vehicle Assessors', withEvaRow)).toEqual({ outcome: 'unmatched' });
    expect(matchWorkProviderByContentString('CNX (Engineers)', withEvaRow)).toEqual({ outcome: 'unmatched' });
  });
});

/**
 * TKT-051 — the engineer-report layout denylist. "EVA (Engineers)" / "CNX (Engineers)"
 * are the parser's LAYOUTS for an engineering firm's report; on an audit case that
 * report's issuer is the firm CE audits, never the instructing work provider.
 */
describe('isEngineerReportLayoutSentinel', () => {
  it('flags the engineer-report layout names, case/paren/whitespace-insensitively', () => {
    expect(isEngineerReportLayoutSentinel('EVA (Engineers)')).toBe(true);
    expect(isEngineerReportLayoutSentinel('  eva (engineers)  ')).toBe(true);
    expect(isEngineerReportLayoutSentinel('EVA Engineers')).toBe(true);
    expect(isEngineerReportLayoutSentinel('CNX (Engineers)')).toBe(true);
    expect(isEngineerReportLayoutSentinel('Exclusive Vehicle Assessors')).toBe(true);
    expect(isEngineerReportLayoutSentinel('Connexus Vehicle Assessors')).toBe(true);
  });

  it('never flags real providers or near-miss names', () => {
    expect(isEngineerReportLayoutSentinel('PCH')).toBe(false);
    expect(isEngineerReportLayoutSentinel('QDOS')).toBe(false);
    expect(isEngineerReportLayoutSentinel('Knightsbridge Solicitors')).toBe(false);
    expect(isEngineerReportLayoutSentinel('EVA')).toBe(false); // bare code is NOT denylisted — corpus decides
    expect(isEngineerReportLayoutSentinel('')).toBe(false);
  });

  it('blanks the eva_work_provider fill via selectParserEvaCandidates', () => {
    expect(selectParserEvaCandidates({ work_provider: 'EVA (Engineers)' })).toEqual([]);
    expect(selectParserEvaCandidates({ work_provider: 'CNX (Engineers)' })).toEqual([]);
  });
});
