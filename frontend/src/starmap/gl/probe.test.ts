// @vitest-environment node
import * as THREE from 'three'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { indexUniverse } from '../../domain/universe'
import type { ArticleProbe, CurrentStar, NormalizedCurrentUniverse } from '../../types'
import { __failResourceAfterForTests } from '../resourceScope'
import { starData } from './starData'
import {
  makeProbe,
  nextProbeLod,
  probeDitherVisible,
  probeLodWeights,
  probeOrbitData,
  probeLayerSnapshot,
  writeProbeFrame,
  type ProbeFrame,
  type ProbeLayer,
  type ProbePart,
} from './probe'

const star: CurrentStar = {
  id: 'star:v1:private:8ed3f6ad685b959e', scope: 'private', externalQueryAllowed: false,
  questionIds: [], probeIds: [], c: 'Alpha', g: 0,
  p: [0, 0, -12], n: 300, o: 0, f: 300, hue: 218, sat: 70, pe: 1, bu: 0,
  fi: '2026.01', la: '2026.08', ev: [],
}

function article(index: number): ArticleProbe {
  return {
    id: `article:${index}`, title: `Probe ${index}`, url: `https://zhuanlan.zhihu.com/p/${index}`,
    bindings: [], discoverySources: ['public_search'],
  }
}

function universe(count = 1): NormalizedCurrentUniverse {
  const probes = Array.from({ length: count }, (_, index) => article(index + 1))
    .sort((left, right) => left.id.localeCompare(right.id))
  return {
    schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
    meta: { items: count, concepts: 1, clusters: 1, own: 0, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
    clusters: [{ g: 0, name: 'Cluster', lead: 'Alpha', c: [0, 0, -12], n: count, o: 0, f: count, hue: 218, sat: 70, mem: ['Alpha'] }],
    stars: [{ ...star, n: count, probeIds: probes.map(({ id }) => id) }],
    particles: [], wormholes: [], solo: [], dark: [], nebula: [], questions: [], answers: [], probes,
  }
}

function createLayer(count = 1): ProbeLayer {
  const u = universe(count)
  return makeProbe(indexUniverse(u), starData(u))
}

function frame(
  focusedStarId: string | null,
  projectionScale: number,
  options: { elapsedMs?: number; opacity?: number } = {},
): ProbeFrame {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1_000)
  camera.position.set(0, 0, 0)
  camera.lookAt(0, 0, -1)
  camera.updateMatrixWorld(true)
  return {
    elapsedMs: options.elapsedMs ?? 0,
    camera,
    projectionScale,
    focusedStarId,
    convergence: 1,
    starWorldPositions: new Map([[star.id, new THREE.Vector3(...star.p)]]),
    starOpacities: new Map([[star.id, options.opacity ?? 1]]),
  }
}

afterEach(() => {
  __failResourceAfterForTests(null)
  vi.restoreAllMocks()
})

