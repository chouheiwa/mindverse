import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  testDir: './e2e',
  outputDir: resolve(tmpdir(), `mindverse-e2e-results-${process.pid}`),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: 'http://127.0.0.1:14176',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'go run ./cmd/server',
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: '14176',
      MINDVERSE_SOURCE: 'mock',
      MINDVERSE_WEB_DIR: resolve(repositoryRoot, 'web'),
      MINDVERSE_SNAPSHOT_DIR: resolve(tmpdir(), `mindverse-e2e-snapshots-${process.pid}`),
    },
    url: 'http://127.0.0.1:14176/',
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
