// @vitest-environment node
import { describe, expect, test } from 'vitest'
import { validateBuildBoundaries } from './verify-build-boundaries.mjs'

const validFixture = () => ({
  manifest: {
    '_theme.js': { file: 'assets/theme.js', name: 'theme' },
    '_three.js': { file: 'assets/three.js', name: 'three' },
    '_postprocessing.js': {
      file: 'assets/postprocessing.js',
      name: 'postprocessing',
      imports: ['_three.js'],
    },
    'src/ui/SharedView.tsx': {
      file: 'assets/SharedView.js',
      src: 'src/ui/SharedView.tsx',
      imports: ['_theme.js'],
    },
    'src/ui/Universe.tsx': {
      file: 'assets/Universe.js',
      src: 'src/ui/Universe.tsx',
      dynamicImports: ['src/starmap/Renderer.ts'],
    },
    'src/starmap/Renderer.ts': {
      file: 'assets/Renderer.js',
      src: 'src/starmap/Renderer.ts',
      imports: ['_three.js', '_postprocessing.js'],
    },
    'universe.html': {
      file: 'assets/universe.js',
      src: 'universe.html',
      isEntry: true,
      dynamicImports: ['src/ui/SharedView.tsx', 'src/ui/Universe.tsx'],
    },
  },
  chunks: [
    { file: 'assets/theme.js', moduleIds: ['/repo/frontend/src/theme.ts'] },
    { file: 'assets/three.js', moduleIds: ['/repo/frontend/node_modules/three/build/three.module.js'] },
    { file: 'assets/postprocessing.js', moduleIds: ['/repo/frontend/node_modules/postprocessing/build/index.js'] },
    { file: 'assets/SharedView.js', moduleIds: ['/repo/frontend/src/ui/SharedView.tsx'] },
    { file: 'assets/Universe.js', moduleIds: ['/repo/frontend/src/ui/Universe.tsx'] },
    { file: 'assets/Renderer.js', moduleIds: ['/repo/frontend/src/starmap/Renderer.ts'] },
    { file: 'assets/universe.js', moduleIds: ['/repo/frontend/src/universe.tsx'] },
  ],
  assetSizes: {
    'assets/theme.js': 100,
    'assets/three.js': 600_000,
    'assets/postprocessing.js': 100,
    'assets/SharedView.js': 100,
    'assets/Universe.js': 100,
    'assets/Renderer.js': 100,
    'assets/universe.js': 100,
  },
})

describe('build boundary verifier', () => {
  test('accepts the intended public/private topology and one coherent Three chunk', () => {
    expect(validateBuildBoundaries(validFixture())).toMatchObject({
      publicChunkCount: 2,
      threeChunkFile: 'assets/three.js',
    })
  })

  test('rejects a public SharedView dynamic import of private renderer code', () => {
    const fixture = validFixture()
    fixture.manifest['src/ui/SharedView.tsx'].dynamicImports = ['src/starmap/Renderer.ts']
    expect(() => validateBuildBoundaries(fixture)).toThrow(/public share.*private module/)
  })

  test('rejects a private module coalesced into a public-reachable chunk', () => {
    const fixture = validFixture()
    fixture.chunks.find((chunk) => chunk.file === 'assets/SharedView.js').moduleIds.push(
      '/repo/frontend/src/starmap/private.ts',
    )
    expect(() => validateBuildBoundaries(fixture)).toThrow(/public share.*private module.*private\.ts/)
  })

  test('requires Renderer to be a direct dynamic import of private Universe', () => {
    const fixture = validFixture()
    fixture.manifest['src/ui/Universe.tsx'].imports = ['src/starmap/Renderer.ts']
    fixture.manifest['src/ui/Universe.tsx'].dynamicImports = []
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Universe.*dynamic import.*Renderer/)
  })

  test('rejects Three modules split across named and renamed chunks', () => {
    const fixture = validFixture()
    fixture.manifest['_geometry.js'] = { file: 'assets/geometry.js', name: 'geometry-vendor' }
    fixture.manifest['src/starmap/Renderer.ts'].imports.push('_geometry.js')
    fixture.chunks.push({
      file: 'assets/geometry.js',
      moduleIds: ['/repo/frontend/node_modules/three/src/geometries/BoxGeometry.js'],
    })
    fixture.assetSizes['assets/geometry.js'] = 100
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Three modules.*one chunk/)
  })

  test('rejects a dummy named Three record while modules live in a renamed chunk', () => {
    const fixture = validFixture()
    fixture.chunks.find((chunk) => chunk.file === 'assets/three.js').moduleIds = ['/repo/frontend/src/dummy.ts']
    fixture.chunks.push({
      file: 'assets/runtime.js',
      moduleIds: ['/repo/frontend/node_modules/three/build/three.module.js'],
    })
    expect(() => validateBuildBoundaries(fixture)).toThrow(/named Three vendor.*module metadata/)
  })

  test('rejects an unrelated Three chunk outside Renderer static imports', () => {
    const fixture = validFixture()
    fixture.manifest['src/starmap/Renderer.ts'].imports = ['_postprocessing.js']
    fixture.manifest['_postprocessing.js'].imports = []
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Renderer.*static closure/)
  })

  test('keeps the ordinary size limit for every emitted JavaScript chunk', () => {
    const fixture = validFixture()
    fixture.chunks.push({ file: 'assets/orphan.js', moduleIds: ['/repo/frontend/src/orphan.ts'] })
    fixture.assetSizes['assets/orphan.js'] = 500_001
    expect(() => validateBuildBoundaries(fixture)).toThrow(/orphan\.js.*500001.*500000/)
  })
})
