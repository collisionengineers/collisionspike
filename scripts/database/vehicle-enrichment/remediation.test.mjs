import assert from 'node:assert/strict';
import test from 'node:test';
import {
  VEHICLE_ENRICHMENT_CANDIDATE_SQL,
  defensibleRegistration,
} from './remediation.mjs';

test('candidate query includes missing and invalid non-empty mileage', () => {
  assert.match(VEHICLE_ENRICHMENT_CANDIDATE_SQL, /NULLIF\(btrim\(c\.eva_mileage\), ''\) IS NULL/);
  assert.match(VEHICLE_ENRICHMENT_CANDIDATE_SQL, /NOT \(btrim\(c\.eva_mileage\) ~/);
  assert.match(VEHICLE_ENRICHMENT_CANDIDATE_SQL, /\^\[0-9\]\{1,20\}\$/);
});

test('registration guard accepts plausible registrations only', () => {
  assert.equal(defensibleRegistration(' AB12 CDE '), true);
  assert.equal(defensibleRegistration('A'), false);
  assert.equal(defensibleRegistration('AB12-CDE'), false);
});
