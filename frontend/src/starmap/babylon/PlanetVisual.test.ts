import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Scene } from '@babylonjs/core/scene.js'
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { afterEach, describe, expect, test, vi } from 'vitest'
import type { PlanetSurfaceDescriptor } from './planetSurface'
import { PlanetVisual } from './PlanetVisual'

const descriptor: PlanetSurfaceDescriptor = Object.freeze({
  metadata: Object.freeze({ questionId: 'q:7', starId: 's:2' }),
  seed: 7,
  radius: 0.8,
  craterCount: 18,
  detailDensity: 0.4,
  faultStrength: 0.6,
  atmosphere: 0.7,
  createdGlow: 1,
  collectedMarker: 0,
  incident: 0.5,
  thermal: Object.freeze({ magma: 0, desert: 0, rock: 1, tundra: 0, ice: 0 }),
})

const disposables: Array<{ dispose(): void }> = []

afterEach(() => {
  while (disposables.length) disposables.pop()!.dispose()
  vi.restoreAllMocks()
})

function setup(options: ConstructorParameters<typeof PlanetVisual>[0] extends infer _T
  ? Partial<ConstructorParameters<typeof PlanetVisual>[0]> : never = {}) {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  const visual = new PlanetVisual({ scene, descriptor, ...options })
  disposables.push(visual, scene, engine)
  return { engine, scene, visual }
}

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void
  let reject!: (cause?: unknown) => void
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve
    reject = onReject
  })
  return { promise, resolve, reject }
}

