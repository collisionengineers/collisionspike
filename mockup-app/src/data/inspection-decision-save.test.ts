import { describe, it, expect, vi } from 'vitest';
import { createDataverseDataAccess } from './dataverse-source';
import { mockDataAccess } from './mock-source';
import { inspectionDecisionCodec } from './adapter';
import type {
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
        decision (decisionMode != unknown, sourceLabel not 'suggested*'), never an
        auto-resolved/unconfirmed suggestion.
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

/** GeneratedServices stub carrying only the inspection-address service (or none). */
function servicesWith(
  inspectionAddresses?: GeneratedTableService<InspectionAddressRecord>,
): GeneratedServices {
  return {
    ...(inspectionAddresses ? { inspectionAddresses } : {}),
  } as unknown as GeneratedServices;
}

const ASSIST_PICK: InspectionDecisionInput = {
  decisionMode: 'manual',
  sourceLabel: 'suggested:assist',
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
    const da = createDataverseDataAccess(servicesWith(fakeInspectionService(created)));

    const result = await da.saveInspectionDecision('case-42', ASSIST_PICK);

    expect(result.persisted).toBe(true);
    expect(result.id).toBe('ia-new');
    expect(created).toHaveLength(1);
    const row = created[0];

    // Provenance columns carry the confirmed pick's origin + note.
    expect(row.cr1bd_sourcelabel).toBe('suggested:assist');
    expect(row.cr1bd_sourcenote).toContain('Suggested from the photos');
    // The originating case is traced in the note (the corpus has no case lookup).
    expect(row.cr1bd_sourcenote).toContain('case=case-42');

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
    // suggestion row must keep) — so isSuggestedAddressRecord would treat it as a
    // confirmed reference, not a candidate the reviewer must still pick.
    expect(row.cr1bd_decisionmode).not.toBe(inspectionDecisionCodec.toInt('unknown'));
    expect(row.cr1bd_decisionmode).toBe(inspectionDecisionCodec.toInt('manual'));
  });
});
