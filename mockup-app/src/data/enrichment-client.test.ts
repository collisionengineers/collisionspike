import { describe, it, expect } from 'vitest';
import {
  enrichVehicle,
  normaliseAddress,
  type VehicleEnrichTransport,
  type AddressNormaliseTransport,
} from './enrichment-client';

/* The gated default transports are unbound until the operator binds the
   ENRICHMENT_ENABLED connector, so the seam stays offline here. These mirror
   the plain-language messages the UI shows instead of fabricating values. */
const GATED_VEHICLE_MESSAGE = 'Vehicle lookup isn’t available yet.';
const GATED_ADDRESS_MESSAGE = 'Address standardisation isn’t available yet.';

describe('enrichVehicle', () => {
  it('rejects a blank VRM before touching the transport', async () => {
    const r = await enrichVehicle('   ');
    expect(r.status).toBe('error');
  });
  it('returns not_connected with the gated message on the default transport', async () => {
    const r = await enrichVehicle('AB12CDE');
    expect(r.status).toBe('not_connected');
    expect(r.message).toBe(GATED_VEHICLE_MESSAGE);
  });
  it('passes a trimmed VRM through an injected transport (no network)', async () => {
    const transport: VehicleEnrichTransport = async (vrm) => {
      expect(vrm).toBe('AB12CDE');
      return { status: 'ok', data: { make: 'Ford', model: 'Focus' } };
    };
    const r = await enrichVehicle('  AB12CDE  ', transport);
    expect(r.status).toBe('ok');
    expect(r.data?.make).toBe('Ford');
  });
});

describe('normaliseAddress', () => {
  it('rejects blank text before touching the transport', async () => {
    const r = await normaliseAddress('  ');
    expect(r.status).toBe('error');
  });
  it('returns not_connected with the gated message on the default transport', async () => {
    const r = await normaliseAddress('12 Example Street, Leeds');
    expect(r.status).toBe('not_connected');
    expect(r.message).toBe(GATED_ADDRESS_MESSAGE);
  });
  it('passes trimmed text through an injected transport (no network)', async () => {
    const transport: AddressNormaliseTransport = async (text) => {
      expect(text).toBe('12 Example Street, Leeds');
      return { status: 'ok', data: { lines: '12 Example Street\nLeeds\n\n\n\nLS1 1AA', postcode: 'LS1 1AA' } };
    };
    const r = await normaliseAddress('  12 Example Street, Leeds  ', transport);
    expect(r.status).toBe('ok');
    expect(r.data?.postcode).toBe('LS1 1AA');
  });
});
