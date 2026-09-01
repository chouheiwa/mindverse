import { expect, test, vi } from 'vitest'
import { __failResourceAfterForTests, RendererSignals, ResourceScope } from './resourceScope'
import { makeStars } from './gl/stars'
import * as THREE from 'three'
import type { Universe } from '../types'
import { makeNebula } from './gl/nebula'
import { cinematicEnvironment } from './gl/cinematic'
import { makeBodies } from './gl/bodies'
import type { UniverseIndex } from '../domain/universe'
import { makeDust } from './gl/dust'
import { makeRings } from './gl/rings'
import { makeOverlay3D } from './gl/overlay3d'
import { makeProbe } from './gl/probe'
import { starData } from './gl/starData'
import { Labels } from './gl/labels'

const emptyUniverse = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 0, concepts: 0, clusters: 0, own: 0, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [], stars: [], particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: [], answers: [], probes: [],
} as Universe

const familyQuestionIds = [
  'question:family:1', 'question:family:2', 'question:family:3', 'question:family:0',
]
const familyStar = {
  id: 'star:families', c: 'families', g: 1, p: [0, 0, 0] as [number, number, number],
  n: 4, o: 0, f: 0, hue: 210, sat: .5, pe: 0, bu: 0, fi: '', la: '', ev: [],
  scope: 'public' as const, externalQueryAllowed: false, questionIds: familyQuestionIds, probeIds: [],
}
const familyQuestions = familyQuestionIds.map((id) => ({ id, questionId: id, title: id, url: '', answerIds: [] }))
const familyUniverse = {
  schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
  meta: { items: 4, concepts: 1, clusters: 1, own: 0, fav: 0, span: [0, 0] as [number, number], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 1, name: 'families', lead: 'families', c: [0, 0, 0] as [number, number, number], n: 4, o: 0, f: 0, hue: 210, sat: .5, mem: ['families'] }],
  stars: [familyStar],
  particles: [], wormholes: [], solo: [], dark: [], nebula: [],
  questions: familyQuestions,
  answers: [], probes: [],
} satisfies Universe
const familyIndex: UniverseIndex = {
  universe: familyUniverse,
  starsById: new Map([[familyStar.id, familyStar]]),
  questionsById: new Map(familyQuestions.map((question) => [question.id, question])),
  answersById: new Map(), probesById: new Map(),
}

const lifecycleStar = {
  ...familyStar,
  p: [10, 0, 0] as [number, number, number],
  questionIds: [],
  probeIds: ['article:lifecycle'],
}
const lifecycleProbe = {
  id: 'article:lifecycle', title: 'lifecycle', url: 'https://zhuanlan.zhihu.com/p/1',
  bindings: [], discoverySources: ['own_content' as const],
}
const lifecycleUniverse = {
  ...familyUniverse,
  stars: [lifecycleStar],
  clusters: [{ ...familyUniverse.clusters[0], mem: [lifecycleStar.c] }],
  questions: [],
  probes: [lifecycleProbe],
  dark: [{ c: lifecycleStar.c, n: 1, f: 1, o: 0, gap: 1, first: '2026.01', last: '2026.01', ev: [] }],
} satisfies Universe
const lifecycleIndex: UniverseIndex = {
  universe: lifecycleUniverse,
  starsById: new Map([[lifecycleStar.id, lifecycleStar]]),
  questionsById: new Map(), answersById: new Map(),
  probesById: new Map([[lifecycleProbe.id, lifecycleProbe]]),
}

function expectEveryFailedScopeEmpty(action: () => unknown, failAt = 1): void {
  const sizes: number[] = []
  const originalDispose = ResourceScope.prototype.dispose
  const dispose = vi.spyOn(ResourceScope.prototype, 'dispose').mockImplementation(function (this: ResourceScope) {
    originalDispose.call(this)
    sizes.push(this.size)
  })
  try {
    __failResourceAfterForTests(failAt)
    expect(action).toThrow('injected resource failure')
    expect(sizes.length).toBeGreaterThan(0)
    expect(sizes).toEqual(sizes.map(() => 0))
  } finally {
    __failResourceAfterForTests(null)
    dispose.mockRestore()
  }
}

