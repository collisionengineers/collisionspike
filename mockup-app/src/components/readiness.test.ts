import { describe, expect, it } from 'vitest';
import {
  EVA_FIELD_ORDER,
  canSubmitCaseToEva,
  readinessForCase,
  type Case,
  type EvaField,
  type EvaFieldKey,
  type EvaFields,
} from '@cs/domain';
import { computeReadiness } from './readiness';

function evaField(value: string, reviewState: EvaField['reviewState'] = 'reviewed'): EvaField {
  return {
    value,
    reviewState,
    provenance: { sourceType: 'staff', sourceLabel: 'Test' },
  };
}

function testCase(): Case {
  const evaFields = {} as EvaFields;
  for (const desc of EVA_FIELD_ORDER) {
    (evaFields as unknown as Record<EvaFieldKey, EvaField>)[desc.key] = evaField(
      desc.key === 'inspectionAddress' ? '1 Test Road' : `value-${desc.key}`,
    );
  }
  evaFields.vatStatus = { ...evaFields.vatStatus, value: 'Yes' };
  evaFields.mileage = { ...evaFields.mileage, value: '48250' };
  evaFields.mileageUnit = { ...evaFields.mileageUnit, value: 'Miles' };
  return {
    id: 'case-1',
    vrm: 'AB12CDE',
    provider: 'QDOS',
    providerCode: 'QDOS',
    vehicleModel: 'Audi A3',
    evaFields,
    evidence: [
      {
        id: 'overview',
        fileName: 'overview.jpg',
        kind: 'image',
        imageRole: 'overview',
        registrationVisible: true,
        acceptedForEva: true,
        sourceLabel: 'Test',
      },
      {
        id: 'damage',
        fileName: 'damage.jpg',
        kind: 'image',
        imageRole: 'damage_closeup',
        registrationVisible: false,
        acceptedForEva: true,
        sourceLabel: 'Test',
      },
    ],
    notes: [],
    chasers: [],
    overviewFacts: {},
    status: 'ready_for_eva',
    missing: [],
    channel: { kind: 'email', mode: 'auto', sourceMailbox: '' },
    ageDays: 0,
    inspectionDecision: 'confirmed_physical',
    createdAt: '12/07/2026',
  };
}

describe('computeReadiness canonical adapter', () => {
  it('projects the exact domain checks and verdict', () => {
    const c = testCase();
    const canonical = readinessForCase(c);
    const ui = computeReadiness(c);
    expect(ui.items).toEqual(canonical.checks);
    expect(ui.ready).toBe(canonical.ready);
    expect(canSubmitCaseToEva(c)).toBe(true);
  });

  it('shows an unresolved populated field as a blocking checklist reason', () => {
    const c = testCase();
    c.evaFields.vehicleModel.reviewState = 'conflict';
    const ui = computeReadiness(c);
    expect(ui.ready).toBe(false);
    expect(ui.items.find((item) => item.id === 'no-conflicts')).toMatchObject({
      ok: false,
      detail: expect.stringContaining('Vehicle Model'),
    });
    expect(canSubmitCaseToEva(c)).toBe(false);
  });

  it('does not treat populated mileage prose as a resolved odometer value', () => {
    const c = testCase();
    c.evaFields.mileage.value = 'about fifty thousand';
    const ui = computeReadiness(c);
    expect(ui.ready).toBe(false);
    expect(ui.items.find((item) => item.id === 'vehicle-details')).toMatchObject({ ok: false });
  });

  it('an explicit hold blocks submission without pretending the field/image checks failed', () => {
    const c = testCase();
    c.onHold = true;
    expect(computeReadiness(c).ready).toBe(true);
    expect(canSubmitCaseToEva(c)).toBe(false);
  });

  it.each(['duplicate_risk', 'needs_review', 'eva_submitted'] as const)(
    'a canonically complete case in %s cannot bypass its current workflow state',
    (status) => {
      const c = testCase();
      c.status = status;
      expect(computeReadiness(c).ready).toBe(true);
      expect(canSubmitCaseToEva(c)).toBe(false);
    },
  );
});
