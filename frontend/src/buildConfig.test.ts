// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

describe('production build contract', () => {
  test('uses an ESM-native config path and emits a manifest for boundary verification', () => {
    const config = source('../vite.config.ts')
    expect(config).not.toContain('__dirname')
    expect(config).toMatch(/fileURLToPath\(new URL\('\.', import\.meta\.url\)\)/)
    expect(config).toMatch(/manifest:\s*true/)
  })

  test('runs the build-boundary verifier after Vite emits assets', () => {
    const pkg = JSON.parse(source('../package.json')) as { scripts: Record<string, string> }
    expect(pkg.scripts.build).toMatch(/vite build\s*&&\s*node scripts\/verify-build-boundaries\.mjs/)
  })

  test('builds E2E assets outside deployable web and verifies that exact directory', () => {
    const pkg = JSON.parse(source('../package.json')) as { scripts: Record<string, string> }
    const playwright = source('../playwright.config.ts')
    const gitignore = source('../../.gitignore')

    expect(pkg.scripts.build).toContain('verify-build-boundaries.mjs ../web')
    expect(pkg.scripts['build:e2e']).toContain('MINDVERSE_BUILD_DIR=../.e2e-web')
    expect(pkg.scripts['build:e2e']).toContain('verify-build-boundaries.mjs ../.e2e-web')
    expect(playwright).toMatch(/MINDVERSE_WEB_DIR:\s*resolve\(repositoryRoot, '\.e2e-web'\)/)
    expect(gitignore).toMatch(/^\.e2e-web\/$/m)
  })

  test('keeps Three.js in one coherent vendor group without maxSize splitting', () => {
    const config = source('../vite.config.ts')
    const threeGroup = config.slice(config.indexOf("name: 'three'"), config.indexOf("name: 'postprocessing'"))
    expect(threeGroup).not.toMatch(/maxSize/)
    expect(threeGroup).toMatch(/node_modules.*three/)
  })
})