test('every rendering layer empties its ResourceScope after partial construction failure', () => {
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => undefined)
  const labelCanvas = document.createElement('canvas')
  vi.spyOn(labelCanvas, 'getContext').mockReturnValue({ clearRect: vi.fn() } as unknown as CanvasRenderingContext2D)
  try {
    const cases: Array<[string, () => unknown]> = [
      ['stars', () => makeStars(lifecycleUniverse, true, starData(lifecycleUniverse))],
      ['bodies', () => makeBodies(lifecycleIndex, true)],
      ['probe', () => makeProbe(lifecycleIndex, starData(lifecycleUniverse))],
      ['dust', () => makeDust(lifecycleUniverse, true)],
      ['rings', () => makeRings(lifecycleUniverse)],
      ['overlay', () => makeOverlay3D(lifecycleUniverse)],
      ['labels', () => new Labels(labelCanvas)],
      ['nebula', () => makeNebula(rendererStub, 60, palette, cinematicEnvironment('low'))],
    ]
    for (const [name, construct] of cases) {
      expectEveryFailedScopeEmpty(construct)
      expect(name).toBeTruthy()
    }
  } finally {
    update.mockRestore()
  }
})

test('renderer-style partial construction unwinds returned layers and renderer in reverse order', () => {
  const calls: string[] = []
  expect(() => ResourceScope.construct((scope) => {
    scope.defer(() => calls.push('webgl'))
    scope.defer(() => calls.push('stars'))
    scope.defer(() => calls.push('dust'))
    throw new Error('shader init failed')
  })).toThrow('shader init failed')
  expect(calls).toEqual(['dust', 'stars', 'webgl'])
})

test('destroy prevents released callbacks from running more than once', () => {
  const dispose = vi.fn()
  const scope = new ResourceScope()
  scope.defer(dispose)
  const destroy = scope.release()
  destroy()
  destroy()
  expect(dispose).toHaveBeenCalledOnce()
})

test('first successful frame reports ready exactly once', () => {
  const ready = vi.fn()
  const failed = vi.fn()
  const signals = new RendererSignals(ready, failed)
  expect(signals.frameSucceeded()).toBe(true)
  expect(signals.frameSucceeded()).toBe(false)
  expect(ready).toHaveBeenCalledOnce()
  expect(failed).not.toHaveBeenCalled()
})

test('a frame failure reports once and destroy suppresses late callbacks', () => {
  const ready = vi.fn()
  const failed = vi.fn()
  const signals = new RendererSignals(ready, failed)
  signals.frameFailed(new Error('frame failed'))
  signals.frameFailed(new Error('again'))
  signals.destroy()
  signals.frameSucceeded()
  expect(failed).toHaveBeenCalledOnce()
  expect(ready).not.toHaveBeenCalled()
})

test('an unrecoverable error after ready is still reported once', () => {
  const ready = vi.fn()
  const failed = vi.fn()
  const signals = new RendererSignals(ready, failed)
  signals.frameSucceeded()
  signals.frameFailed(new Error('late frame failure'))
  signals.frameFailed(new Error('duplicate'))
  expect(ready).toHaveBeenCalledOnce()
  expect(failed).toHaveBeenCalledOnce()
})

test('a star layer failure after its second GPU resource disposes both once', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  __failResourceAfterForTests(2)
  expect(() => makeStars(emptyUniverse, true, [])).toThrow('injected resource failure after 2')
  expect(geometryDispose).toHaveBeenCalledOnce()
  expect(materialDispose).toHaveBeenCalledOnce()
  geometryDispose.mockRestore()
  materialDispose.mockRestore()
})

test('a successfully constructed star layer disposes each GPU resource once', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  const layer = makeStars(emptyUniverse, true, [])
  layer.dispose()
  layer.dispose()
  expect(geometryDispose).toHaveBeenCalledOnce()
  expect(materialDispose).toHaveBeenCalledTimes(3)
  geometryDispose.mockRestore()
  materialDispose.mockRestore()
})

test('a body layer failure after its second material unwinds every registered resource once', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  try {
    __failResourceAfterForTests(6)
    expect(() => makeBodies(familyIndex, true)).toThrow('injected resource failure after 6')
    expect(geometryDispose).toHaveBeenCalledTimes(4)
    expect(materialDispose).toHaveBeenCalledTimes(2)
  } finally {
    __failResourceAfterForTests(null)
    geometryDispose.mockRestore()
    materialDispose.mockRestore()
  }
})

test('a fourth planet-family material failure unwinds all prior family resources once', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  const meshDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose')
  try {
    __failResourceAfterForTests(15)
    expect(() => makeBodies(familyIndex, true)).toThrow('injected resource failure after 15')
    expect(geometryDispose).toHaveBeenCalledTimes(7)
    expect(materialDispose).toHaveBeenCalledTimes(5)
    expect(meshDispose).toHaveBeenCalledTimes(3)
  } finally {
    __failResourceAfterForTests(null)
    geometryDispose.mockRestore()
    materialDispose.mockRestore()
    meshDispose.mockRestore()
  }
})

