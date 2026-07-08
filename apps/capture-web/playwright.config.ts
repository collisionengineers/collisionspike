import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  webServer: {
    command: 'npm run dev --workspace @collisioncapture/mobile-web -- --port 4174',
    url: 'http://127.0.0.1:4174',
    reuseExistingServer: !process.env.CI
  },
  use: {
    baseURL: 'http://127.0.0.1:4174'
  },
  projects: [
    {
      name: 'Mobile Chrome',
      use: { ...devices['Pixel 7'] }
    },
    {
      name: 'Mobile Safari',
      use: { ...devices['iPhone 15'] }
    }
  ]
});

