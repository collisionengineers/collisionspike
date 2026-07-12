import { describe, expect, it } from 'vitest';
import {
  supplementAccidentCircumstancesFromBody,
  supplementClaimantNameFromBody,
} from './supplement-parse.js';

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

describe('supplementClaimantNameFromBody', () => {
  it('extracts an explicit same-line claimant label', () => {
    expect(supplementClaimantNameFromBody('Claimant Name: Ms Jane Example')).toEqual({
      status: 'matched',
      value: 'Ms Jane Example',
      candidates: ['Ms Jane Example'],
    });
  });

  it('extracts an immediate next-line claimant value', () => {
    expect(supplementClaimantNameFromBody('Our Client:\nDr Evelyn Original')).toMatchObject({
      status: 'matched',
      value: 'Dr Evelyn Original',
    });
  });

  it('prefers an explicit label over weaker claimant prose', () => {
    const result = supplementClaimantNameFromBody(
      'The claimant is Ms Preliminary Example\nClaimant: Dr Evelyn Confirmed',
    );
    expect(result).toMatchObject({ status: 'matched', value: 'Dr Evelyn Confirmed' });
  });

  it('keeps the person-name prefix before trailing instruction prose', () => {
    expect(
      supplementClaimantNameFromBody(
        'Claimant: Ms Jane Example requires inspection for Example Legal Services',
      ),
    ).toMatchObject({ status: 'matched', value: 'Ms Jane Example' });
  });

  it('rejects an organisation presented as the claimant value', () => {
    expect(supplementClaimantNameFromBody('Claimant: Example Legal Services Ltd')).toMatchObject({
      status: 'absent',
      value: '',
    });
  });

  it('does not turn a repeated label phrase into a person name', () => {
    expect(supplementClaimantNameFromBody('Claimant: The claimant is')).toMatchObject({
      status: 'absent',
      value: '',
    });
  });

  it('rejects placeholders, insured people, handlers, repairers and signature names', () => {
    const body = [
      'Claimant: TBC',
      'Our Insured: Mr Isaac Insured',
      'Repairer: Taylor Bodyshop',
      'Kind regards,',
      'Alex Handler',
      'Claimant Name: Alex Handler',
    ].join('\n');
    expect(supplementClaimantNameFromBody(body)).toEqual({
      status: 'absent',
      value: '',
      candidates: [],
    });
  });

  it('preserves a quoted original instruction after the current sender signature', () => {
    const body = [
      'Please see below.',
      'Kind regards,',
      'Alex Handler',
      '-----Original Message-----',
      'From: instructions@example.test',
      'Claimant Name: Ms Jane Original',
    ].join('\n');
    expect(supplementClaimantNameFromBody(body)).toMatchObject({
      status: 'matched',
      value: 'Ms Jane Original',
    });
  });

  it('does not treat an opening many-thanks sentence as a signature', () => {
    expect(
      supplementClaimantNameFromBody(
        'Many thanks for the new instruction.\nClaimant: Ms Jane Example',
      ),
    ).toMatchObject({ status: 'matched', value: 'Ms Jane Example' });
  });

  it('excludes a signature whose sign-off and sender share one line', () => {
    expect(
      supplementClaimantNameFromBody(
        'Kind regards, Alex Handler\nClaimant Name: Alex Handler',
      ),
    ).toMatchObject({ status: 'absent', value: '' });
  });

  it('reads a claimant label from quoted body lines', () => {
    expect(supplementClaimantNameFromBody('> Claimant: Ms Jane Original')).toMatchObject({
      status: 'matched',
      value: 'Ms Jane Original',
    });
  });

  it('still excludes a signature inside a quoted original message', () => {
    expect(
      supplementClaimantNameFromBody(
        '> Kind regards\n> Ms Jane Signature\n> Claimant Name: Ms Jane Signature',
      ),
    ).toMatchObject({ status: 'absent', value: '' });
  });

  it('returns a conflict and no value for two different explicit claimant labels', () => {
    const result = supplementClaimantNameFromBody(
      'Claimant: Ms Jane First\nClaimant Name: Dr Evelyn Second',
    );
    expect(result.status).toBe('conflict');
    expect(result.value).toBe('');
    expect(result.candidates).toEqual(['Ms Jane First', 'Dr Evelyn Second']);
  });
});