describe('probe LOD', () => {
  test('keeps the required persistent hysteresis boundaries in projected CSS pixels', () => {
    expect(nextProbeLod('far', 28)).toBe('medium')
    expect(nextProbeLod('medium', 24)).toBe('medium')
    expect(nextProbeLod('medium', 14)).toBe('far')
    expect(nextProbeLod('medium', 92)).toBe('near')
    expect(nextProbeLod('near', 76)).toBe('medium')
    expect(nextProbeLod('near', 80)).toBe('near')
  })

  test('cross-fades only the current level and one adjacent level', () => {
    for (const lod of ['far', 'medium', 'near'] as const) {
      for (const px of [0, 14, 20, 28, 52, 76, 84, 92, 500]) {
        const weights = probeLodWeights(lod, px)
        expect(Object.values(weights).filter((weight) => weight > 0).length).toBeLessThanOrEqual(2)
        expect(weights.far > 0 && weights.near > 0).toBe(false)
        expect(weights.far + weights.medium + weights.near).toBeCloseTo(1)
      }
    }
  })

  test('unfocused owners stay far while focus unlocks medium and a single near model', () => {
    const layer = createLayer(300)
    layer.update(frame(null, 10_000))
    let snapshot = probeLayerSnapshot(layer)
    expect(snapshot.lods).toEqual({ far: 300, medium: 0, near: 0 })
    const farHull = layer.group.getObjectByName('probe-far:hull') as THREE.InstancedMesh
    const mediumHull = layer.group.getObjectByName('probe-medium:hull') as THREE.InstancedMesh
    expect(farHull.getColorAt(0, new THREE.Color()).r).toBeCloseTo(1)
    expect(mediumHull.getColorAt(0, new THREE.Color()).r).toBe(0)

    layer.update(frame(star.id, 10_000))
    snapshot = probeLayerSnapshot(layer)
    expect(snapshot.lods.near).toBeLessThanOrEqual(1)
    expect(snapshot.lods.medium + snapshot.lods.near).toBeGreaterThan(0)
    expect(snapshot.maxSimultaneousLevels).toBeLessThanOrEqual(2)
    expect(layer.group.getObjectByName('probe-near-singleton')?.visible).toBe(true)
    layer.dispose()
  })

  test('cross-fades medium to near with material alpha without shrinking near geometry', () => {
    const u = universe(1)
    const data = starData(u)
    const orbit = probeOrbitData(indexUniverse(u), data)[0]
    const layer = makeProbe(indexUniverse(u), data)
    const viewDepth = -(star.p[2] + orbit.position[2])
    layer.update(frame(star.id, 84 * viewDepth / 0.34))

    const mediumHull = layer.group.getObjectByName('probe-medium:hull') as THREE.InstancedMesh
    const nearHull = layer.group.getObjectByName('probe-near:hull') as THREE.Mesh
    const mediumAlpha = mediumHull.getColorAt(0, new THREE.Color()).r
    const nearAlpha = (nearHull.material as THREE.Material).opacity
    const scale = new THREE.Vector3()
    nearHull.matrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale)

    expect(nearAlpha).toBeGreaterThan(0)
    expect(nearAlpha).toBeLessThan(1)
    expect(nearHull.material).not.toBe(mediumHull.material)
    expect(mediumAlpha + nearAlpha).toBeCloseTo(1)
    expect(scale.toArray()).toEqual([1, 1, 1])

    layer.update(frame(star.id, 92 * viewDepth / 0.34))
    layer.update(frame(star.id, 76 * viewDepth / 0.34))
    expect(probeLayerSnapshot(layer).nearOpacity).toBe(0)
    expect((nearHull.material as THREE.Material).opacity).toBe(0)
    expect(layer.group.getObjectByName('probe-near-singleton')?.visible).toBe(false)
    layer.dispose()
  })

  test('uses instance color only as linear alpha and keeps hashed depth during fades', () => {
    const u = universe(1)
    const data = starData(u)
    const orbit = probeOrbitData(indexUniverse(u), data)[0]
    const layer = makeProbe(indexUniverse(u), data)
    layer.update(frame(null, 1, { opacity: 0.12 }))

    const farHull = layer.group.getObjectByName('probe-far:hull') as THREE.InstancedMesh
    const material = farHull.material as THREE.MeshStandardMaterial
    const shader = {
      vertexShader: 'void main() {\n#include <color_vertex>\n}',
      fragmentShader: 'void main() {\n#include <color_fragment>\n#include <alphahash_fragment>\n}',
      uniforms: {},
    } as unknown as Parameters<typeof material.onBeforeCompile>[0]
    material.onBeforeCompile(shader, {} as THREE.WebGLRenderer)

    expect(farHull.getColorAt(0, new THREE.Color()).r).toBeCloseTo(0.12)
    expect(shader.vertexShader).toMatch(/vProbeAlpha\s*=\s*instanceColor\.r[\s\S]*vColor\.rgb\s*=\s*vec3\(1\.0\)/)
    expect(shader.fragmentShader).toContain('getAlphaHashThreshold( vPosition )')
    expect(shader.fragmentShader).toContain('vProbeUpper')
    expect(material).toMatchObject({ alphaHash: true, transparent: false, depthWrite: true })

    const viewDepth = -(star.p[2] + orbit.position[2])
    layer.update(frame(star.id, 24 * viewDepth / 0.34))
    const mediumHull = layer.group.getObjectByName('probe-medium:hull') as THREE.InstancedMesh
    const farAlpha = farHull.getColorAt(0, new THREE.Color()).r
    const mediumAlpha = mediumHull.getColorAt(0, new THREE.Color()).r
    const farUpper = farHull.getColorAt(0, new THREE.Color()).g > 0.5
    const mediumUpper = mediumHull.getColorAt(0, new THREE.Color()).g > 0.5
    expect(farAlpha + mediumAlpha).toBeCloseTo(1)
    expect(farAlpha ** 2 + mediumAlpha ** 2).toBeCloseTo(0.5)
    expect([farUpper, mediumUpper]).toEqual([false, true])

    for (const lowerWeight of [0, 0.5, 1]) {
      let lowerPixels = 0
      let upperPixels = 0
      for (let pixel = 0; pixel < 10_000; pixel += 1) {
        const threshold = (pixel + 0.5) / 10_000
        const lower = probeDitherVisible(lowerWeight, false, threshold)
        const upper = probeDitherVisible(1 - lowerWeight, true, threshold)
        expect(Number(lower) + Number(upper)).toBe(1)
        lowerPixels += Number(lower)
        upperPixels += Number(upper)
      }
      expect(lowerPixels / 10_000).toBeCloseTo(lowerWeight, 4)
      expect(upperPixels / 10_000).toBeCloseTo(1 - lowerWeight, 4)
    }
    layer.dispose()
  })

  test('compacts visible levels and does not dirty unchanged instance buffers', () => {
    const layer = createLayer(300)
    const firstFrame = frame(null, 10_000, { elapsedMs: 0 })
    layer.update(firstFrame)
    const snapshot = probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics
    const farHull = layer.group.getObjectByName('probe-far:hull') as THREE.InstancedMesh
    const mediumHull = layer.group.getObjectByName('probe-medium:hull') as THREE.InstancedMesh

    expect(farHull.count).toBe(300)
    expect(mediumHull.count).toBe(0)
    expect(snapshot.frame).toMatchObject({ farInstances: 300, mediumInstances: 0 })
    expect(snapshot.frame.matrixWrites).toBeLessThanOrEqual(4 * 300)
    expect(snapshot.frame.colorWrites).toBeLessThanOrEqual(4 * 300)
    expect(snapshot.frame.dirtyBuffers).toBeLessThanOrEqual(8)

    const versions = layer.group.children.flatMap((group) => group.children)
      .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
      .flatMap((mesh) => [mesh.instanceMatrix.version, mesh.instanceColor?.version ?? 0])
    layer.update(firstFrame)
    expect(layer.group.children.flatMap((group) => group.children)
      .filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
      .flatMap((mesh) => [mesh.instanceMatrix.version, mesh.instanceColor?.version ?? 0])).toEqual(versions)
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).frame).toMatchObject({
      matrixWrites: 0, colorWrites: 0, dirtyBuffers: 0,
    })

    layer.update(frame(null, 10_000, { elapsedMs: 1_000 }))
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).frame).toMatchObject({
      matrixWrites: 4 * 300, colorWrites: 0, dirtyBuffers: 4,
    })
    layer.dispose()
  })

  test('keeps a legal 10000-probe frame bounded to visible far-part writes', () => {
    const layer = createLayer(10_000)
    layer.update(frame(null, 10_000))
    const metrics = (probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).frame
    expect(metrics).toMatchObject({
      farInstances: 10_000,
      mediumInstances: 0,
      matrixWrites: 40_000,
      colorWrites: 40_000,
      dirtyBuffers: 8,
    })
    expect((layer.group.getObjectByName('probe-medium:hull') as THREE.InstancedMesh).count).toBe(0)
    layer.dispose()
  })

  test('keeps a near candidate across close projected-size rank swaps until inspect or exit', () => {
    const candidateAt = (elapsedMs: number) => {
      const layer = createLayer(2)
      layer.update(frame(star.id, 10_000, { elapsedMs }))
      const candidate = (probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).nearCandidateId
      layer.dispose()
      return candidate
    }
    const first = candidateAt(0)
    const coarseSwapTime = Array.from({ length: 121 }, (_, index) => (index + 1) * 5_000)
      .find((elapsedMs) => candidateAt(elapsedMs) !== first)
    expect(first).toMatch(/^article:/)
    expect(coarseSwapTime).toBeDefined()
    let beforeSwap = (coarseSwapTime ?? 5_000) - 5_000
    let afterSwap = coarseSwapTime ?? 5_000
    for (let iteration = 0; iteration < 24; iteration += 1) {
      const midpoint = (beforeSwap + afterSwap) / 2
      if (candidateAt(midpoint) === first) beforeSwap = midpoint
      else afterSwap = midpoint
    }
    expect(afterSwap - beforeSwap).toBeLessThan(0.001)
    expect(candidateAt(beforeSwap)).toBe(first)
    expect(candidateAt(afterSwap)).not.toBe(first)

    const layer = createLayer(2)
    layer.update(frame(star.id, 10_000, { elapsedMs: beforeSwap }))
    layer.update(frame(star.id, 10_000, { elapsedMs: afterSwap }))
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).nearCandidateId).toBe(first)

    const inspected = first === 'article:1' ? 'article:2' : 'article:1'
    layer.inspect(inspected)
    layer.update(frame(star.id, 10_000, { elapsedMs: afterSwap }))
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).nearCandidateId).toBe(inspected)
    layer.inspect('article:missing')
    layer.update(frame(star.id, 10_000, { elapsedMs: afterSwap }))
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).nearCandidateId).toBe(inspected)
    layer.update(frame(star.id, 0, { elapsedMs: afterSwap }))
    expect((probeLayerSnapshot(layer) as ProbeLayerSnapshotWithMetrics).nearCandidateId).toBeNull()
    layer.dispose()
  })
})

