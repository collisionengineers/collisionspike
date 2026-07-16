/* Address-standardisation transport contract. The default is honestly
   unavailable; callers may inject the authenticated implementation. */

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

/** Honest default until the authenticated transport is configured. */
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
