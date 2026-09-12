import type { Cluster } from '../../types'
import { starColor } from '../gl/blackbody'
import type { StarDatum } from '../gl/starData'
import { starLabelOpacity, type StarLabelVisibility } from '../labelVisibility'
import { paintLabels, type PaintableLabel } from '../labelPainter'

// 星群名与重要恒星名。
//
// 唯一留在 Canvas 2D 上的东西。投影用 Babylon 的相机，排版与去重叠复用
// labelPainter —— 两个渲染器画出同一套字，而不是各写一份。

export interface LabelProjection {
  /** CSS 像素坐标。 */
  readonly x: number
  readonly y: number
  /** 归一化深度；落在 [0,1] 之外表示在相机背后或超出远平面。 */
  readonly depth: number
  /** 到相机的世界距离，用于与恒星同式的景深淡出。 */
  readonly distance: number
}

export type SurfaceLabelTone = 'sibling' | 'wormhole' | 'signpost'

/** 地表阶段的字：天上的邻居、地上的路牌。x/y 已是最终落笔位置。 */
export interface SurfaceLabel {
  readonly text: string
  readonly x: number
  readonly y: number
  readonly tone: SurfaceLabelTone
}

const SURFACE_TINT: Record<SurfaceLabelTone, readonly [number, number, number]> = {
  sibling: [0.72, 0.84, 1],
  wormhole: [0.35, 0.95, 0.85],
  signpost: [0.98, 0.84, 0.46],
}

export interface LabelFrame {
  readonly clusters: readonly Cluster[]
  readonly surface?: readonly SurfaceLabel[]
  readonly stars: readonly StarLabelVisibility[]
  readonly near: number
  readonly far: number
  /** 比这更近的星群质心不画名字 —— 飞进恒星系时它会横在画面正中。 */
  readonly tooClose: number
  readonly project: (point: readonly [number, number, number]) => LabelProjection
  readonly projectStar: (star: StarDatum) => LabelProjection & { readonly radiusPx: number }
}

export class LabelLayer {
  private readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  private width = 0
  private height = 0
  private disposed = false

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas
    const context = canvas.getContext('2d')
    if (!context) throw new Error('2D label canvas is unavailable')
    this.context = context
  }

  resize(width: number, height: number, devicePixelRatio: number): void {
    if (this.disposed) return
    this.width = Math.max(1, width)
    this.height = Math.max(1, height)
    this.canvas.width = Math.round(this.width * devicePixelRatio)
    this.canvas.height = Math.round(this.height * devicePixelRatio)
    this.context.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0)
  }

  /** @returns 实际画出的标签数量。 */
  draw(frame: LabelFrame): number {
    if (this.disposed) return 0
    const labels: PaintableLabel[] = []

    for (const cluster of frame.clusters) {
      const projected = frame.project(cluster.c)
      if (projected.depth <= 0 || projected.depth >= 1) continue
      // 飞进恒星系时，某个星群质心可能就贴在相机脸上
      if (projected.distance < frame.tooClose) continue
      // 与恒星的 depthFade 同式。不能用归一化深度：远平面被星云壳撑到了 90R，
      // 星系里所有东西的深度都挤在 0.997 以上，拿它做淡出等于全灭。
      const span = Math.max(1e-3, frame.far - frame.near)
      const depthFade = Math.min(1, Math.max(0, (frame.far - projected.distance) / span))
      // 下限 0.5：远处的星群名可以淡，但不能淡到读不出来 —— 它是导航信息
      const tint = starColor(cluster.hue, cluster.sat)
      labels.push({
        text: cluster.name,
        x: projected.x,
        y: projected.y - 15,
        opacity: Math.min(1, 0.96 * (0.5 + 0.5 * depthFade * depthFade)),
        tint: [tint[0], tint[1], tint[2]],
      })
    }

    for (const { star, opacity: ownerAlpha } of frame.stars) {
      const projected = frame.projectStar(star)
      if (projected.depth <= 0 || projected.depth >= 1) continue
      const opacity = starLabelOpacity(projected.radiusPx) * ownerAlpha
      if (opacity <= 0) continue
      labels.push({
        text: star.s.c,
        x: projected.x,
        y: projected.y - 12,
        opacity,
        tint: [0.48, 0.62, 1],
      })
    }

    for (const label of frame.surface ?? []) {
      labels.push({ text: label.text, x: label.x, y: label.y, opacity: 0.94, tint: SURFACE_TINT[label.tone] })
    }

    return paintLabels(this.context, { width: this.width, height: this.height }, labels)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.context.clearRect(0, 0, this.width, this.height)
  }
}
