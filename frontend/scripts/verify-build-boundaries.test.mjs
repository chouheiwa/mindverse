// @vitest-environment node
import { describe, expect, test } from 'vitest'
import * as buildVerifier from './verify-build-boundaries.mjs'

const { resolveBuildOutputDir, validateBuildBoundaries } = buildVerifier

const validFixture = () => ({
  renderer: 'three',
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
      dynamicImports: ['virtual:mindverse-renderer'],
    },
    'virtual:mindverse-renderer': {
      file: 'assets/Renderer.js',
      src: 'virtual:mindverse-renderer',
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

const validBabylonFixture = () => {
  const fixture = validFixture()
  fixture.renderer = 'babylon'
  delete fixture.manifest['_three.js']
  delete fixture.manifest['_postprocessing.js']
  fixture.manifest['_babylon.js'] = { file: 'assets/babylon.js', name: 'babylon' }
  fixture.manifest['virtual:mindverse-renderer'] = {
    file: 'assets/BabylonRenderer.js',
    src: 'virtual:mindverse-renderer',
    imports: ['_babylon.js'],
  }
  fixture.manifest['src/ui/Universe.tsx'].dynamicImports = ['virtual:mindverse-renderer']
  fixture.chunks = fixture.chunks.filter(({ file }) =>
    file !== 'assets/three.js' && file !== 'assets/postprocessing.js' && file !== 'assets/Renderer.js')
  fixture.chunks.push(
    { file: 'assets/babylon.js', moduleIds: ['/repo/frontend/node_modules/@babylonjs/core/scene.js'] },
    { file: 'assets/BabylonRenderer.js', moduleIds: ['/repo/frontend/src/starmap/babylon/BabylonRenderer.ts'] },
  )
  delete fixture.assetSizes['assets/three.js']
  delete fixture.assetSizes['assets/postprocessing.js']
  delete fixture.assetSizes['assets/Renderer.js']
  fixture.assetSizes['assets/babylon.js'] = 700_000
  fixture.assetSizes['assets/BabylonRenderer.js'] = 100
  return fixture
}

describe('build boundary verifier', () => {
  test('requires an explicit output directory instead of silently verifying deployable web', () => {
    expect(() => resolveBuildOutputDir(undefined, '/repo/frontend')).toThrow(/output directory.*required/i)
    expect(resolveBuildOutputDir('../.e2e-web', '/repo/frontend')).toBe('/repo/.e2e-web')
  })

  test('accepts the intended public/private topology and one coherent Three chunk', () => {
    expect(validateBuildBoundaries(validFixture())).toMatchObject({
      renderer: 'three',
      publicChunkCount: 2,
      threeChunkFile: 'assets/three.js',
    })
  })

  test('requires an explicit renderer kind', () => {
    const fixture = validFixture()
    delete fixture.renderer
    expect(() => validateBuildBoundaries(fixture)).toThrow(/renderer.*three.*babylon/i)
  })

  test('accepts a Babylon artifact with no Three or postprocessing modules', () => {
    expect(validateBuildBoundaries(validBabylonFixture())).toMatchObject({
      renderer: 'babylon',
      babylonChunkFile: 'assets/babylon.js',
    })
  })

  test('rejects Babylon code or import metadata in a Three artifact', () => {
    const fixture = validFixture()
    fixture.chunks.push({
      file: 'assets/accidental-babylon.js',
      imports: ['@babylonjs/core'],
      moduleIds: ['/repo/frontend/node_modules/@babylonjs/core/scene.js'],
    })
    fixture.assetSizes['assets/accidental-babylon.js'] = 100
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Three artifact.*Babylon/i)
  })

  test('rejects Three and postprocessing code in a Babylon artifact', () => {
    const fixture = validBabylonFixture()
    fixture.chunks.push({
      file: 'assets/three-leak.js',
      imports: ['postprocessing'],
      moduleIds: ['/repo/frontend/node_modules/three/build/three.module.js'],
    })
    fixture.assetSizes['assets/three-leak.js'] = 100
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Babylon artifact.*Three|postprocessing/i)
  })

  test('rejects a public SharedView dynamic import of private renderer code', () => {
    const fixture = validFixture()
    fixture.manifest['src/ui/SharedView.tsx'].dynamicImports = ['virtual:mindverse-renderer']
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
    fixture.manifest['src/ui/Universe.tsx'].imports = ['virtual:mindverse-renderer']
    fixture.manifest['src/ui/Universe.tsx'].dynamicImports = []
    expect(() => validateBuildBoundaries(fixture)).toThrow(/Universe.*dynamic import.*Renderer/)
  })

  test('rejects Three modules split across named and renamed chunks', () => {
    const fixture = validFixture()
    fixture.manifest['_geometry.js'] = { file: 'assets/geometry.js', name: 'geometry-vendor' }
    fixture.manifest['virtual:mindverse-renderer'].imports.push('_geometry.js')
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
    fixture.manifest['virtual:mindverse-renderer'].imports = ['_postprocessing.js']
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
