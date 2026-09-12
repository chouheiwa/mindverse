import { describe, expect, it, vi } from 'vitest'
import type { Cluster } from '../../types'
import type { StarDatum } from '../gl/starData'
import { LabelLayer, type LabelProjection } from './labelLayer'

function canvasStub() {
  const context = {
    canvas: { width: 0, height: 0 },
    font: '', textAlign: '' as CanvasTextAlign, textBaseline: '' as CanvasTextBaseline,
    lineJoin: '' as CanvasLineJoin, miterLimit: 0, lineWidth: 0, strokeStyle: '', fillStyle: '',
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    measureText: vi.fn((text: string) => ({ width: text.length * 9 })),
    strokeText: vi.fn(),
    fillText: vi.fn(),
  } as unknown as CanvasRenderingContext2D
  const canvas = {
    width: 0, height: 0,
    getContext: vi.fn(() => context),
    getBoundingClientRect: () => ({ width: 1280, height: 720 }),
  } as unknown as HTMLCanvasElement
  return { canvas, context }
}

const cluster = (name: string, position: [number, number, number]): Cluster => (
  { g: 0, name, lead: name, c: position, n: 9, o: 1, f: 1, hue: 218, sat: 70, mem: [] } as Cluster
)

const starDatum = (): StarDatum => ({
  s: { c: 'Alpha' }, p: [0, 0, 0], bodyR: 0.6,
} as unknown as StarDatum)

const project = (): LabelProjection => ({ x: 640, y: 360, depth: 0.5, distance: 100 })

function setup() {
  const { canvas, context } = canvasStub()
  const layer = new LabelLayer(canvas)
  layer.resize(1280, 720, 2)
  return { layer, canvas, context }
}

const input = (overrides = {}) => ({
  clusters: [cluster('地层测试星群', [0, 0, 0])],
  stars: [],
  near: 1,
  far: 400,
  tooClose: 12,
  project,
  projectStar: () => ({ ...project(), radiusPx: 40 }),
  ...overrides,
})

describe('LabelLayer', () => {
  it('sizes the backing store by device pixel ratio', () => {
    const { canvas, context } = setup()
    expect(canvas.width).toBe(2560)
    expect(canvas.height).toBe(1440)
    expect(context.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0)
  })

  it('paints a cluster name that is in front of the camera', () => {
    const { layer, context } = setup()
    expect(layer.draw(input())).toBe(1)
    expect(context.fillText).toHaveBeenCalledWith('地层测试星群', 640, expect.any(Number))
  })

  it('paints surface labels (neighbours in the sky, signposts) with their own tone', () => {
    // 地表阶段没有星群名与恒星名，但天上的邻居、地上的路牌要有字。
    const { layer, context } = setup()
    const count = layer.draw(input({
      clusters: [],
      surface: [
        { text: '为什么大语言模型能写正则…', x: 300, y: 200, tone: 'sibling' },
        { text: '→ 正则', x: 900, y: 180, tone: 'wormhole' },
      ],
    }))
    expect(count).toBe(2)
    expect(context.fillText).toHaveBeenCalledWith('为什么大语言模型能写正则…', 300, 200)
    expect(context.fillText).toHaveBeenCalledWith('→ 正则', 900, 180)
  })

  it('drops a centroid that has come too close to sit across the frame', () => {
    const { layer } = setup()
    expect(layer.draw(input({ project: () => ({ x: 640, y: 360, depth: 0.5, distance: 4 }) }))).toBe(0)
  })

  it('drops anything behind the camera or past the far plane', () => {
    const { layer } = setup()
    for (const depth of [-0.2, 1.4]) {
      expect(layer.draw(input({ project: () => ({ x: 640, y: 360, depth, distance: 100 }) }))).toBe(0)
    }
  })

  it('fades a star name out once its disc is too small to earn one', () => {
    const { layer } = setup()
    const stars = [{ star: starDatum(), opacity: 1 }]
    expect(layer.draw(input({ clusters: [], stars }))).toBe(1)
    expect(layer.draw(input({
      clusters: [], stars, projectStar: () => ({ ...project(), radiusPx: 0.2 }),
    }))).toBe(0)
  })

  it('clears the canvas on dispose and stops drawing', () => {
    const { layer, context } = setup()
    layer.dispose()
    expect(context.clearRect).toHaveBeenCalled()
    expect(layer.draw(input())).toBe(0)
  })
})
