import { describe, expect, it } from 'vitest';

import {
  createIdentityFields,
  IMAGE_ONLY_IDENTITY_ORDER,
  manualVehicleModel,
  manualVehicleLookupMessage,
  mergeManualVehicleLookup,
} from './manual-intake-create';

const values = {
  provider: '  QDOS  ',
  providerCode: ' QD ',
  providerReference: ' REF-1 ',
  insuredName: ' Policy Holder ',
};

describe('manual vehicle identity', () => {
  it('persists make and model together without duplicating an existing make prefix', () => {
    expect(manualVehicleModel('Ford', 'Focus')).toBe('Ford Focus');
    expect(manualVehicleModel('Ford', 'FORD Focus')).toBe('FORD Focus');
    expect(manualVehicleModel('', 'Focus')).toBe('Focus');
  });

  it('uses lookup values only for absent or invalid vehicle fields', () => {
    expect(mergeManualVehicleLookup(
      { make: '', vehicleModel: '', mileage: 'unknown', mileageUnit: '' },
      { make: 'Ford', vehicleModel: 'Focus', currentMileage: 52_000, mileageUnit: 'Miles' },
    )).toEqual({
      make: 'Ford',
      vehicleModel: 'Ford Focus',
      mileage: '52000',
      mileageUnit: 'Miles',
    });
  });

  it('preserves parsed and staff-entered vehicle values during lookup', () => {
    expect(mergeManualVehicleLookup(
      { make: 'Staff make', vehicleModel: 'Parsed model', mileage: '41000', mileageUnit: 'Km' },
      { make: 'Ford', vehicleModel: 'Focus', currentMileage: 52_000, mileageUnit: 'Miles' },
    )).toEqual({
      make: 'Staff make',
      vehicleModel: 'Parsed model',
      mileage: '41000',
      mileageUnit: 'Km',
    });
  });

  it('maps lookup outcomes to staff-safe copy instead of estimator diagnostics', () => {
    expect(manualVehicleLookupMessage('invalid_registration')).toBe('Check the registration and try again.');
    expect(manualVehicleLookupMessage('not_found')).toBe('No vehicle record was found for this registration.');
    expect(manualVehicleLookupMessage('temporarily_unavailable')).toBe(
      'Vehicle details are temporarily unavailable. Try again.',
    );
    expect(manualVehicleLookupMessage('configuration_error')).not.toMatch(/profile|cohort|algorithm/i);
  });
});

describe('images-only manual intake identity', () => {
  it('never submits provider or insured values', () => {
    expect(createIdentityFields('images', values)).toEqual({});
  });

  it('preserves instruction-led identity fields without remapping them', () => {
    expect(createIdentityFields('manual', values)).toEqual({
      provider: 'QDOS',
      providerCode: 'QD',
      providerReference: 'REF-1',
      insuredName: 'Policy Holder',
    });
  });

  it('keeps one predictable claimant and vehicle keyboard order', () => {
    expect(IMAGE_ONLY_IDENTITY_ORDER).toEqual([
      'claimantName',
      'vrm',
      'make',
      'vehicleModel',
      'mileage',
    ]);
    expect(IMAGE_ONLY_IDENTITY_ORDER).not.toContain('insuredName');
  });
});
