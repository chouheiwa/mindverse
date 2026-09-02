// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { rendererVirtualModule } from './rendererModule'

const VIRTUAL_ID = 'virtual:mindverse-renderer'
const RESOLVED_ID = '\0virtual:mindverse-renderer'

describe('renderer virtual module', () => {
  test('emits a static Three implementation import and no Babylon path', () => {
    const plugin = rendererVirtualModule('three')
    expect(plugin.resolveId?.call({} as never, VIRTUAL_ID, undefined, {} as never)).toBe(RESOLVED_ID)
    const source = plugin.load?.call({} as never, RESOLVED_ID, {} as never) as string

    expect(source).toContain('src/starmap/Renderer.ts')
    expect(source).not.toContain('BabylonRenderer')
  })

  test('emits a static Babylon implementation import and no Three renderer path', () => {
    const plugin = rendererVirtualModule('babylon')
    const source = plugin.load?.call({} as never, RESOLVED_ID, {} as never) as string

    expect(source).toContain('src/starmap/babylon/BabylonRenderer.ts')
    expect(source).not.toMatch(/src\/starmap\/Renderer\.ts/)
  })

  test('rejects an unknown renderer at config load', () => {
    expect(() => rendererVirtualModule('webgpu')).toThrow(/VITE_RENDERER.*three.*babylon/i)
  })

  test('ignores unrelated module IDs', () => {
    const plugin = rendererVirtualModule('three')
    expect(plugin.resolveId?.call({} as never, 'virtual:other', undefined, {} as never)).toBeNull()
    expect(plugin.load?.call({} as never, '\0virtual:other', {} as never)).toBeNull()
  })
})