describe('probe ownership and stable orbit slots', () => {
  test('uses only CurrentStar.probeIds resolved through the index', () => {
    const u = universe(2)
    u.probes.push(article(999))
    u.stars[0].probeIds = ['article:1']
    u.questions = [{ id: 'question:999', questionId: '999', title: 'Must not become a probe', url: 'https://www.zhihu.com/question/999', answerIds: [] }]
    u.stars[0].questionIds = ['question:999']
    const output = probeOrbitData(indexUniverse(u), starData(u))

    expect(output.map(({ probeId }) => probeId)).toEqual(['article:1'])
    expect(JSON.stringify(output)).not.toContain('questionId')
    expect(JSON.stringify(output)).not.toContain('must-not-leak')
  })

  test('gives 300 probes unique deterministic positions and collision-resolved slots', () => {
    const u = universe(300)
    const first = probeOrbitData(indexUniverse(u), starData(u))
    const second = probeOrbitData(indexUniverse(structuredClone(u)), starData(structuredClone(u)))
    const positions = first.map(({ position }) => position.map((value) => value.toFixed(9)).join(','))

    expect(first).toEqual(second)
    expect(new Set(first.map(({ slot }) => slot))).toHaveLength(300)
    expect(new Set(positions)).toHaveLength(300)
    expect(first.every(({ starId }) => starId === star.id)).toBe(true)
    expect(first.every((value) => !Object.hasOwn(value, 'questionId'))).toBe(true)
  })

  test.each([513, 1_000, 10_000])('allocates %i stable unique slots with linear probe work', (count) => {
    const u = universe(count)
    const firstIndex = indexUniverse(u)
    const firstStars = starData(u)
    const clone = structuredClone(u)
    const secondIndex = indexUniverse(clone)
    const secondStars = starData(clone)
    const firstDiagnostics = { allocationWork: 0 }
    const secondDiagnostics = { allocationWork: 0 }
    const first = probeOrbitData(firstIndex, firstStars, firstDiagnostics)
    const second = probeOrbitData(secondIndex, secondStars, secondDiagnostics)
    expect(firstDiagnostics.allocationWork).toBeGreaterThan(0)
    expect(firstDiagnostics.allocationWork).toBeLessThanOrEqual(count * 16)
    expect(secondDiagnostics.allocationWork).toBe(firstDiagnostics.allocationWork)
    expect(first).toEqual(second)
    expect(new Set(first.map(({ slot }) => slot))).toHaveLength(count)
    expect(first.every((value) => !Object.hasOwn(value, 'questionId'))).toBe(true)
    expect(first.every((value) => !Object.hasOwn(value, 'allocationWork'))).toBe(true)
  })
})

