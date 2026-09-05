import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera.js'
import { NullEngine } from '@babylonjs/core/Engines/nullEngine.js'
import { Vector3 } from '@babylonjs/core/Maths/math.vector.js'
import { Scene } from '@babylonjs/core/scene.js'
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial.js'
import { CreateBox } from '@babylonjs/core/Meshes/Builders/boxBuilder.js'
import { ProbeLayer, allocateProbeOrbits, probeMaterialShading } from './probeLayer'
import { partsForLod } from './probeGeometry'

const star = (id: string) => ({ s: { id, c: id, g: 0, probeIds: [`${id}-p0`, `${id}-p1`] }, p: [0, 0, 0], bodyR: 0.4 })
const index = (ids: readonly string[]) => ({
  probesById: new Map(ids.flatMap((id) => [
    [`${id}-p0`, { id: `${id}-p0`, title: 'A' }], [`${id}-p1`, { id: `${id}-p1`, title: 'B' }],
  ] as [string, unknown][])),
} as never)

function setup(starIds: readonly string[] = ['alpha']) {
  const engine = new NullEngine()
  const scene = new Scene(engine)
  // A real camera so projected size — and therefore the LOD ladder — is real.
  scene.activeCamera = new FreeCamera('probe-test-camera', Vector3.Zero(), scene)
  const stars = starIds.map(star) as never[]
  const layer = new ProbeLayer(scene, index(starIds), stars, { reducedMotion: false })
  return { engine, scene, layer, stars }
}

const frame = (overrides = {}) => ({
  elapsedMs: 0,
  projectionScale: 500,
  focusedStarId: null as string | null,
  starPositions: new Map([['alpha', new Vector3(0, 0, -20)]]),
  starOpacities: new Map([['alpha', 1]]),
  ...overrides,
})

describe('allocateProbeOrbits', () => {
  it('gives every probe of a star its own stable slot', () => {
    const records = allocateProbeOrbits(index(['alpha']), [star('alpha')] as never)
    expect(records).toHaveLength(2)
    expect(records.map(({ probeId }) => probeId)).toEqual(['alpha-p0', 'alpha-p1'])
    expect(records[0]!.phase).not.toBeCloseTo(records[1]!.phase, 3)
    expect(records.every(({ radius }) => radius > 0)).toBe(true)
  })

  it('is deterministic across rebuilds', () => {
    const first = allocateProbeOrbits(index(['alpha']), [star('alpha')] as never)
    const second = allocateProbeOrbits(index(['alpha']), [star('alpha')] as never)
    expect(second).toEqual(first)
  })

  it('ignores probe ids the universe does not carry', () => {
    const empty = { probesById: new Map() } as never
    expect(allocateProbeOrbits(empty, [star('alpha')] as never)).toEqual([])
  })
})

