import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { CaptureApp } from './app/CaptureApp';
import './tokens.css';
import './styles.css';

createRoot(document.getElementById('root') as HTMLElement).render(
  <StrictMode>
    <CaptureApp />
  </StrictMode>
);

// Register the offline-shell service worker in production only. A failed
// registration must never affect capture, so it is fully guarded.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/service-worker.js').catch(() => undefined);
  });
}