interface ProbeLayerSnapshotWithMetrics {
  readonly nearCandidateId: string | null
  readonly frame: {
    readonly farInstances: number
    readonly mediumInstances: number
    readonly matrixWrites: number
    readonly colorWrites: number
    readonly dirtyBuffers: number
  }
}

test('updates one cached ProbeFrame object without leaking helper state', () => {
  const target = frame(null, 1)
  const camera = target.camera
  const positions = target.starWorldPositions
  const opacities = target.starOpacities
  expect(writeProbeFrame(target, 17, 2, star.id, 0.4)).toBe(target)
  expect(target).toMatchObject({ elapsedMs: 17, projectionScale: 2, focusedStarId: star.id, convergence: 0.4 })
  expect(target.camera).toBe(camera)
  expect(target.starWorldPositions).toBe(positions)
  expect(target.starOpacities).toBe(opacities)
  expect(Object.keys(target).sort()).toEqual([
    'camera', 'convergence', 'elapsedMs', 'focusedStarId', 'projectionScale',
    'starOpacities', 'starWorldPositions',
  ])
})

describe('shared procedural resources', () => {
  test('constructs the same shared far and medium resources for one or 300 articles', () => {
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const material = vi.spyOn(THREE.Material.prototype, 'dispose')
    const mesh = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose')
    const one = createLayer(1)
    const oneSnapshot = probeLayerSnapshot(one)
    one.dispose()
    const oneDisposed = geometry.mock.calls.length + material.mock.calls.length + mesh.mock.calls.length

    geometry.mockClear()
    material.mockClear()
    mesh.mockClear()
    const many = createLayer(300)
    const manySnapshot = probeLayerSnapshot(many)
    many.dispose()

    expect(manySnapshot.sharedResourceCount).toBe(oneSnapshot.sharedResourceCount)
    expect(geometry.mock.calls.length + material.mock.calls.length + mesh.mock.calls.length).toBe(oneDisposed)
    expect(manySnapshot.probeCount).toBe(300)
    expect(manySnapshot.nearModelCount).toBe(1)
  })

  test('builds the complete named far, medium, and near silhouette', () => {
    const layer = createLayer()
    const snapshot = probeLayerSnapshot(layer)
    expect(snapshot.parts.far).toEqual(expect.arrayContaining(['hull', 'left-wing', 'right-wing', 'beacon']))
    expect(snapshot.parts.medium).toEqual(expect.arrayContaining(['antenna', 'thruster', 'left-hinge', 'right-hinge']))
    expect(snapshot.parts.near).toEqual(expect.arrayContaining(['seam', 'scanner-lens', 'light-strip-inner', 'etching']))

    layer.inspect('article:1')
    layer.setPartHighlight('scanner-lens' satisfies ProbePart)
    layer.setScanning(true)
    expect(probeLayerSnapshot(layer)).toMatchObject({ inspectedProbeId: 'article:1', highlightedPart: 'scanner-lens', scanning: true })
    layer.dispose()
  })

  test('rolls back every registered resource failure and disposes idempotently', () => {
    const geometry = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    const material = vi.spyOn(THREE.Material.prototype, 'dispose')
    const mesh = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose')

    let registeredResourceCount = 0
    for (let failAt = 1; failAt < 100; failAt += 1) {
      geometry.mockClear()
      material.mockClear()
      mesh.mockClear()
      __failResourceAfterForTests(failAt)
      try {
        const layer = createLayer()
        registeredResourceCount = probeLayerSnapshot(layer).sharedResourceCount
        layer.dispose()
        break
      } catch (cause) {
        expect(cause).toBeInstanceOf(Error)
        expect(geometry.mock.calls.length + material.mock.calls.length + mesh.mock.calls.length).toBe(failAt)
      }
    }
    expect(registeredResourceCount).toBeGreaterThan(0)
    __failResourceAfterForTests(null)

    geometry.mockClear()
    material.mockClear()
    mesh.mockClear()
    const layer = createLayer()
    layer.dispose()
    const disposedOnce = geometry.mock.calls.length + material.mock.calls.length + mesh.mock.calls.length
    layer.dispose()
    expect(disposedOnce).toBe(registeredResourceCount)
    expect(geometry.mock.calls.length + material.mock.calls.length + mesh.mock.calls.length).toBe(disposedOnce)
  })
})
