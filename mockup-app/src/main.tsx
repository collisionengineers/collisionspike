import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import PowerProvider from './PowerProvider';
import App from './App';
import { ceTheme } from './theme/ceTheme';
import { GLOBAL_TOASTER_ID } from './components';
import { configureDataAccess } from './data';
import { generatedServices } from './data/generated-services';
import './theme/theme.css';

/* Mounts <App/> inside the canonical Power Apps <PowerProvider> (SDK bootstrap)
   and the CE-themed FluentProvider, with a single global Toaster
   (id = GLOBAL_TOASTER_ID) that JsonView / ChaserPanel target.

   Order: PowerProvider warms the Power Apps host bridge so the data hooks read
   Dataverse against a ready SDK runtime. */

// Switch the data seam from the unconfigured default to the live Dataverse source
// by injecting the pac-generated services. This is a pure SELECTOR swap (no I/O):
// every screen/hook reads through `data`, so no screen edits are needed. The
// actual SDK bridge initialises lazily on the first data call, which PowerProvider
// has warmed via getContext() by then.
configureDataAccess(generatedServices);

/* ----------  Box (Archive) deploy-wiring (operator, post add-data-source)  ----------
   The BOX_* gate read + the Box affordance transports degrade honestly until the
   operator binds them. AFTER `pac code add-data-source` adds (a) the env-var
   Dataverse tables `environmentvariabledefinitions` + `environmentvariablevalues`
   and (b) the custom Box connector + its connection, wire them here:

     1. Add the two env-var services to `generatedServices` (generated-services.ts)
        so `getBoxGates()` reads real values instead of returning all-false.
     2. Bind the live Box transports. copy/shared-link are DIRECT connector ops
        (no flow in the path), so each factory also needs (a) a case resolver that
        reads `cr1bd_boxfolderid` + the `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID` value,
        and (b) the gate read — the connector ops take the Box folder/template ids
        and a `shared_link` body, NOT a caseId, and return Box shapes
        (`{url}` / `{shared_link:{url}}`), so the caseId→ids resolution + the
        seam-status shaping happen in the transport. The Cases service feeds
        `makeDataverseFinalizeTransport(...)`. Then:

        import { configureBoxTransports, getDataAccess } from './data';
        import {
          makeConnectorCopyFileRequestTransport,
          makeConnectorGetSharedLinkTransport,
          makeDataverseFinalizeTransport,
          type BoxCaseResolver,
        } from './data/box-connector-transport';

        const readGates = () => getDataAccess().getBoxGates();
        const boxResolver: BoxCaseResolver = {
          // Read the case's stamped Box folder id (empty until box-folder-create runs).
          folderId: async (caseId) =>
            (await Cr1bd_casesService.get(caseId))?.data?.cr1bd_boxfolderid ?? undefined,
          // The operator-set File-Request TEMPLATE id. NOTE: getBoxGates() only
          // exposes the DERIVED boolean `fileRequestTemplateConfigured`, NOT the
          // id string itself — so read the raw `cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID`
          // value from the generated env-var Dataverse service, e.g.:
          //   templateId: async () =>
          //     (await EnvironmentVariableValuesService.getAll({
          //       filter: "schemaname eq 'cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID'",
          //     }))?.data?.[0]?.value ?? undefined,
          // TODO read cr1bd_BOX_FILE_REQUEST_TEMPLATE_ID from the generated env-var Dataverse service.
          templateId: async () => undefined,
        };
        configureBoxTransports({
          copyFileRequest: makeConnectorCopyFileRequestTransport(BoxRestService, boxResolver, readGates),
          getSharedLink: makeConnectorGetSharedLinkTransport(BoxRestService, boxResolver, readGates),
          requestFinalize: makeDataverseFinalizeTransport(Cr1bd_casesService, {
            // The submit-signal trio (ADR-0012 / 00-BUILD-PLAN): the flag the
            // Dataverse-triggered finalize-eva-box watches, the REQUESTED hash
            // (distinct from the cr1bd_finalizedpayloadhash latch the flow stamps
            // LAST), and the staged byte-identical 12-field EVA JSON the flow
            // reads off the row (a row trigger has no HTTP body).
            submitRequestedColumn: 'cr1bd_submitrequested',
            payloadHashColumn: 'cr1bd_submitpayloadhash',
            evaPayloadColumn: 'cr1bd_evapayload12',
          }),
        });

   Until then every Box transport stays `not_connected` and the UI hides/greys the
   affordances per the gates — no fabricated links, no broken iframe (embed stays
   off; "Open in Archive" is a link, never a frame). */

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <PowerProvider>
      <FluentProvider theme={ceTheme} style={{ height: '100%' }}>
        <App />
        <Toaster toasterId={GLOBAL_TOASTER_ID} position="bottom-end" />
      </FluentProvider>
    </PowerProvider>
  </StrictMode>,
);
