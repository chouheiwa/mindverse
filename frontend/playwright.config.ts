import { defineConfig, devices } from '@playwright/test'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = fileURLToPath(new URL('..', import.meta.url))
const e2ePort = process.env.E2E_PORT ?? '14176'
const e2eBaseURL = `http://127.0.0.1:${e2ePort}`
const rendererKind = process.env.VITE_RENDERER === 'babylon' ? 'babylon' : 'three'

export default defineConfig({
  testDir: './e2e',
  outputDir: resolve(tmpdir(), `mindverse-e2e-results-${process.pid}`),
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: e2eBaseURL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'swiftshader-functional',
      testMatch: rendererKind === 'babylon' ? /babylon-gate\.spec\.ts/ : /production-render\.spec\.ts/,
      grepInvert: /@metal-performance/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      // Runs against whichever renderer the bundle was built with, so the same
      // scripted journey produces a comparable capture for Three and Babylon.
      name: 'visual-parity',
      testMatch: /(visual-parity|mode-bar)\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: process.platform === 'darwin'
            ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
            : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
    {
      name: 'metal-performance',
      testMatch: /render-baseline\.spec\.ts/,
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: process.platform === 'darwin'
            ? ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal']
            : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
        },
      },
    },
  ],
  webServer: {
    command: 'go run ./cmd/server',
    cwd: repositoryRoot,
    env: {
      ...process.env,
      PORT: e2ePort,
      MINDVERSE_SOURCE: 'mock',
      MINDVERSE_WEB_DIR: resolve(repositoryRoot, '.e2e-web'),
      MINDVERSE_SNAPSHOT_DIR: resolve(tmpdir(), `mindverse-e2e-snapshots-${process.pid}`),
    },
    url: `${e2eBaseURL}/`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
})
