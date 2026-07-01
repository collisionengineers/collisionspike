import { describe, expect, it } from 'vitest';
import { supplementAccidentCircumstancesFromBody } from './supplement-parse.js';

const NARRATIVE =
  "Our client, in their vehicle was proceeding in the left lane on the Redbridge Flyover, Southampton and became stationary at a set of traffic lights. This portion of the road has two lanes for each direction of travel. Your insured, in their vehicle has failed to apply their brakes in time and has collided into the rear of our client's vehicle.";

describe('supplementAccidentCircumstancesFromBody', () => {
  it('extracts narrative between Accident Circumstances and Damage Description', () => {
    const body = [
      'Registration: VN64WNG',
      'Accident Circumstances:',
      NARRATIVE,
      'Damage Description:',
      'Rear: Moderate',
      'Driveable:',
      'Yes',
    ].join('\n');

    expect(supplementAccidentCircumstancesFromBody(body)).toBe(NARRATIVE);
  });

  it('returns empty when the label block is absent', () => {
    expect(supplementAccidentCircumstancesFromBody('Registration: AB12CDE')).toBe('');
  });

  it('returns empty when only the label is present', () => {
    expect(
      supplementAccidentCircumstancesFromBody('Accident Circumstances:\nDamage Description:\nRear'),
    ).toBe('');
  });
});
