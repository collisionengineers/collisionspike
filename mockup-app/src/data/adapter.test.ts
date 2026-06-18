import { describe, it, expect } from 'vitest';
import {
  statusFromInt,
  statusToInt,
  caseStatusCodec,
  reviewStateCodec,
  evidenceKindCodec,
  sourceTypeCodec,
  imageRoleCodec,
  inspectionPolicyCodec,
  automationModeCodec,
  actionReasonCodec,
  dvDateToDmy,
  dmyToDvDate,
  evidenceFromRecord,
  evidenceToRecord,
  providerFromRecord,
  providerToRecord,
  evaFieldsFromRecord,
  evaFieldsToColumns,
  caseFromRecord,
  caseToRecord,
  type ChoiceCodec,
} from './adapter';
import { CASE_STATUSES, type CaseStatus } from '../contracts/case-status';
import { providers } from '../mock/providers';
import { cases } from '../mock/cases';
import type { Evidence } from '../mock/types';

// The REAL choice-set artifact (repo-root dataverse/), not a copy — same import
// the contracts' case-status.parity.test.ts uses.
import caseStatusChoiceSet from '../../../dataverse/choicesets/case-status.json';

interface ChoiceOption {
  value: number;
  name: string;
}
const statusOptions = caseStatusChoiceSet.options as ChoiceOption[];

/* ============================================================
   statuscode integer <-> CaseStatus parity against the choice set.
   ============================================================ */
describe('statuscode <-> CaseStatus parity vs the choice set', () => {
  it('maps every choice-set option value to its CaseStatus name (and back)', () => {
    for (const opt of statusOptions) {
      expect(statusFromInt(opt.value)).toBe(opt.name);
      expect(statusToInt(opt.name as CaseStatus)).toBe(opt.value);
    }
  });

  it('round-trips every CaseStatus through the integer value', () => {
    for (const status of CASE_STATUSES) {
      expect(statusFromInt(statusToInt(status))).toBe(status);
    }
  });

  it('codec names equal the CaseStatus union 1:1 (no extras/omissions)', () => {
    expect([...caseStatusCodec.names()].sort()).toEqual([...CASE_STATUSES].sort());
  });

  it('throws on an unknown statuscode integer', () => {
    expect(() => statusFromInt(99)).toThrow();
    expect(() => statusFromInt(null)).toThrow();
  });
});

/* ============================================================
   Every codec is a clean bijection over its choice-set options.
   ============================================================ */
describe('choice codecs are round-trippable bijections', () => {
  // Erase each codec's specific name type so the shared loop type-checks.
  const codecs: ChoiceCodec<string>[] = [
    caseStatusCodec,
    reviewStateCodec,
    evidenceKindCodec,
    imageRoleCodec,
    inspectionPolicyCodec,
    automationModeCodec,
    actionReasonCodec,
  ];
  for (const codec of codecs) {
    it(`${codec.logicalName}: name -> int -> name is identity`, () => {
      for (const name of codec.names()) {
        const v = codec.toInt(name);
        expect(v).toBeTypeOf('number');
        expect(codec.toName(v)).toBe(name);
      }
      // and int -> name -> int
      for (const v of codec.values()) {
        const name = codec.toName(v);
        expect(name).toBeDefined();
        expect(codec.toInt(name)).toBe(v);
      }
    });
  }
});

/* ============================================================
   Date round-trips.
   ============================================================ */
describe('Dataverse date <-> DD/MM/YYYY', () => {
  it('round-trips a well-formed date', () => {
    expect(dvDateToDmy('2026-06-17')).toBe('17/06/2026');
    expect(dmyToDvDate('17/06/2026')).toBe('2026-06-17');
    expect(dmyToDvDate(dvDateToDmy('2026-01-02'))).toBe('2026-01-02');
  });
  it('handles ISO datetimes by taking the date part', () => {
    expect(dvDateToDmy('2026-06-17T09:14:00Z')).toBe('17/06/2026');
  });
  it('returns undefined for empty/malformed input', () => {
    expect(dvDateToDmy('')).toBeUndefined();
    expect(dvDateToDmy(null)).toBeUndefined();
    expect(dmyToDvDate('not-a-date')).toBeUndefined();
  });
});

/* ============================================================
   Evidence record round-trip.
   ============================================================ */
