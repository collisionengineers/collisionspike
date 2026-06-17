import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FluentProvider, Toaster } from '@fluentui/react-components';
import App from './App';
import { ceTheme } from './theme/ceTheme';
import { GLOBAL_TOASTER_ID } from './components';
import './theme/theme.css';

/* Mounts <App/> inside the CE-themed FluentProvider with a single global
   Toaster (id = GLOBAL_TOASTER_ID) that JsonView / ChaserPanel target. */

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
