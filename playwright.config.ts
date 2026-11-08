import { defineConfig, devices } from '@playwright/test';
import { APP, TELEGRAM_STANDIN_PORT } from './tests/e2e/ports';

/**
 * End-to-end tests against the local Supabase stack (npm run local:start) and a dev server on port 3210.
 * Run with `npm run test:e2e`. The tests start their own dev server, so stop `npm run dev:local` first.
 * Every test signs up a fresh account, so they never touch each other's data or yours.
 */
export default defineConfig({
  testDir: './tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  // One at a time: the tests share one dev server and the Telegram stand-in uses a fixed port.
  workers: 1,
  fullyParallel: false,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  outputDir: './test-results',
  use: {
    baseURL: APP,
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 1000 },
    acceptDownloads: true,
    screenshot: 'only-on-failure',
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev:local',
    url: APP,
    reuseExistingServer: false,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      // The bot talks to a pretend Telegram run by the tests, never the real one.
      TELEGRAM_API_BASE: `http://127.0.0.1:${TELEGRAM_STANDIN_PORT}`,
      TELEGRAM_BOT_TOKEN: 'e2e-bot-token',
      TELEGRAM_WEBHOOK_SECRET: 'e2e-webhook-secret',
      // Never read receipts with the real Claude API from tests.
      ANTHROPIC_API_KEY: '',
    },
  },
});
