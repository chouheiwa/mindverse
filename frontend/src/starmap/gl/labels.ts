import * as THREE from 'three'
import type { Cluster, Universe } from '../../types'
import { starColor } from './blackbody'
import { ResourceScope, type ResourceCleanup } from '../resourceScope'
import { starLabelOpacity } from '../labelVisibility'
import { starData, type StarDatum } from './starData'

// 星群名。
//
// 唯一留在 Canvas 2D 上的东西 —— 文字就该用文字渲染器画。它铺在 WebGL
// 画布之上、不参与 bloom，这是对的：让标签发光只会让它们变得读不清。
//
// 按规模优先、重叠即跳过。放大后小星群的名字会重新出现，这是刻意的：
// 缩放本身就是一层信息层级。

export class Labels {
  private canvas: HTMLCanvasElement
  private ctx: CanvasRenderingContext2D
  private w = 0
  private h = 0
  private v = new THREE.Vector3()
  private v2 = new THREE.Vector3()
  private disposeResources: ResourceCleanup
  private stars: StarDatum[]

  constructor(canvas: HTMLCanvasElement, u: Universe) {
    const scope = new ResourceScope()
    try {
      this.canvas = canvas
      this.stars = starData(u)
      const context = canvas.getContext('2d')
      if (!context) throw new Error('2D label canvas is unavailable')
      this.ctx = context
      scope.defer(() => this.clear())
      this.disposeResources = scope.release()
    } catch (cause) {
      scope.dispose()
      throw cause
    }
  }

  resize(w: number, h: number, dpr: number) {
    this.w = w
    this.h = h
    this.canvas.width = Math.round(w * dpr)
    this.canvas.height = Math.round(h * dpr)
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  clear() {
    this.ctx.clearRect(0, 0, this.w, this.h)
  }

  dispose() {
    this.disposeResources()
  }

  /** 比这更近的星群质心不画名字 —— 飞进恒星系时它会横在画面正中。 */
  tooClose = 0

  draw(
    camera: THREE.PerspectiveCamera,
    converge: number,
    clusters: readonly Cluster[],
    focusStar: StarDatum | null,
    near: number,
    far: number,
  ) {
    const ctx = this.ctx
    ctx.clearRect(0, 0, this.w, this.h)
    if (converge < 0.88) return
    const la = Math.min((converge - 0.88) * 8, 1)

    // 描边而不是投影。shadowBlur 是把字往外糊一圈，字本身的边缘反而更软；
    // 深色描边 + 亮色填充才是在杂乱背景上保持字形锐利的做法。
    ctx.font = '600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2

    const boxes: [number, number, number, number][] = []

    const ordered = clusters
      .map((c) => {
        this.v.set(c.c[0], c.c[1], c.c[2]).project(camera)
        return { c, ndc: { x: this.v.x, y: this.v.y, z: this.v.z } }
      })
      // z 在 [-1,1] 之外表示在相机背后或超出远平面
      .filter((o) => o.ndc.z > -1 && o.ndc.z < 1)

    for (const { c, ndc } of ordered) {
      const x = (ndc.x * 0.5 + 0.5) * this.w
      const y = (-ndc.y * 0.5 + 0.5) * this.h
      if (x < -80 || x > this.w + 80 || y < -40 || y > this.h + 40) continue

      // 与恒星的 depthFade 同式。不能用 ndc.z：远平面被星云壳撑到了 90R，
      // 星系里所有东西的 ndc.z 都挤在 0.997 以上，拿它做淡出等于全灭。
      const d = this.v2.set(c.c[0], c.c[1], c.c[2]).distanceTo(camera.position)
      // 飞进恒星系时，某个星群质心可能就贴在相机脸上，它的名字会横在画面正中
      if (d < this.tooClose) continue
      const t = Math.min(1, Math.max(0, (far - d) / Math.max(1e-3, far - near)))
      // 下限 0.5：远处的星群名可以淡，但不能淡到读不出来 —— 它是导航信息
      const df = 0.5 + 0.5 * t * t
      const ly = y - 15

      const wdt = ctx.measureText(c.name).width
      const box: [number, number, number, number] = [x - wdt / 2 - 7, ly - 14, x + wdt / 2 + 7, ly + 6]
      if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue
      boxes.push(box)

      const a = Math.min(1, 0.96 * la * df)
      const rgb = starColor(c.hue, c.sat)
      const r = Math.round(226 + 29 * rgb[0])
      const g = Math.round(226 + 29 * rgb[1])
      const b = Math.round(226 + 29 * rgb[2])

      ctx.lineWidth = 3.5
      ctx.strokeStyle = `rgba(3,5,12,${(a * 0.92).toFixed(3)})`
      ctx.strokeText(c.name, x, ly)
      ctx.fillStyle = `rgba(${Math.min(255, r)},${Math.min(255, g)},${Math.min(255, b)},${a.toFixed(3)})`
      ctx.fillText(c.name, x, ly)
    }

    if (!focusStar) return
    const projectionScale = (this.h * 0.5) / Math.tan((camera.fov * Math.PI) / 360)
    for (const star of this.stars) {
      if (star.s.g !== focusStar.s.g) continue
      this.v.set(star.s.p[0], star.s.p[1], star.s.p[2])
      this.v2.copy(this.v).applyMatrix4(camera.matrixWorldInverse)
      const viewZ = Math.max(1, -this.v2.z)
      const opacity = starLabelOpacity(star.bodyR * projectionScale / viewZ) * la
      if (opacity <= 0) continue
      this.v.project(camera)
      if (this.v.z <= -1 || this.v.z >= 1) continue
      const x = (this.v.x * 0.5 + 0.5) * this.w
      const y = (-this.v.y * 0.5 + 0.5) * this.h - 12
      ctx.lineWidth = 3
      ctx.strokeStyle = `rgba(3,5,12,${(opacity * 0.92).toFixed(3)})`
      ctx.strokeText(star.s.c, x, y)
      ctx.fillStyle = `rgba(240,244,255,${opacity.toFixed(3)})`
      ctx.fillText(star.s.c, x, y)
    }
  }
}
