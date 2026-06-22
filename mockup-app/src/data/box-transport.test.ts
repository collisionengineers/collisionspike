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
import {
  makeConnectorCopyFileRequestTransport,
  makeConnectorGetSharedLinkTransport,
  makeDataverseFinalizeTransport,
  type CopyFileRequestOp,
  type GetFolderSharedLinkOp,
  type BoxCaseResolver,
  type BoxGatesReader,
  type CaseSubmitSignalWriter,
} from './box-connector-transport';
import { BOX_GATES_ALL_FALSE } from './types';

/* The Box transports must degrade HONESTLY: a not_connected / folder_not_ready /
   gated_off result never yields a usable link, and the default (unbound) state is
   always not_connected. These tests pin that contract without any SDK/network. */

afterEach(() => resetBoxTransports());

describe('default transports degrade to not_connected', () => {
  it('copy/shared-link/finalize all default to not_connected', async () => {
    expect((await notConnectedCopyFileRequestTransport('c1')).status).toBe('not_connected');
    expect((await notConnectedGetSharedLinkTransport('c1')).status).toBe('not_connected');
    expect((await notConnectedRequestFinalizeTransport({ caseId: 'c1', payloadHash: 'h', evaPayload12: '{}' })).status).toBe('not_connected');
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
    expect((await requestFinalize({ caseId: '', payloadHash: 'h', evaPayload12: '{}' })).status).toBe('error');
  });

  it('the default (no transport passed) is not_connected, not a throw', async () => {
    const r = await getSharedLink('case-1');
    expect(r.status).toBe('not_connected');
  });
});

describe('connector copy-File-Request transport maps outcomes honestly', () => {
  /* The op matches box-connector.json: CopyFileRequest({ fileRequestId, body })
     -> { url, id, status } (a SINGLE object arg, per the pac-generated service
     precedent). The transport resolves caseId -> {folderId, templateId} (injected)
     and derives the seam status (no flow in the path). */
  const READY_GATES: BoxGatesReader = async () => ({
    ...BOX_GATES_ALL_FALSE,
    fileRequestEnabled: true,
    fileRequestTemplateConfigured: true,
  });
  const resolverOf = (folderId?: string, templateId: string | undefined = 'tmpl-1'): BoxCaseResolver => ({
    folderId: async () => folderId,
    templateId: async () => templateId,
  });
  const opOf = (
    impl: (req: {
      fileRequestId: string;
      body: { folder: { id: string; type: 'folder' }; status?: string };
    }) => Promise<Awaited<ReturnType<CopyFileRequestOp['CopyFileRequest']>>>,
  ): CopyFileRequestOp => ({ CopyFileRequest: impl });

  it('maps a usable url to ok and passes the resolved template + folder ids to the op', async () => {
    const seen: Array<{ fileRequestId: string; folderId: string }> = [];
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async (req) => {
        seen.push({ fileRequestId: req.fileRequestId, folderId: req.body.folder.id });
        return { success: true, data: { url: 'https://app.box.com/f/x', id: 'fr1', status: 'active' } };
      }),
      resolverOf('folder-99', 'tmpl-7'),
      READY_GATES,
    );
    const r = await t('c1');
    expect(r.status).toBe('ok');
    expect(r.data?.fileRequestUrl).toBe('https://app.box.com/f/x');
    // The op got the TEMPLATE id as the path param and the case folder in the body.
    expect(seen).toEqual([{ fileRequestId: 'tmpl-7', folderId: 'folder-99' }]);
  });

  it('returns gated_off (no Box call) when the gate is off', async () => {
    let called = false;
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async () => {
        called = true;
        return { success: true, data: { url: 'x' } };
      }),
      resolverOf('folder-1'),
      async () => ({ ...BOX_GATES_ALL_FALSE }), // all false
    );
    const r = await t('c1');
    expect(r.status).toBe('gated_off');
    expect(r.data).toBeUndefined();
    expect(called).toBe(false);
  });

  it('maps folder_not_ready WITHOUT a link or a Box call when no folder is stamped', async () => {
    let called = false;
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async () => {
        called = true;
        return { success: true, data: { url: 'x' } };
      }),
      resolverOf(undefined), // cr1bd_boxfolderid null
      READY_GATES,
    );
    const r = await t('c1');
    expect(r.status).toBe('folder_not_ready');
    expect(r.data).toBeUndefined();
    expect(called).toBe(false); // never POST a null folder.id
  });

  it('treats a success with NO url as an error (never a fake link)', async () => {
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async () => ({ success: true, data: { id: 'fr1', status: 'active' } })),
      resolverOf('folder-1'),
      READY_GATES,
    );
    const r = await t('c1');
    expect(r.status).toBe('error');
    expect(r.data).toBeUndefined();
  });

  it('maps a connector failure to error with the message', async () => {
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async () => ({ success: false, error: { message: 'boom' } })),
      resolverOf('folder-1'),
      READY_GATES,
    );
    const r = await t('c1');
    expect(r.status).toBe('error');
    expect(r.message).toBe('boom');
  });

  it('catches a thrown connector call as error', async () => {
    const t = makeConnectorCopyFileRequestTransport(
      opOf(async () => {
        throw new Error('network down');
      }),
      resolverOf('folder-1'),
      READY_GATES,
    );
    const r = await t('c1');
    expect(r.status).toBe('error');
    expect(r.message).toBe('network down');
  });
});

