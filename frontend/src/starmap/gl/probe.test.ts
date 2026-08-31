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
  probeLodWeights,
  probeOrbitData,
  probeLayerSnapshot,
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

function frame(focusedStarId: string | null, projectionScale: number): ProbeFrame {
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 1_000)
  camera.position.set(0, 0, 0)
  camera.lookAt(0, 0, -1)
  camera.updateMatrixWorld(true)
  return {
    elapsedMs: 0,
    camera,
    projectionScale,
    focusedStarId,
    convergence: 1,
    starWorldPositions: new Map([[star.id, new THREE.Vector3(...star.p)]]),
    starOpacities: new Map([[star.id, 1]]),
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
