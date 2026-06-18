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
