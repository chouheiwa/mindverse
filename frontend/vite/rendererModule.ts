import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'

export type RendererKind = 'three' | 'babylon'

const PUBLIC_ID = 'virtual:mindverse-renderer'
const RESOLVED_ID = `\0${PUBLIC_ID}`

function selectedRenderer(renderer: RendererKind): { readonly path: string; readonly exportName: string } {
  return renderer === 'three'
    ? {
        path: fileURLToPath(new URL('../src/starmap/Renderer.ts', import.meta.url)),
        exportName: 'Renderer',
      }
    : {
        path: fileURLToPath(new URL('../src/starmap/babylon/BabylonRenderer.ts', import.meta.url)),
        exportName: 'BabylonRenderer',
      }
}

export function rendererVirtualModule(value: string | undefined): Plugin {
  if (value !== 'three' && value !== 'babylon') {
    throw new Error(`VITE_RENDERER must be "three" or "babylon"; received ${JSON.stringify(value)}`)
  }
  const renderer = selectedRenderer(value)
  const source = [
    `import { ${renderer.exportName} as SelectedRenderer } from ${JSON.stringify(renderer.path)}`,
    'export function createRenderer(canvas, labels, index, reducedMotion, callbacks) {',
    '  return new SelectedRenderer(canvas, labels, index, reducedMotion, callbacks)',
    '}',
  ].join('\n')

  return {
    name: `mindverse-renderer-${value}`,
    resolveId(id) {
      return id === PUBLIC_ID ? RESOLVED_ID : null
    },
    load(id) {
      return id === RESOLVED_ID ? source : null
    },
  }
}