describe('connector shared-link transport surfaces only a folder link (no embed)', () => {
  /* The op matches box-connector.json: GetFolderSharedLink({ folderId, body })
     -> { shared_link: { url } } (a SINGLE object arg, per the pac-generated service
     precedent). The transport resolves caseId -> folderId (injected) and gates on
     apiEnabled. */
  const API_ON: BoxGatesReader = async () => ({ ...BOX_GATES_ALL_FALSE, apiEnabled: true });
  const resolverOf = (folderId?: string): BoxCaseResolver => ({
    folderId: async () => folderId,
    templateId: async () => 'tmpl-1',
  });
  const opOf = (
    impl: (req: {
      folderId: string;
      body: { shared_link: { access: string } };
    }) => Promise<Awaited<ReturnType<GetFolderSharedLinkOp['GetFolderSharedLink']>>>,
  ): GetFolderSharedLinkOp => ({ GetFolderSharedLink: impl });

  it('maps shared_link.url to a folderUrl ok and exposes no embed url', async () => {
    const seen: string[] = [];
    const t = makeConnectorGetSharedLinkTransport(
      opOf(async (req) => {
        seen.push(req.folderId);
        return { success: true, data: { shared_link: { url: 'https://app.box.com/folder/1' } } };
      }),
      resolverOf('folder-1'),
      API_ON,
    );
    const r = await t('c1');
    expect(r.status).toBe('ok');
    expect(r.data).toEqual({ folderUrl: 'https://app.box.com/folder/1' });
    // Guard the operator decision: link only, never an embed field.
    expect(r.data && 'embedUrl' in r.data).toBe(false);
    expect(seen).toEqual(['folder-1']);
  });

  it('returns gated_off (no Box call) when apiEnabled is off', async () => {
    let called = false;
    const t = makeConnectorGetSharedLinkTransport(
      opOf(async () => {
        called = true;
        return { success: true, data: { shared_link: { url: 'x' } } };
      }),
      resolverOf('folder-1'),
      async () => ({ ...BOX_GATES_ALL_FALSE }),
    );
    expect((await t('c1')).status).toBe('gated_off');
    expect(called).toBe(false);
  });

  it('maps folder_not_ready without a link when no folder is stamped', async () => {
    const t = makeConnectorGetSharedLinkTransport(
      opOf(async () => ({ success: true, data: { shared_link: { url: 'x' } } })),
      resolverOf(undefined),
      API_ON,
    );
    const r = await t('c1');
    expect(r.status).toBe('folder_not_ready');
    expect(r.data).toBeUndefined();
  });
});

describe('dataverse finalize transport writes the submit-signal, never invents a terminal', () => {
  it('PATCHes the submit-requested + payload-hash columns and returns accepted', async () => {
    const writes: Array<{ id: string; changes: Record<string, unknown> }> = [];
    const cases: CaseSubmitSignalWriter = {
      update: async (id, changes) => {
        writes.push({ id, changes });
        return { data: undefined };
      },
    };
    const t = makeDataverseFinalizeTransport(cases, {
      submitRequestedColumn: 'cr1bd_submitrequested',
      payloadHashColumn: 'cr1bd_submitpayloadhash',
      evaPayloadColumn: 'cr1bd_evapayload12',
    });
    const r = await t({ caseId: 'case-7', payloadHash: 'HASH', evaPayload12: '{"v":1}' });
    expect(r.status).toBe('ok');
    expect(r.data?.accepted).toBe(true);
    // No status field invented — the flow stamps the terminal, not the app.
    expect(r.data?.status).toBeUndefined();
    // The submit-signal TRIO: the flag the Dataverse-triggered flow watches, the
    // REQUESTED hash (distinct from the finalized latch the flow stamps LAST), and
    // the staged byte-identical payload the row trigger reads off the row.
    expect(writes).toEqual([
      {
        id: 'case-7',
        changes: {
          cr1bd_submitrequested: true,
          cr1bd_submitpayloadhash: 'HASH',
          cr1bd_evapayload12: '{"v":1}',
        },
      },
    ]);
  });

  it('maps a write failure to error', async () => {
    const cases: CaseSubmitSignalWriter = {
      update: async () => {
        throw new Error('write denied');
      },
    };
    const t = makeDataverseFinalizeTransport(cases, {
      submitRequestedColumn: 'cr1bd_submitrequested',
      payloadHashColumn: 'cr1bd_submitpayloadhash',
      evaPayloadColumn: 'cr1bd_evapayload12',
    });
    const r = await t({ caseId: 'c1', payloadHash: 'h', evaPayload12: '{}' });
    expect(r.status).toBe('error');
    expect(r.message).toBe('write denied');
  });
});

describe('transport registry — configure/reset', () => {
  it('the active transports are not_connected until configured', async () => {
    expect((await activeCopyFileRequestTransport('c1')).status).toBe('not_connected');
    expect((await activeGetSharedLinkTransport('c1')).status).toBe('not_connected');
    expect((await activeRequestFinalizeTransport({ caseId: 'c1', payloadHash: 'h', evaPayload12: '{}' })).status).toBe('not_connected');
  });

  it('configureBoxTransports swaps in a live transport; reset restores not_connected', async () => {
    configureBoxTransports({
      copyFileRequest: async () => ({ status: 'ok', data: { fileRequestUrl: 'https://app.box.com/f/live' } }),
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
