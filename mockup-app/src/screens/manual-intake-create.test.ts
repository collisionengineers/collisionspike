import { describe, expect, it } from 'vitest';

import {
  createIdentityFields,
  IMAGE_ONLY_IDENTITY_ORDER,
  manualVehicleModel,
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
