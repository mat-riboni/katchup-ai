import { defineConfig, devices } from '@playwright/test';

// End-to-end tests for the Lesson Companion frontend. The backend and the Claude API
// are mocked at the network layer inside the tests; no key or server is needed.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5174',
    trace: 'retain-on-failure',
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } }],
  webServer: {
    command: 'node scripts/serve-web.mjs',
    url: 'http://localhost:5174',
    env: { WEB_PORT: '5174' },
    reuseExistingServer: false,
  },
});
