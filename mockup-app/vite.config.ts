import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone M1 prototype — no Power Platform, no network calls, mock data only.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: false },
});
