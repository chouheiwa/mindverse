// @vitest-environment node
import { afterEach, expect, test } from 'vitest'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { assertSafeBuildOutput } from './buildOutputSafety'

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true })
})

test('accepts a missing direct child only when its existing project parent is real', () => {
  const root = mkdtempSync(join(tmpdir(), 'mindverse-safe-root-'))
  temporaryRoots.push(root)
  expect(() => assertSafeBuildOutput(root, join(root, '.e2e-web'), '.e2e-web')).not.toThrow()
})

test('rejects a symlinked project-root parent before a missing output can be created', () => {
  const container = mkdtempSync(join(tmpdir(), 'mindverse-linked-root-'))
  temporaryRoots.push(container)
  const realRoot = join(container, 'real-project')
  const linkedRoot = join(container, 'linked-project')
  mkdirSync(realRoot)
  symlinkSync(realRoot, linkedRoot, 'dir')

  expect(() => assertSafeBuildOutput(
    linkedRoot,
    join(linkedRoot, '.e2e-web'),
    '.e2e-web',
  )).toThrow(/project root.*symlink/i)
})

test('rejects a dangling symlink instead of treating it as a missing output', () => {
  const root = mkdtempSync(join(tmpdir(), 'mindverse-dangling-output-'))
  temporaryRoots.push(root)
  const output = join(root, '.e2e-web')
  symlinkSync(join(root, 'missing-victim'), output, 'dir')

  expect(() => assertSafeBuildOutput(root, output, '.e2e-web')).toThrow(/output directory.*symlink/i)
})
