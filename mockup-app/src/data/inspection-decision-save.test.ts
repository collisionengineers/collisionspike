import { describe, it, expect, vi } from 'vitest';
import { createDataverseDataAccess } from './dataverse-source';
import { mockDataAccess } from './mock-source';
import { inspectionDecisionCodec, isSuggestedAddressRecord } from './adapter';
import type {
  CaseRecord,
  GeneratedServices,
  GeneratedTableService,
  InspectionAddressRecord,
  InspectionDecisionInput,
  OperationResult,
} from './types';

/* ============================================================
   saveInspectionDecision — the InspectionAddress provenance SAVE-PATH seam
   (Item A, ADR-0013-sensitive).

   Pins the three load-bearing rules:
     1. HONEST NO-OP when the corpus table isn't wired (services.inspectionAddresses
        undefined) — resolves { persisted:false } and never throws.
     2. Correct CONFIRMED upsert payload when wired (decisionMode + sourceLabel +
        sourceNote + address lines/postcode), with a fake service injected.
     3. ADR-0013 invariant: the seam writes nothing on its own; a write happens ONLY
        when the method is explicitly called, and the row it writes is a CONFIRMED
        decision (decisionMode != unknown, AND sourceLabel does NOT start with
        'suggested' — so isSuggestedAddressRecord EXCLUDES it and the suggestions
        query never re-surfaces it), never an auto-resolved/unconfirmed suggestion.
   ============================================================ */

/** A capturing create-spy table service; records every create() payload. */
function fakeInspectionService(
  created: Array<Partial<InspectionAddressRecord>>,
  returnId = 'ia-new',
): GeneratedTableService<InspectionAddressRecord> {
  return {
    getAll: async (): Promise<OperationResult<InspectionAddressRecord[]>> => ({ data: [] }),
    get: async () => ({ data: undefined }),
    create: async (record) => {
      created.push(record);
      return { data: { cr1bd_inspectionaddressid: returnId, ...record } };
    },
    update: async () => ({ data: undefined }),
  };
}

/** A read-only cases stub returning a single case row with the given Case/PO, so the
 *  seam can derive the provider PRINCIPAL token for the source note. */
function fakeCasesService(casePo: string): GeneratedTableService<CaseRecord> {
  return {
    getAll: async (): Promise<OperationResult<CaseRecord[]>> => ({ data: [] }),
    get: async (id) => ({ data: { cr1bd_caseid: id, cr1bd_casepo: casePo } as CaseRecord }),
    create: async () => ({ data: undefined }),
    update: async () => ({ data: undefined }),
  };
}

/** GeneratedServices stub carrying the inspection-address service (or none) and an
 *  optional cases service (for the provider-token derivation). */
function servicesWith(
  inspectionAddresses?: GeneratedTableService<InspectionAddressRecord>,
  cases?: GeneratedTableService<CaseRecord>,
): GeneratedServices {
  return {
    ...(inspectionAddresses ? { inspectionAddresses } : {}),
    ...(cases ? { cases } : {}),
  } as unknown as GeneratedServices;
}

const ASSIST_PICK: InspectionDecisionInput = {
  decisionMode: 'manual',
  // A reviewer-CONFIRMED pick: the label must NOT start with 'suggested' (that
  // prefix is reserved for the unconfirmed corpus candidates). 'confirmed:assist'
  // mirrors the 'suggested:assist' convention but is excluded from the suggestion set.
  sourceLabel: 'confirmed:assist',
  sourceNote: 'Suggested from the photos — sign on the building reads "Smith Recovery"',
  addressLines: ['Smith Recovery', 'Unit 4 Acton Park', 'London'],
  postcode: 'W3 7QE',
};

describe('saveInspectionDecision — honest no-op when unwired', () => {
  it('resolves { persisted:false } over the Dataverse source when the table is absent', async () => {
    const da = createDataverseDataAccess(servicesWith());
    const result = await da.saveInspectionDecision('case-1', ASSIST_PICK);
    expect(result).toEqual({ persisted: false });
  });

  it('resolves { persisted:false } over the empty default (mock) source', async () => {
    const result = await mockDataAccess.saveInspectionDecision('case-1', ASSIST_PICK);
    expect(result).toEqual({ persisted: false });
  });
});

