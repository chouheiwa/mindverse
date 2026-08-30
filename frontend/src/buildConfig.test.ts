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
})
