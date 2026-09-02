// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'
import { universeRoute } from './shareRoute'

const source = (relative: string) => readFileSync(new URL(relative, import.meta.url), 'utf8')

describe('public/private universe module boundary', () => {
  test('routes a strict share path before loading either application', () => {
    expect(universeRoute('/s/public_1')).toEqual({ kind: 'share', id: 'public_1' })
    expect(universeRoute('/s/public_1/')).toEqual({ kind: 'private' })
    expect(universeRoute('/s/%70ublic_1')).toEqual({ kind: 'private' })
  })

  test('entry dynamically imports disjoint public and private roots', () => {
    const entry = source('./entry-universe.tsx')
    expect(entry).toMatch(/import\('\.\/ui\/SharedView'\)/)
    expect(entry).toMatch(/import\('\.\/ui\/Universe'\)/)
    expect(entry).not.toMatch(/^import .*\.\/ui\/(?:SharedView|Universe)/m)
    expect(source('./ui/Universe.tsx')).not.toMatch(/(?:import|from) ['"]\.\/SharedView['"]|<SharedView/)
    expect(source('./ui/SharedView.tsx')).not.toMatch(/Renderer|Panel|QuestionWorkspace|\.\/Universe/)
  })

  test('keeps the WebGL renderer out of the private shell until the canvas is ready', () => {
    const privateRoot = source('./ui/Universe.tsx')
    expect(privateRoot).toMatch(/import\('virtual:mindverse-renderer'\)/)
    expect(privateRoot).not.toMatch(/import\(['"]\.\.\/starmap\/(?:Renderer|babylon\/BabylonRenderer)['"]\)/)
    expect(privateRoot).not.toMatch(/^import\s+.*from\s+['"]\.\.\/starmap\/(?:Renderer|babylon\/BabylonRenderer)['"]/m)
  })
})
