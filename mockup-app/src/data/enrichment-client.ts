/* ============================================================
   Collision Engineers — vehicle enrichment + address-normalise client (GATED).

   Mirrors the parser-client seam: a pure transport contract the screens call,
   with a default "not connected" transport. Real enrichment runs through the
   DVSA/DVLA enrichment Function (cespkenrich) and the postcodes.io address-match
   Function (cespkaddr) via their custom connectors — both operator-gated
   (ENRICHMENT_ENABLED + a bound connection). Until the operator binds those
   connections this returns `not_connected`, which the UI shows honestly rather
   than fabricating values. No raw fetch() — Code App CSP forbids it; the live
   transport is a connector call injected the same way as the parser's.

   VERIFIED (2026-06-19 capability review): DVSA/DVLA return vehicle make/model
   and a mileage estimate, but NOT VAT status — there is no VAT route. VAT stays a
   manual field (default TBA). See docs/reviews/190626 checklist task 1b.
   ============================================================ */

export interface VehicleEnrichment {
  make?: string;
  model?: string;
  /** Estimated current mileage (DVSA MOT projection) when the doc lacks one. */
  mileage?: string;
  mileageUnit?: 'Miles' | 'Km';
}

export interface NormalisedAddress {
  /** Up to 6 newline-separated lines (EVA inspection-address format). */
  lines: string;
  postcode?: string;
}

export type EnrichStatus = 'ok' | 'not_connected' | 'error';

export interface EnrichResult<T> {
  status: EnrichStatus;
  data?: T;
  /** Operator-facing reason when not ok. */
  message?: string;
}

export type VehicleEnrichTransport = (vrm: string) => Promise<EnrichResult<VehicleEnrichment>>;
export type AddressNormaliseTransport = (text: string) => Promise<EnrichResult<NormalisedAddress>>;

const GATED_VEHICLE_MESSAGE =
  'Vehicle lookup (DVSA/DVLA) is not connected — an operator must bind the enrichment connector and enable ENRICHMENT_ENABLED. (DVSA/DVLA return make, model and a mileage estimate; VAT is not available and stays manual.)';
const GATED_ADDRESS_MESSAGE =
  'Address normalisation (postcodes.io) is not connected — an operator must bind the address-match connector.';

/** Default transports — honest "not connected" until the connectors are bound. */
export const notConnectedVehicleTransport: VehicleEnrichTransport = async () => ({
  status: 'not_connected',
  message: GATED_VEHICLE_MESSAGE,
});
export const notConnectedAddressTransport: AddressNormaliseTransport = async () => ({
  status: 'not_connected',
  message: GATED_ADDRESS_MESSAGE,
});

/** Look up vehicle make/model/mileage for a VRM (gated; never returns VAT). */
export async function enrichVehicle(
  vrm: string,
  transport: VehicleEnrichTransport = notConnectedVehicleTransport,
): Promise<EnrichResult<VehicleEnrichment>> {
  const v = vrm.trim();
  if (!v) return { status: 'error', message: 'Enter a VRM first.' };
  return transport(v);
}

/** Normalise a free-text inspection address to the 6-line EVA format (gated). */
export async function normaliseAddress(
  text: string,
  transport: AddressNormaliseTransport = notConnectedAddressTransport,
): Promise<EnrichResult<NormalisedAddress>> {
  const t = text.trim();
  if (!t) return { status: 'error', message: 'Enter an address first.' };
  return transport(t);
}