describe('PlanetVisual resource boundary', () => {
  test('owns one pickable surface and a non-pickable back-face atmosphere shell', () => {
    const { visual } = setup()

    expect(visual.orbitMesh.isPickable).toBe(true)
    expect(visual.atmosphereMesh.isPickable).toBe(false)
    expect(visual.atmosphereMaterial.backFaceCulling).toBe(false)
    expect(visual.meshes.every((mesh) => mesh.metadata?.questionId === 'q:7')).toBe(true)

    visual.dispose()
    expect(visual.orbitMesh.isDisposed()).toBe(true)
    expect(visual.atmosphereMesh.isDisposed()).toBe(true)
  })

  test('lazily creates a focused high-detail model and preserves one semantic identity', () => {
    const { visual } = setup()
    visual.setPosition(new Vector3(4, 2, -1))
    visual.setLod('high')
    visual.setFocusBlend(0.5)

    expect(visual.focusMesh).not.toBeNull()
    expect(visual.meshes.filter((mesh) => mesh.isEnabled()
      && mesh.name.includes(':focus') && !mesh.name.includes(':atmosphere')).length).toBe(1)
    expect(visual.activeMesh.metadata).toMatchObject({ questionId: 'q:7', starId: 's:2' })
    expect(visual.focusTarget()).toEqual({ x: 4, y: 2, z: -1 })

    visual.setFocusBlend(1)
    expect(visual.activeMesh).toBe(visual.focusMesh)
    visual.setLod('medium')
    expect(visual.focusMesh).toBeNull()
    expect(visual.activeMesh).toBe(visual.orbitMesh)
  })

  test('uses shared vertices for smooth surface and atmosphere normals at every LOD', () => {
    const { visual } = setup()
    visual.setLod('high')

    expect(visual.focusMesh!.getTotalVertices()).toBeGreaterThanOrEqual(3_000)
    for (const mesh of visual.meshes) {
      const positions = mesh.getVerticesData('position')!
      const normals = mesh.getVerticesData('normal')!
      const normalsByPosition = new Map<string, Set<string>>()
      for (let index = 0; index < positions.length; index += 3) {
        const position = Array.from(positions.slice(index, index + 3), (value) => value.toFixed(5)).join(',')
        const normal = Array.from(normals.slice(index, index + 3), (value) => value.toFixed(5)).join(',')
        const values = normalsByPosition.get(position) ?? new Set<string>()
        values.add(normal)
        normalsByPosition.set(position, values)
      }
      expect([...normalsByPosition.values()].every((values) => values.size === 1)).toBe(true)
    }
  })

  test('derives high-frequency detail from the visible high shader readiness', async () => {
    const { visual } = setup({ compileSurface: async () => undefined })
    visual.setFocusBlend(1)
    await visual.ensureLod('high')
    const material = visual.focusMesh!.material as ShaderMaterial
    const isReady = vi.spyOn(material, 'isReady').mockReturnValue(false)

    expect(visual.diagnostics()).toMatchObject({ surfaceLevel: 'high', highFrequencyDetail: false })
    isReady.mockReturnValue(true)

    expect(visual.focusMesh?.isEnabled()).toBe(true)
    expect(visual.diagnostics()).toMatchObject({ surfaceLevel: 'high', highFrequencyDetail: true })
  })

  test('does not update time or camera uniforms while its active surface is invisible', () => {
    const setFloat = vi.spyOn(ShaderMaterial.prototype, 'setFloat')
    const { visual } = setup()
    setFloat.mockClear()
    visual.setVisible(false)

    expect(visual.update({
      elapsedMs: 100,
      cameraPosition: new Vector3(0, 0, 5),
      starPosition: Vector3.Zero(),
      coverage: 0.1,
      focused: false,
    })).toBe(false)
    expect(setFloat).not.toHaveBeenCalledWith('uTime', expect.any(Number))
  })

  test('falls through high, medium and low compilation failures before Lambert', async () => {
    const attempts: string[] = []
    const onError = vi.fn()
    const { visual } = setup({
      onError,
      compileSurface: async (_material, level) => {
        attempts.push(level)
        throw new Error(`${level} failed`)
      },
    })

    await visual.ensureLod('high')

    expect(attempts).toEqual(['high', 'medium', 'low'])
    expect(visual.diagnostics()).toMatchObject({ surfaceLevel: 'lambert', surfaceFallback: true })
    expect(visual.minimumFocusRadiusMultiplier).toBe(4.2)
    expect(visual.activeMesh.isPickable).toBe(true)
    expect(onError).toHaveBeenCalledTimes(3)
  })

  test('contains an atmosphere compilation failure without replacing the surface', async () => {
    const { visual } = setup({
      compileAtmosphere: async () => { throw new Error('atmosphere failed') },
    })

    await visual.ensureAtmosphere()

    expect(visual.diagnostics()).toMatchObject({ atmosphereFallback: true })
    expect(visual.atmosphereMesh.isEnabled()).toBe(false)
    expect(visual.activeMesh.isEnabled()).toBe(true)
  })

  test('remembers an unavailable high tier and does not compile it again', async () => {
    const attempts: string[] = []
    const { visual } = setup({
      compileSurface: async (_material, level) => {
        attempts.push(level)
        if (level === 'high') throw new Error('high unavailable')
      },
    })

    await visual.ensureLod('high')
    await visual.ensureLod('high')

    expect(attempts).toEqual(['high', 'medium', 'medium'])
    expect(visual.diagnostics().surfaceLevel).toBe('medium')
  })

  test('does not touch or recreate resources when surface compilation resolves after disposal', async () => {
    const compilation = deferred()
    const compileAtmosphere = vi.fn(async () => undefined)
    let cancellation: AbortSignal | undefined
    const { scene, visual } = setup({
      compileSurface: (_material, _level, _mesh, signal) => {
        cancellation = signal
        return compilation.promise
      },
      compileAtmosphere,
    })
    const pending = visual.ensureLod('high')

    visual.dispose()
    expect(scene.meshes).toHaveLength(0)
    const materialsAfterDisposal = [...scene.materials]
    expect(cancellation?.aborted).toBe(true)
    compilation.resolve()
    await pending

    expect(compileAtmosphere).not.toHaveBeenCalled()
    expect(scene.meshes).toHaveLength(0)
    expect(scene.materials).toEqual(materialsAfterDisposal)
  })

  test('does not install a fallback or report when surface compilation rejects after disposal', async () => {
    const compilation = deferred()
    const onError = vi.fn()
    const { scene, visual } = setup({
      compileSurface: () => compilation.promise,
      onError,
    })
    const pending = visual.ensureLod('high')

    visual.dispose()
    const materialsAfterDisposal = [...scene.materials]
    compilation.reject(new Error('late failure'))
    await pending

    expect(onError).not.toHaveBeenCalled()
    expect(scene.meshes).toHaveLength(0)
    expect(scene.materials).toEqual(materialsAfterDisposal)
  })

  test('does not mutate disposed atmosphere state after late compilation rejection', async () => {
    const compilation = deferred()
    const onError = vi.fn()
    const { scene, visual } = setup({
      compileAtmosphere: () => compilation.promise,
      onError,
    })
    const pending = visual.ensureAtmosphere()

    visual.dispose()
    const materialsAfterDisposal = [...scene.materials]
    compilation.reject(new Error('late atmosphere failure'))
    await pending

    expect(onError).not.toHaveBeenCalled()
    expect(scene.meshes).toHaveLength(0)
    expect(scene.materials).toEqual(materialsAfterDisposal)
  })
})
