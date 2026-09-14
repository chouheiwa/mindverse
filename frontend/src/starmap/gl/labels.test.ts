import { expect, test, vi } from 'vitest'
import * as THREE from 'three'
import type { Universe } from '../../types'
import { Labels } from './labels'
import { starData, starWorldPosition } from './starData'
import { starLabelOpacity, visibleClusterLabels, visibleStarLabels } from '../labelVisibility'

const universe = {
  meta: { items: 0, concepts: 2, clusters: 1, own: 0, fav: 0, span: [0, 0], medz: 0, p10z: 0, source: 'test', splits: 0 },
  clusters: [{ g: 3, name: 'cluster', lead: 'a', c: [0, 0, 0], n: 2, o: 0, f: 0, hue: 0, sat: 0, mem: ['a', 'b'] }],
  stars: [
    { c: 'a', g: 3, p: [1, 0, 0], n: 10, o: 0, f: 0, hue: 0, sat: 0, pe: 1, bu: 0, fi: '', la: '', ev: [] },
    { c: 'b', g: 3, p: [-1, 0, 0], n: 10, o: 0, f: 0, hue: 0, sat: 0, pe: 1, bu: 0, fi: '', la: '', ev: [] },
  ],
  particles: [], wormholes: [], solo: [], dark: [], nebula: [],
} as Universe

test('draw uses animated star coordinates and exact owner alpha through a to b to null', () => {
  const draws: { text: string; x: number; y: number; fill: string }[] = []
  const ctx = {
    clearRect: vi.fn(), setTransform: vi.fn(), measureText: (text: string) => ({ width: text.length * 8 }),
    strokeText: vi.fn(),
    fillText(text: string, x: number, y: number) { draws.push({ text, x, y, fill: this.fillStyle }) },
    fillStyle: '', strokeStyle: '', font: '', textAlign: '', textBaseline: '', lineJoin: '', miterLimit: 0, lineWidth: 0,
  }
  const canvas = document.createElement('canvas')
  canvas.getContext = vi.fn(() => ctx) as unknown as typeof canvas.getContext
  const labels = new Labels(canvas)
  labels.resize(400, 400, 1)
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100)
  camera.position.set(0, 0, 5)
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const stars = starData(universe)
  const elapsed = 2317

  const drawFor = (focus: typeof stars[number] | null) => {
    draws.length = 0
    labels.draw(
      camera,
      1,
      visibleClusterLabels(universe.clusters, focus?.s.g ?? null),
      visibleStarLabels(stars, focus),
      elapsed,
      1.35,
      1,
      100,
    )
    return Object.fromEntries(draws.map((draw) => [draw.text, draw]))
  }

  const a = drawFor(stars[0])
  expect(a.a.fill).toBe('rgba(240,244,255,1.000)')
  expect(a.b.fill).toBe('rgba(240,244,255,0.120)')
  const world = starWorldPosition(stars[0], elapsed, 1.35, new THREE.Vector3()).project(camera)
  expect(a.a.x).toBeCloseTo((world.x * 0.5 + 0.5) * 400)
  expect(a.a.y).toBeCloseTo((-world.y * 0.5 + 0.5) * 400 - 12)

  const b = drawFor(stars[1])
  expect(b.a.fill).toBe('rgba(240,244,255,0.120)')
  expect(b.b.fill).toBe('rgba(240,244,255,1.000)')
  const panorama = drawFor(null)
  expect(Object.keys(panorama)).toEqual(['cluster星系'])

  // Put the star inside the 18→42px transition and prove alpha uses its animated viewZ,
  // not the layout's static z coordinate.
  camera.position.z = 14
  camera.lookAt(0, 0, 0)
  camera.updateMatrixWorld()
  const transitioned = drawFor(stars[0])
  const animated = starWorldPosition(stars[0], elapsed, 1.35, new THREE.Vector3())
  const viewZ = -animated.clone().applyMatrix4(camera.matrixWorldInverse).z
  const projectionScale = 200 / Math.tan(Math.PI / 6)
  const expectedAlpha = starLabelOpacity(stars[0].bodyR * projectionScale / viewZ)
  const staticAlpha = starLabelOpacity(stars[0].bodyR * projectionScale / 14)
  expect(expectedAlpha).not.toBeCloseTo(staticAlpha, 3)
  expect(transitioned.a.fill).toBe(`rgba(240,244,255,${expectedAlpha.toFixed(3)})`)
  labels.dispose()
})
