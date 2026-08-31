// @vitest-environment node
import { afterEach, describe, expect, test } from 'vitest'
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const temporaryRoots = []

function temporaryFrontend() {
  const root = mkdtempSync(join(tmpdir(), 'mindverse-build-output-'))
  temporaryRoots.push(root)
  const frontend = join(root, 'frontend')
  cpSync(frontendRoot, frontend, {
    recursive: true,
    filter: (source) => !source.includes(`${frontendRoot}/node_modules`),
  })
  symlinkSync(join(frontendRoot, 'node_modules'), join(frontend, 'node_modules'), 'dir')
  return { root, frontend }
}

function runE2EBuild(frontend) {
  return spawnSync('npm', ['run', 'build:e2e'], {
    cwd: frontend,
    encoding: 'utf8',
    timeout: 30_000,
  })
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

describe('isolated E2E output safety', () => {
  test('rejects a symlinked output without deleting victim sentinels', () => {
    const { root, frontend } = temporaryFrontend()
    const victim = join(root, 'victim')
    mkdirSync(join(victim, 'assets'), { recursive: true })
    const rootSentinel = join(victim, 'root-sentinel.txt')
    const assetsSentinel = join(victim, 'assets', 'assets-sentinel.txt')
    writeFileSync(rootSentinel, 'root-safe')
    writeFileSync(assetsSentinel, 'assets-safe')
    symlinkSync(victim, join(root, '.e2e-web'), 'dir')

    const result = runE2EBuild(frontend)

    expect(result.status, `${result.stdout}\n${result.stderr}`).not.toBe(0)
    expect(readFileSync(rootSentinel, 'utf8')).toBe('root-safe')
    expect(readFileSync(assetsSentinel, 'utf8')).toBe('assets-safe')
  }, 40_000)

  test('rejects a regular file output and accepts a real directory', () => {
    const fileProject = temporaryFrontend()
    writeFileSync(join(fileProject.root, '.e2e-web'), 'not-a-directory')
    const rejected = runE2EBuild(fileProject.frontend)
    expect(rejected.status, `${rejected.stdout}\n${rejected.stderr}`).not.toBe(0)
    expect(readFileSync(join(fileProject.root, '.e2e-web'), 'utf8')).toBe('not-a-directory')

    const directoryProject = temporaryFrontend()
    mkdirSync(join(directoryProject.root, '.e2e-web'))
    const accepted = runE2EBuild(directoryProject.frontend)
    expect(accepted.status, `${accepted.stdout}\n${accepted.stderr}`).toBe(0)
    expect(existsSync(join(directoryProject.root, '.e2e-web', 'universe.html'))).toBe(true)
  }, 60_000)
})
