/* ============================================================
   Collision Engineers — address-normalise client (GATED).

   Mirrors the parser-client seam: a pure transport contract the screens call,
   with a default "not connected" transport. Real vehicle enrichment runs through
   the DVSA/DVLA enrichment Function (cespkenrich) via its custom connector —
   operator-gated (ENRICHMENT_ENABLED + a bound connection). Address normalisation
   uses postcodes.io. Until the operator binds those connections this returns
   `not_connected`, which the UI shows honestly rather than fabricating values.
   No raw fetch() — Code App CSP forbids it; the live transport is a connector
   call injected the same way as the parser's.

   VERIFIED (2026-06-19 capability review): DVSA/DVLA return vehicle make/model
   and a mileage estimate, but NOT VAT status — there is no VAT route. VAT stays a
   manual field (default TBA). See docs/reviews/190626 checklist task 1b.
   ============================================================ */

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

export type AddressNormaliseTransport = (text: string) => Promise<EnrichResult<NormalisedAddress>>;

const GATED_ADDRESS_MESSAGE = 'Address standardisation isn’t available yet.';

/** Default transports — honest "not connected" until the connectors are bound. */
export const notConnectedAddressTransport: AddressNormaliseTransport = async () => ({
  status: 'not_connected',
  message: GATED_ADDRESS_MESSAGE,
});

/** Normalise a free-text inspection address to the 6-line EVA format (gated). */
export async function normaliseAddress(
  text: string,
  transport: AddressNormaliseTransport = notConnectedAddressTransport,
): Promise<EnrichResult<NormalisedAddress>> {
  const t = text.trim();
  if (!t) return { status: 'error', message: 'Enter an address first.' };
  return transport(t);
}