describe('probe material shading', () => {
  it('stays on the renderer\'s own shading model instead of dragging in the PBR pipeline', () => {
    const source = readFileSync('src/starmap/babylon/probeLayer.ts', 'utf8')
    // PBR 是整包多出来的四百多 KB —— 这个渲染器的行星、恒星都不用它。
    expect(source).not.toMatch(/Materials\/PBR\//)
  })

  it('reads金属为暗漫反射 + 强高光，粗糙面为亮漫反射 + 钝高光', () => {
    const metal = probeMaterialShading('metal')
    const panel = probeMaterialShading('panel')
    expect(metal.diffuseScale).toBeLessThan(panel.diffuseScale)
    expect(metal.specularPower).toBeGreaterThan(panel.specularPower)
    expect(metal.specularScale).toBeGreaterThan(panel.specularScale)
  })

  it('keeps the amber beacon and the light strip emissive above the bloom floor', () => {
    for (const key of ['amber', 'light'] as const) {
      const { emissive } = probeMaterialShading(key)
      expect(Math.max(...emissive)).toBeGreaterThan(0.68)
    }
    expect(Math.max(...probeMaterialShading('panel').emissive)).toBe(0)
  })

  it('builds double-sided etching so the hull number reads from either side', () => {
    const { scene, layer } = setup()
    layer.inspect('alpha-p0')
    const etching = scene.meshes.find((mesh) => mesh.name.includes('etching'))
    expect((etching?.material as StandardMaterial | undefined)?.backFaceCulling).toBe(false)
    layer.dispose()
  })
})

describe('probe lighting rig', () => {
  it('carries its own key and fill light so the craft is never a silhouette', () => {
    const { scene, layer } = setup()
    const lights = scene.lights.filter((light) => light.name.startsWith('probe:'))
    expect(lights).toHaveLength(2)
    const [fill, key] = lights
    // gl/probe.ts: HemisphereLight(0xb9d4ff, 0x101522, 1.25) + DirectionalLight(0xffd7a0, 2.1)
    expect(fill.intensity).toBeCloseTo(1.25, 5)
    expect(key.intensity).toBeCloseTo(2.1, 5)
    layer.dispose()
    expect(scene.lights.filter((light) => light.name.startsWith('probe:'))).toEqual([])
  })

  it('lights only the craft, so the rest of the universe keeps its own shading', () => {
    const { scene, layer } = setup()
    layer.inspect('alpha-p0')
    const outsider = CreateBox('not-a-probe', {}, scene)
    for (const light of scene.lights.filter((light) => light.name.startsWith('probe:'))) {
      expect(light.includedOnlyMeshes.length).toBeGreaterThan(0)
      expect(light.includedOnlyMeshes).not.toContain(outsider)
      expect(light.includedOnlyMeshes.some((mesh) => mesh.name.includes('probe:inspect:'))).toBe(true)
    }
    layer.dispose()
  })
})

describe('ProbeLayer', () => {
  it('draws each detail tier as one batch per part, not one draw per probe', () => {
    const { layer } = setup()
    const diagnostics = layer.diagnostics()
    expect(diagnostics.probeCount).toBe(2)
    expect(diagnostics.batchCount).toBe(
      partsForLod('far').length + partsForLod('medium').length + partsForLod('near').length,
    )
    layer.dispose()
  })

  it('starts every probe at the far tier and promotes it as it fills the frame', () => {
    const { layer } = setup()
    layer.update(frame())
    expect(layer.diagnostics().lods).toEqual(['far', 'far'])
    layer.update(frame({ starPositions: new Map([['alpha', new Vector3(0, 0, -1.2)]]) }))
    expect(layer.diagnostics().lods.every((lod) => lod !== 'far')).toBe(true)
    layer.dispose()
  })

  it('builds a separately pickable craft when a probe is inspected', () => {
    const { layer, scene } = setup()
    layer.update(frame())
    expect(layer.diagnostics().inspectedPartCount).toBe(0)
    layer.inspect('alpha-p0')
    expect(layer.diagnostics().inspectedProbeId).toBe('alpha-p0')
    expect(layer.diagnostics().inspectedPartCount).toBe(partsForLod('near').length)
    const pickable = scene.meshes.filter((mesh) => mesh.isPickable)
    expect(pickable.length).toBe(partsForLod('near').length)
    expect(layer.pickPart(pickable[0]!)).toBeTruthy()
    layer.inspect(null)
    expect(layer.diagnostics().inspectedPartCount).toBe(0)
    layer.dispose()
  })

  it('reports where the inspected craft is so the camera can fly to it', () => {
    const { layer } = setup()
    const target = new Vector3()
    expect(layer.inspectionTarget(target)).toBe(false)
    layer.inspect('alpha-p0')
    layer.update(frame())
    expect(layer.inspectionTarget(target)).toBe(true)
    expect([target.x, target.y, target.z].every(Number.isFinite)).toBe(true)
    layer.dispose()
  })

  it('runs the scan sweep only while scanning', () => {
    const { layer } = setup()
    layer.inspect('alpha-p0')
    expect(layer.diagnostics().scanning).toBe(false)
    layer.setScanning(true)
    expect(layer.diagnostics().scanning).toBe(true)
    layer.setScanning(false)
    expect(layer.diagnostics().scanning).toBe(false)
    layer.dispose()
  })

  it('highlights one part at a time and clears it', () => {
    const { layer } = setup()
    layer.inspect('alpha-p0')
    layer.setPartHighlight('beacon')
    expect(layer.diagnostics().highlightedPart).toBe('beacon')
    layer.setPartHighlight(null)
    expect(layer.diagnostics().highlightedPart).toBeNull()
    layer.dispose()
  })

  it('shows the inspected craft at near detail however small it projects', () => {
    const { layer } = setup()
    // 远得不能再远：阶梯自己绝不会升到 near。
    const distant = frame({ projectionScale: 20, starPositions: new Map([['alpha', new Vector3(0, 0, -900)]]) })
    layer.update(distant)
    expect(layer.diagnostics().nearOpacity).toBe(0)
    layer.inspect('alpha-p0')
    layer.update(distant)
    // 被检查的那一艘恒是近景 —— 「检查」本身就是最近的观察，不该再过一次阶梯。
    expect(layer.diagnostics().nearOpacity).toBeGreaterThan(0)
    expect(layer.diagnostics().inspectedPartCount).toBe(partsForLod('near').length)
    layer.dispose()
  })

  it('does not also draw the inspected craft in the ambient batches', () => {
    const { layer } = setup()
    layer.update(frame())
    const ambient = layer.diagnostics().ambientInstanceCount
    layer.inspect('alpha-p0')
    layer.update(frame())
    expect(layer.diagnostics().ambientInstanceCount).toBeLessThan(ambient)
    layer.inspect(null)
    layer.update(frame())
    expect(layer.diagnostics().ambientInstanceCount).toBe(ambient)
    layer.dispose()
  })

  it('flies nose-first: the craft heading follows the orbital tangent', () => {
    const { layer } = setup()
    layer.inspect('alpha-p0')
    layer.update(frame({ elapsedMs: 0 }))
    const first = layer.diagnostics().inspectionHeading
    layer.update(frame({ elapsedMs: 9_000 }))
    const later = layer.diagnostics().inspectionHeading
    // 机头是单位向量，并且随着绕行改变方向 —— 不是一个固定朝向的模型。
    for (const heading of [first, later]) {
      expect(Math.hypot(heading[0], heading[1], heading[2])).toBeCloseTo(1, 5)
    }
    expect(later).not.toEqual(first)
    // 切线必须垂直于「机体 − 恒星」的连线：贴着轨道飞，不是朝外或朝内。
    const target = new Vector3()
    layer.inspectionTarget(target)
    const radial = target.subtract(new Vector3(0, 0, -20)).normalize()
    expect(Math.abs(radial.x * later[0] + radial.y * later[1] + radial.z * later[2])).toBeLessThan(0.05)
    layer.dispose()
  })

  it('releases every mesh and material it created', () => {
    const { scene, layer } = setup()
    layer.inspect('alpha-p0')
    expect(scene.meshes.length).toBeGreaterThan(0)
    layer.dispose()
    expect(scene.meshes.length).toBe(0)
    // 场景自带的 default material 是 Babylon 的共享单例，不归这一层释放。
    expect(scene.materials.map((material) => material.name).filter((name) => name.startsWith('probe:')))
      .toEqual([])
    expect(() => layer.dispose()).not.toThrow()
  })
})