test('a body attribute failure unwinds preceding geometries and material once in reverse order', () => {
  const disposals: string[] = []
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
    .mockImplementation(function (this: THREE.BufferGeometry) { disposals.push(this.type) })
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
    .mockImplementation(function (this: THREE.ShaderMaterial) { disposals.push(this.type) })
  const originalSetAttribute = THREE.InstancedBufferGeometry.prototype.setAttribute
  let attributeCall = 0
  const setAttribute = vi.spyOn(THREE.InstancedBufferGeometry.prototype, 'setAttribute')
    .mockImplementation(function (this: THREE.InstancedBufferGeometry, name, attribute) {
      attributeCall += 1
      if (attributeCall === 10) throw new Error('injected planet attribute failure')
      return originalSetAttribute.call(this, name, attribute)
    })
  try {
    expect(() => makeBodies(familyIndex, true)).toThrow('injected planet attribute failure')
    expect(disposals).toEqual([
      'InstancedBufferGeometry', 'SphereGeometry', 'ShaderMaterial',
      'InstancedBufferGeometry', 'SphereGeometry',
    ])
  } finally {
    setAttribute.mockRestore()
    geometryDispose.mockRestore()
    materialDispose.mockRestore()
  }
})

test('a successfully constructed body layer disposes every GPU resource idempotently', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  const meshDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose')
  const layer = makeBodies(familyIndex, true)
  const planetMeshes = layer.group.children.filter((child): child is THREE.InstancedMesh => child instanceof THREE.InstancedMesh)
  layer.dispose()
  layer.dispose()
  expect(geometryDispose).toHaveBeenCalledTimes(8)
  expect(materialDispose).toHaveBeenCalledTimes(6)
  expect(meshDispose).toHaveBeenCalledTimes(4)
  expect(new Set(meshDispose.mock.instances)).toEqual(new Set(planetMeshes))
  geometryDispose.mockRestore()
  materialDispose.mockRestore()
  meshDispose.mockRestore()
})

test('a failure immediately after the first planet mesh registration rolls it back once', () => {
  const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose')
  const materialDispose = vi.spyOn(THREE.ShaderMaterial.prototype, 'dispose')
  const meshDispose = vi.spyOn(THREE.InstancedMesh.prototype, 'dispose')
  try {
    __failResourceAfterForTests(7)
    expect(() => makeBodies(familyIndex, true)).toThrow('injected resource failure after 7')
    expect(meshDispose).toHaveBeenCalledOnce()
    expect(geometryDispose).toHaveBeenCalledTimes(4)
    expect(materialDispose).toHaveBeenCalledTimes(2)
  } finally {
    __failResourceAfterForTests(null)
    geometryDispose.mockRestore()
    materialDispose.mockRestore()
    meshDispose.mockRestore()
  }
})

const rendererStub = {
  getRenderTarget: () => null,
  setRenderTarget: vi.fn(),
} as unknown as THREE.WebGLRenderer
const palette: [THREE.Color, THREE.Color, THREE.Color] = [
  new THREE.Color(0.1, 0.2, 0.3), new THREE.Color(0.3, 0.2, 0.4), new THREE.Color(0.1, 0.4, 0.5),
]

test('nebula core construction failure immediately unwinds all three baked cube targets', () => {
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => undefined)
  const targetDispose = vi.spyOn(THREE.WebGLCubeRenderTarget.prototype, 'dispose')
  __failResourceAfterForTests(16)
  expect(() => makeNebula(rendererStub, 60, palette, cinematicEnvironment('low')))
    .toThrow('injected resource failure after')
  expect(targetDispose).toHaveBeenCalledTimes(3)
  update.mockRestore()
  targetDispose.mockRestore()
})

test('a cube bake failure restores the renderer target and disposes its partial target', () => {
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => {
    throw new Error('cube bake failed')
  })
  const targetDispose = vi.spyOn(THREE.WebGLCubeRenderTarget.prototype, 'dispose')
  expect(() => makeNebula(rendererStub, 60, palette, cinematicEnvironment('low'))).toThrow('cube bake failed')
  expect(rendererStub.setRenderTarget).toHaveBeenCalledWith(null)
  expect(targetDispose).toHaveBeenCalledOnce()
  update.mockRestore()
  targetDispose.mockRestore()
})

test('a successfully baked nebula disposes its three targets idempotently', () => {
  const update = vi.spyOn(THREE.CubeCamera.prototype, 'update').mockImplementation(() => undefined)
  const targetDispose = vi.spyOn(THREE.WebGLCubeRenderTarget.prototype, 'dispose')
  const layer = makeNebula(rendererStub, 60, palette, cinematicEnvironment('low'))
  layer.dispose()
  layer.dispose()
  expect(targetDispose).toHaveBeenCalledTimes(3)
  update.mockRestore()
  targetDispose.mockRestore()
})
