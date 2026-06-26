import { describe, it, expect, afterEach } from 'vitest';
import {
  copyFileRequest,
  getSharedLink,
  requestFinalize,
  notConnectedCopyFileRequestTransport,
  notConnectedGetSharedLinkTransport,
  notConnectedRequestFinalizeTransport,
  configureBoxTransports,
  resetBoxTransports,
  activeCopyFileRequestTransport,
  activeGetSharedLinkTransport,
  activeRequestFinalizeTransport,
  type CopyFileRequestTransport,
} from './box-transport';

/* The Box transports must degrade HONESTLY: a not_connected / folder_not_ready /
   gated_off result never yields a usable link, and the default (unbound) state is
   always not_connected. These tests pin that contract without any network.

   Note: the connector-specific transport tests (makeConnectorCopyFileRequestTransport,
   makeConnectorGetSharedLinkTransport, makeDataverseFinalizeTransport) were removed
   in the Power Platform → Azure PaaS migration (plan 30). The connector module
   (box-connector-transport.ts) was replaced by box-rest-transport.ts; the REST
   transport contract is exercised by integration tests against the live API. */

afterEach(() => resetBoxTransports());

describe('default transports degrade to not_connected', () => {
  it('copy/shared-link/finalize all default to not_connected', async () => {
    expect((await notConnectedCopyFileRequestTransport('c1')).status).toBe('not_connected');
    expect((await notConnectedGetSharedLinkTransport('c1')).status).toBe('not_connected');
    expect(
      (
        await notConnectedRequestFinalizeTransport({
          caseId: 'c1',
          payloadHash: 'h',
          evaPayload12: '{}',
        })
      ).status,
    ).toBe('not_connected');
  });

  it('a not_connected result carries no data (no fabricated link)', async () => {
    const r = await notConnectedCopyFileRequestTransport('c1');
    expect(r.data).toBeUndefined();
    expect(r.message).toBeTruthy();
  });
});

describe('public functions guard trivial input then delegate', () => {
  it('copyFileRequest rejects an empty caseId before calling the transport', async () => {
    let called = false;
    const spy: CopyFileRequestTransport = async () => {
      called = true;
      return { status: 'ok', data: { fileRequestUrl: 'x' } };
    };
    const r = await copyFileRequest('   ', spy);
    expect(r.status).toBe('error');
    expect(called).toBe(false);
  });

  it('copyFileRequest delegates a real caseId (trimmed) to the transport', async () => {
    const seen: string[] = [];
    const spy: CopyFileRequestTransport = async (id) => {
      seen.push(id);
      return { status: 'ok', data: { fileRequestUrl: 'https://app.box.com/f/abc' } };
    };
    const r = await copyFileRequest('  case-9  ', spy);
    expect(seen).toEqual(['case-9']);
    expect(r.status).toBe('ok');
    expect(r.data?.fileRequestUrl).toBe('https://app.box.com/f/abc');
  });

  it('getSharedLink / requestFinalize guard empty input too', async () => {
    expect((await getSharedLink('')).status).toBe('error');
    expect(
      (await requestFinalize({ caseId: '', payloadHash: 'h', evaPayload12: '{}' })).status,
    ).toBe('error');
  });

  it('the default (no transport passed) is not_connected, not a throw', async () => {
    const r = await getSharedLink('case-1');
    expect(r.status).toBe('not_connected');
  });
});

describe('transport registry — configure/reset', () => {
  it('the active transports are not_connected until configured', async () => {
    expect((await activeCopyFileRequestTransport('c1')).status).toBe('not_connected');
    expect((await activeGetSharedLinkTransport('c1')).status).toBe('not_connected');
    expect(
      (
        await activeRequestFinalizeTransport({
          caseId: 'c1',
          payloadHash: 'h',
          evaPayload12: '{}',
        })
      ).status,
    ).toBe('not_connected');
  });

  it('configureBoxTransports swaps in a live transport; reset restores not_connected', async () => {
    configureBoxTransports({
      copyFileRequest: async () => ({
        status: 'ok',
        data: { fileRequestUrl: 'https://app.box.com/f/live' },
      }),
    });
    const r = await activeCopyFileRequestTransport('c1');
    expect(r.status).toBe('ok');
    expect(r.data?.fileRequestUrl).toBe('https://app.box.com/f/live');
    // Untouched transports stay not_connected.
    expect((await activeGetSharedLinkTransport('c1')).status).toBe('not_connected');

    resetBoxTransports();
    expect((await activeCopyFileRequestTransport('c1')).status).toBe('not_connected');
  });
});