describe('Evidence <-> cr1bd_evidence row round-trip', () => {
  it('round-trips a fully-populated evidence item', () => {
    const e: Evidence = {
      id: 'ev-x',
      fileName: 'overview.jpg',
      kind: 'image',
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      excluded: false,
      sourceLabel: 'Email — example.co.uk',
    };
    const back = evidenceFromRecord(evidenceToRecord('case-x', e));
    expect(back).toMatchObject({
      id: 'ev-x',
      fileName: 'overview.jpg',
      kind: 'image',
      imageRole: 'overview',
      registrationVisible: true,
      acceptedForEva: true,
      sourceLabel: 'Email — example.co.uk',
    });
  });

  it('preserves an exclusion reason', () => {
    const e: Evidence = {
      id: 'ev-y',
      fileName: 'selfie.jpg',
      kind: 'image',
      imageRole: 'additional',
      registrationVisible: false,
      acceptedForEva: false,
      excluded: true,
      exclusionReason: "Person's reflection visible — unusable",
      sourceLabel: 'Email',
    };
    const back = evidenceFromRecord(evidenceToRecord('case-y', e));
    expect(back.excluded).toBe(true);
    expect(back.exclusionReason).toBe("Person's reflection visible — unusable");
  });
});

/* ============================================================
   Provider record round-trip (incl. the binding enums + domain Memo parse).
   ============================================================ */
describe('Provider <-> cr1bd_workprovider row round-trip', () => {
  it('round-trips every mock provider, preserving the binding enums', () => {
    for (const p of providers) {
      const back = providerFromRecord(providerToRecord(p));
      expect(back).toEqual(p);
    }
  });

  it('parses a JSON-array domains Memo as well as newline lists', () => {
    const jsonRec = providerToRecord({ ...providers[0] });
    jsonRec.cr1bd_knownemaildomains = '["a.co.uk","b.co.uk"]';
    expect(providerFromRecord(jsonRec).knownEmailDomains).toEqual(['a.co.uk', 'b.co.uk']);
  });
});

/* ============================================================
   EVA fields <-> Case columns + provenance rows.
   ============================================================ */
describe('EVA fields <-> Case columns + provenance', () => {
  it('projects 12 values onto cr1bd_eva* columns and reads them back', () => {
    const c = cases[0];
    const cols = evaFieldsToColumns(c.evaFields);
    const built = evaFieldsFromRecord(cols);
    // Values survive the column projection (provenance defaults to a staff stub).
    expect(built.workProvider.value).toBe(c.evaFields.workProvider.value);
    expect(built.mileage.value).toBe(c.evaFields.mileage.value);
    expect(built.mileageUnit.value).toBe(c.evaFields.mileageUnit.value);
  });

  it('pairs a provenance row onto its EVA field (sourceType + reviewState + confidence)', () => {
    const cols = evaFieldsToColumns(cases[0].evaFields);
    const built = evaFieldsFromRecord(cols, [
      {
        cr1bd_fieldname: 'vehicleModel',
        cr1bd_sourcetype: sourceTypeCodec.toInt('pdf_extraction'),
        cr1bd_reviewstate: reviewStateCodec.toInt('reviewed'),
        cr1bd_confidence: 0.97,
        cr1bd_sourcelabel: 'Instruction PDF p.1',
      },
    ]);
    expect(built.vehicleModel.provenance.sourceType).toBe('pdf_extraction');
    expect(built.vehicleModel.reviewState).toBe('reviewed');
    expect(built.vehicleModel.provenance.confidence).toBe(0.97);
    expect(built.vehicleModel.provenance.sourceLabel).toBe('Instruction PDF p.1');
  });
});

/* ============================================================
   Case record round-trip on the identity + workflow + EVA columns.
   ============================================================ */
describe('Case <-> cr1bd_case row round-trip', () => {
  it('round-trips status, channel, dates, action reason and EVA values', () => {
    const c = cases[1]; // case-002, missing_images, has actionReason + dateDue
    const rec = caseToRecord(c);
    // Re-read via caseFromRecord, feeding back the provider display so it matches.
    const back = caseFromRecord({
      record: {
        ...rec,
        cr1bd_caseid: c.id,
        createdon: dmyToDvDate(c.createdAt),
        cr1bd_provider_display: c.provider,
        cr1bd_provider_code: c.providerCode,
      },
      now: new Date(2026, 5, 18),
    });
    expect(back.status).toBe(c.status);
    expect(back.vrm).toBe(c.vrm);
    expect(back.actionReason).toBe(c.actionReason);
    expect(back.dateDue).toBe(c.dateDue);
    expect(back.channel.mode).toBe(c.channel.mode);
    expect(back.channel.kind).toBe(c.channel.kind);
    expect(back.inspectionDecision).toBe(c.inspectionDecision);
    expect(back.evaFields.claimantName.value).toBe(c.evaFields.claimantName.value);
  });

  it('omits casePo / submittedAt when absent', () => {
    const c = cases[6]; // case-007 new_email — no casePo, no dateDue, no submittedAt
    const rec = caseToRecord(c);
    const back = caseFromRecord({
      record: { ...rec, cr1bd_caseid: c.id, createdon: dmyToDvDate(c.createdAt) },
      now: new Date(2026, 5, 18),
    });
    expect(back.casePo).toBeUndefined();
    expect(back.submittedAt).toBeUndefined();
    expect(back.status).toBe('new_email');
  });
});
