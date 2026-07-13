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
