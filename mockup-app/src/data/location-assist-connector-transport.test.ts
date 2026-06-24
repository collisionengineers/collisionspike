import { describe, it, expect, afterEach } from 'vitest';
import {
  activeLocationAssistTransport,
  configureLocationAssistTransport,
  makeConnectorLocationAssistTransport,
  notConnectedLocationAssistTransport,
  resetLocationAssistTransport,
  type SuggestLocationOp,
} from './location-assist-connector-transport';
import {
  LOCATION_ASSIST_CONTRACT_VERSION,
  type SuggestLocationRequest,
  type SuggestLocationResponse,
} from './location-assist-client';

/* The connector transport bridges the deploy-time-generated CE Location Assist
   service to the pure client's transport contract — same discipline as
   box-connector-transport.ts (structural injection, no SDK/generated import). These
   tests pin: the not-connected default (gated dark), the success bridge, and the
   honest failures (no fabricated response). */

const REQ: SuggestLocationRequest = {
  case_id: 'c1',
  photo_refs: [],
  contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
};

const RESP: SuggestLocationResponse = {
  candidates: [{ label: 'X', confidence: 0.6 }],
  noConfidentLocation: false,
  issues: [],
  contract_version: LOCATION_ASSIST_CONTRACT_VERSION,
};

/** A fake generated service satisfying SuggestLocationOp structurally. */
function fakeService(
  result: { success: boolean; data?: SuggestLocationResponse; error?: { message?: string } },
): SuggestLocationOp {
  return { SuggestLocation: async () => result };
}

afterEach(() => resetLocationAssistTransport());

describe('notConnectedLocationAssistTransport (the seam default — ships dark)', () => {
  it('throws a PLAIN-language "not switched on" error (no engineering terms)', async () => {
    await expect(notConnectedLocationAssistTransport(REQ)).rejects.toThrow(
      'Location suggestions aren’t switched on yet.',
    );
  });

  it('is the default active transport until configured', async () => {
    await expect(activeLocationAssistTransport(REQ)).rejects.toThrow(/switched on/);
  });
});

describe('makeConnectorLocationAssistTransport — success bridge', () => {
  it('returns the connector data on success', async () => {
    const t = makeConnectorLocationAssistTransport(fakeService({ success: true, data: RESP }));
    await expect(t(REQ)).resolves.toEqual(RESP);
  });

  it('throws on a connector failure (carrying the error message)', async () => {
    const t = makeConnectorLocationAssistTransport(
      fakeService({ success: false, error: { message: 'connection missing' } }),
    );
    await expect(t(REQ)).rejects.toThrow(/connection missing/);
  });

  it('throws on a success with no data (never fabricates an empty response)', async () => {
    const t = makeConnectorLocationAssistTransport(fakeService({ success: true }));
    await expect(t(REQ)).rejects.toThrow(/no data/);
  });
});

describe('configure/reset — startup wiring swap', () => {
  it('configureLocationAssistTransport swaps the active transport', async () => {
    configureLocationAssistTransport(makeConnectorLocationAssistTransport(fakeService({ success: true, data: RESP })));
    await expect(activeLocationAssistTransport(REQ)).resolves.toEqual(RESP);
    resetLocationAssistTransport();
    await expect(activeLocationAssistTransport(REQ)).rejects.toThrow(/switched on/);
  });
});
