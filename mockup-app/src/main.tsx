import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import App from './App';
import { ceTheme } from './theme/ceTheme';
import { GLOBAL_TOASTER_ID } from './components';
import { configureDataAccess } from './data';
import { generatedServices } from './data/generated-services';
import './theme/theme.css';

/* Mounts <App/> inside the CE-themed FluentProvider with a single global
   Toaster (id = GLOBAL_TOASTER_ID) that JsonView / ChaserPanel target. */

// Switch the data seam from the mock source to the live Dataverse source by
// injecting the pac-generated services. One call, at startup, before render —
// every screen/hook reads through `data`, so no screen edits are needed.
configureDataAccess(generatedServices);

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element #root not found');

createRoot(rootEl).render(
  <StrictMode>
    <FluentProvider theme={ceTheme} style={{ height: '100%' }}>
      <App />
      <Toaster toasterId={GLOBAL_TOASTER_ID} position="bottom-end" />
    </FluentProvider>
  </StrictMode>,
);
