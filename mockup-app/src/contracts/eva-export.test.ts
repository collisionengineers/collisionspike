import { describe, it, expect } from 'vitest';
import {
  EVA_FIELD_ORDER,
  EVA_PAYLOAD_KEYS,
  buildEvaPayload,
  serializeEvaPayload,
  buildEvaJson,
  type EvaFieldKey,
  type EvaPayloadInput,
} from './eva-export';

/** Build a full 12-field input where every field carries the given value pattern. */
function inputFrom(
  overrides: Partial<Record<EvaFieldKey, string>> = {},
): EvaPayloadInput {
  const fields = {} as EvaPayloadInput['evaFields'];
  for (const desc of EVA_FIELD_ORDER) {
    fields[desc.key] = { value: overrides[desc.key] ?? `val-${desc.key}` };
  }
  return { evaFields: fields };
}

describe('EVA_FIELD_ORDER', () => {
  it('has exactly 12 fields', () => {
    expect(EVA_FIELD_ORDER).toHaveLength(12);
  });

  it('lists the 12 binding payload keys in contract order, mileage_unit last', () => {
    expect(EVA_PAYLOAD_KEYS).toEqual([
      'work_provider',
      'vehicle_model',
      'claimant_name',
      'claimant_telephone',
      'claimant_email',
      'date_of_loss',
      'date_of_instruction',
      'accident_circumstances',
      'inspection_address',
      'vat_status',
      'mileage',
      'mileage_unit',
    ]);
    expect(EVA_PAYLOAD_KEYS[11]).toBe('mileage_unit');
  });

  it('marks the binding required fields', () => {
    const required = EVA_FIELD_ORDER.filter((d) => d.required).map((d) => d.key);
    expect(required).toEqual([
      'workProvider',
      'vehicleModel',
      'claimantName',
      'dateOfLoss',
      'dateOfInstruction',
      'accidentCircumstances',
      'inspectionAddress',
    ]);
  });
});

describe('buildEvaPayload', () => {
  it('produces exactly the 12 snake_case keys in contract order', () => {
    const payload = buildEvaPayload(inputFrom());
    expect(Object.keys(payload)).toEqual([...EVA_PAYLOAD_KEYS]);
  });

  it('excludes vrm and reference (Case-identity, not payload)', () => {
    const payload = buildEvaPayload(inputFrom());
    expect(payload).not.toHaveProperty('vrm');
    expect(payload).not.toHaveProperty('reference');
    expect(payload).not.toHaveProperty('VRM');
    expect(payload).not.toHaveProperty('Reference');
  });

  it('projects each camelCase field value onto its snake_case key', () => {
    const payload = buildEvaPayload(
      inputFrom({ workProvider: 'CCPY', mileageUnit: 'Miles' }),
    );
    expect(payload.work_provider).toBe('CCPY');
    expect(payload.mileage_unit).toBe('Miles');
  });

  it('defaults a missing field object to an empty string', () => {
    const partial = { evaFields: {} } as unknown as EvaPayloadInput;
    const payload = buildEvaPayload(partial);
    expect(payload.work_provider).toBe('');
    expect(Object.keys(payload)).toHaveLength(12);
  });
});

describe('serializeEvaPayload / buildEvaJson', () => {
  it('serializes deterministically regardless of caller key order', () => {
    const a = buildEvaPayload(inputFrom());
    // Reverse-insert the same data; serialization must re-order to contract order.
    const reversed = {} as typeof a;
    for (const k of [...EVA_PAYLOAD_KEYS].reverse()) reversed[k] = a[k];
    expect(serializeEvaPayload(reversed)).toBe(serializeEvaPayload(a));
  });

  it('emits keys in contract order in the JSON text', () => {
    const json = buildEvaJson(inputFrom());
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed)).toEqual([...EVA_PAYLOAD_KEYS]);
    // work_provider must appear before mileage_unit in the raw text.
    expect(json.indexOf('"work_provider"')).toBeLessThan(
      json.indexOf('"mileage_unit"'),
    );
  });
});