describe('saveInspectionDecision — correct upsert payload when wired', () => {
  it('writes the confirmed decision + provenance + address onto one corpus row', async () => {
    const created: Array<Partial<InspectionAddressRecord>> = [];
    const da = createDataverseDataAccess(
      servicesWith(fakeInspectionService(created), fakeCasesService('CCPY26050')),
    );

    const result = await da.saveInspectionDecision('case-42', ASSIST_PICK);

    expect(result.persisted).toBe(true);
    expect(result.id).toBe('ia-new');
    expect(created).toHaveLength(1);
    const row = created[0];

    // Provenance columns carry the confirmed pick's origin + note. The label is a
    // CONFIRMED label (NOT 'suggested*') — so this row is excluded from the suggestion
    // set rather than re-offered as an unconfirmed candidate (ADR-0013).
    expect(row.cr1bd_sourcelabel).toBe('confirmed:assist');
    expect(row.cr1bd_sourcelabel?.startsWith('suggested')).toBe(false);
    expect(row.cr1bd_sourcenote).toContain('Suggested from the photos');
    // The originating case is traced in the note (the corpus has no case lookup).
    expect(row.cr1bd_sourcenote).toContain('case=case-42');
    // The provider PRINCIPAL is parsed from the Case/PO's leading-alpha run and
    // recorded for scoping/traceability (mirrors the corpus seeder's provider= token).
    expect(row.cr1bd_sourcenote).toContain('provider=CCPY');

    // The confirmed-not-suggestion invariant, pinned through the real predicate: the
    // suggestions query + Admin count both key on isSuggestedAddressRecord, so it MUST
    // exclude this written row.
    expect(isSuggestedAddressRecord(row as InspectionAddressRecord)).toBe(false);

    // decisionMode is the HUMAN-confirmed mode, mapped to its choice-set integer.
    expect(row.cr1bd_decisionmode).toBe(inspectionDecisionCodec.toInt('manual'));

    // Address lines + postcode are projected onto the row columns.
    expect(row.cr1bd_addressline1).toBe('Smith Recovery');
    expect(row.cr1bd_addressline2).toBe('Unit 4 Acton Park');
    expect(row.cr1bd_addressline3).toBe('London');
    expect(row.cr1bd_postcode).toBe('W3 7QE');
    // The required primary Label column is set (derived from the address).
    expect((row.cr1bd_name ?? '').length).toBeGreaterThan(0);
  });

  it('records an image-based decision with its reason and no address lines', async () => {
    const created: Array<Partial<InspectionAddressRecord>> = [];
    const da = createDataverseDataAccess(servicesWith(fakeInspectionService(created)));

    await da.saveInspectionDecision('case-7', {
      decisionMode: 'image_based',
      sourceLabel: 'image_based',
      sourceNote: 'No accessible physical location — image-based per reviewer',
      // image-based: no address lines / postcode supplied
    });

    const row = created[0];
    expect(row.cr1bd_decisionmode).toBe(inspectionDecisionCodec.toInt('image_based'));
    // The IBA literal becomes the Label.
    expect(row.cr1bd_name).toBe('Image Based Assessment');
    // The reason lands in the dedicated decision-reason column (schema requires it).
    expect(row.cr1bd_decisionreason).toContain('image-based per reviewer');
    // No address columns for an image-based decision.
    expect(row.cr1bd_addressline1).toBeUndefined();
    expect(row.cr1bd_postcode).toBeUndefined();
    // An IBA decision is a CONFIRMED row too — its 'image_based' label is non-suggested,
    // so it is excluded from the suggestion set (CaseDetail's IBA-override confirm path).
    expect(isSuggestedAddressRecord(row as InspectionAddressRecord)).toBe(false);
  });
});

describe('saveInspectionDecision — ADR-0013 invariant (no write without an explicit confirm)', () => {
  it('does not call create() unless the method is invoked (constructing the source writes nothing)', async () => {
    const create = vi.fn(async (record: Partial<InspectionAddressRecord>) => ({
      data: { cr1bd_inspectionaddressid: 'x', ...record },
    }));
    const svc: GeneratedTableService<InspectionAddressRecord> = {
      getAll: async () => ({ data: [] }),
      get: async () => ({ data: undefined }),
      create,
      update: async () => ({ data: undefined }),
    };

    // Building the source (the "on load" moment) must NOT write anything.
    const da = createDataverseDataAccess(servicesWith(svc));
    expect(create).not.toHaveBeenCalled();

    // Only the EXPLICIT confirm call writes — and exactly once.
    await da.saveInspectionDecision('case-1', ASSIST_PICK);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('writes a CONFIRMED row, never a new unconfirmed suggestion', async () => {
    const created: Array<Partial<InspectionAddressRecord>> = [];
    const da = createDataverseDataAccess(servicesWith(fakeInspectionService(created)));

    await da.saveInspectionDecision('case-9', ASSIST_PICK);
    const row = created[0];

    // The written row carries a RESOLVED decision mode (not the 'unknown' that a
    // suggestion row must keep) AND a non-'suggested' label — so isSuggestedAddressRecord
    // treats it as a confirmed reference, not a candidate the reviewer must still pick.
    expect(row.cr1bd_decisionmode).not.toBe(inspectionDecisionCodec.toInt('unknown'));
    expect(row.cr1bd_decisionmode).toBe(inspectionDecisionCodec.toInt('manual'));
    expect(isSuggestedAddressRecord(row as InspectionAddressRecord)).toBe(false);
  });
});
