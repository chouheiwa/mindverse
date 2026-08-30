import * as THREE from 'three'
import { BlendFunction, BloomEffect, ChromaticAberrationEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import type { Mode, Star, Universe } from '../types'
import type { UniverseIndex } from '../domain/universe'
import { orbit } from './projection'
import { makeNebula, type NebulaLayer } from './gl/nebula'
import { makeStars, modeDim, renderDim, type StarLayer } from './gl/stars'
import { makeBodies, type BodyLayer, type PlanetDatum } from './gl/bodies'
import { starData, type StarDatum } from './gl/starData'
import { makeDust, type DustLayer } from './gl/dust'
import { makeRings, type RingLayer } from './gl/rings'
import { makeOverlay3D, type Overlay3D } from './gl/overlay3d'
import { Labels } from './gl/labels'
import { FOV, nebulaPalette, sceneRadius } from './gl/scene'
import { detectQuality, type Quality } from './quality'
import { findQuestionPlanet, planetPickVisible } from './planetVisibility'

/**
 * 星图渲染器。
 *
 * 从 Canvas 2D 换成了 WebGL，原因不是性能是画质：Canvas 2D 的合成在
 * sRGB 空间做、颜色硬钳在 [0,1]，多颗星的辉光一叠加就全部塌成同一个纯白，
 * 所以密集区永远糊、边缘永远是一圈生硬的渐变环。
 * 亮度必须能留在 1.0 以上，最后再由 tone mapping 压回来 —— 这是 HDR 管线
 * 才能做的事，也是「像不像深空摄影」的分水岭。
 *
 * 管线：HalfFloat 渲染目标 + MSAA → 加性点云 → BloomEffect → Neutral tone map。
 *
 * tone mapping 刻意不用 ACES：本图里颜色是数据（琥珀=收藏、蓝白=创作，
 * 见 gl/blackbody.ts），ACES 那条胶片曲线会把它染歪。
 *
 * 刻意不由 React 驱动：canvas 每帧重绘，挂在组件重渲染上会掉帧。
 * React 只负责外壳（面板、模式条），通过命令式方法与这里通信。
 */
export interface RendererCallbacks {
  onPick?: (star: Star | null) => void
  /** 点中一颗问题行星（= 一个被恒星引用的真实知乎问题）。传 null 表示取消选中。 */
  onPickPlanet?: (p: PlanetDatum | null) => void
  /**
   * 选中行星在屏幕上的位置，每帧回调。
   *
   * 走命令式而不是 React state：行星一直在公转，挂到状态上就是每帧重渲染。
   */
  onAnchor?: (x: number, y: number, visible: boolean) => void
  onGenesisEnd?: () => void
}

const CONVERGE_FROM = 1800
const CONVERGE_MS = 3400
const SKIP_MS = 500
/** 星体拾取的屏幕命中半径上下限（CSS 像素）。 */
const HIT_MIN = 11
const HIT_MAX = 46
/** 行星的最小命中半径。行星很小，纯按投影半径判会点不中。 */
const PLANET_HIT_MIN = 13
/**
 * 飞入一个恒星系后的相机距离。
 *
 * 恒星系外缘约 8 个世界单位（见 gl/bodies.ts 的 ORBIT_BASE/STEP），
 * 60° 视场下 8/tan(30°) ≈ 13.9 刚好铺满，留一点余量取 16。
 */
const SYSTEM_DIST = 16
const SYSTEM_NEAR = 4.5
/**
 * 跟随一颗行星时的相机距离。
 *
 * 取轨道半径的 0.8 倍：相机与恒星到行星的距离同量级，于是行星在近景、
 * 恒星在它背后当光源，两者都在画面里。夹在 2.8–6.0，内圈行星不至于被
 * 恒星糊满屏，外圈行星也不至于小成一个点。
 */
const PLANET_NEAR = 1.2
function planetDist(orbitR: number) {
  return clamp(orbitR * 0.8, 2.8, 6.0)
}

export class Renderer {
  private renderer: THREE.WebGLRenderer
  private scene = new THREE.Scene()
  private camera: THREE.PerspectiveCamera
  private composer: EffectComposer

  private nebula: NebulaLayer
  private stars: StarLayer
  private bodies: BodyLayer
  private dust: DustLayer
  private rings: RingLayer | null
  private overlay: Overlay3D
  private labels: Labels

  private raf = 0
  private w = 0
  private h = 0
  private dpr = 1

  /** 场景包围半径，相机距离、景深范围、星云尺度全都由它导出。 */
  private R: number

  private yaw = 0.5
  private pitch = -0.2
  private dist: number
  private targetDist: number

  private t0: number | null = null
  private lastNow = 0
  private lastTouch = -1e9
  private skipAt: number | null = null
  private genesisDone: boolean

  private mode: Mode = 'all'
  private wormIdx = 0
  private quality: Quality
  /** 色差 effect；Low 档为 null（不创建）。Session 4 穿越时把 offset 拉到峰值。 */
  private ca: ChromaticAberrationEffect | null = null

  /**
   * 注视点。
   *
   * 相机绕它公转而不是绕原点 —— 点一颗恒星就飞过去，注视点跟着那颗星一起
   * 公转。LOD 靠的是屏幕上的实际大小，所以飞近这个动作本身就会让球体、
   * 行星和轨道依次浮现，不需要另开一个「恒星系模式」。
   */
  private focus = new THREE.Vector3()
  private focusStar: StarDatum | null = null
  private wantFocus = new THREE.Vector3()
  /**
   * 注视点相对目标的残余偏移，指数衰减到 0。
   *
   * 不用 focus.lerp(want) 追目标：那是一阶低通，追一个匀速运动的目标会留下
   * 一个恒定滞后 v·τ —— 行星一直在公转，于是它永远偏在画面一侧、追不到中心。
   * 改成「目标位置 + 一个自己衰减到零的偏移」，稳态误差就是 0。
   */
  private focusOff = new THREE.Vector3()
  /** 目标刚换过，下一帧重新量一次偏移 */
  private retarget = true
  private selected: PlanetDatum | null = null
  private convergence: number
  private depthNear = 1
  private depthFar = 4000

  private dragging = false
  private lx = 0
  private ly = 0
  private moved = 0

  private tmp = new THREE.Vector3()
  private tmp2 = new THREE.Vector3()
  private lost = false

  private canvas: HTMLCanvasElement
  private u: Universe
  private reduceMotion: boolean
  private cb: RendererCallbacks

  constructor(
    canvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    index: UniverseIndex,
    reduceMotion: boolean,
    cb: RendererCallbacks = {},
    quality: Quality = detectQuality(reduceMotion),
  ) {
    this.canvas = canvas
    const u = index.universe
    this.u = u
    this.reduceMotion = reduceMotion
    this.cb = cb
    this.genesisDone = reduceMotion
    this.convergence = reduceMotion ? 1 : 0
    this.quality = quality

    this.R = sceneRadius(u)
    this.dist = this.R * 4.6
    this.targetDist = this.R * 1.62

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,          // 交给 composer 的 MSAA，在 HDR 目标上做
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
    })
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    // tone mapping 在 composer 里做，渲染器这一层必须放行，否则会压两次
    this.renderer.toneMapping = THREE.NoToneMapping

    // 远平面要盖住最外层星云壳的对角（27R × √3 ≈ 47R）
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, this.R * 90)

    const data = starData(u)
    this.nebula = makeNebula(this.renderer, this.R, nebulaPalette(u))
    this.stars = makeStars(u, reduceMotion, data)
    this.bodies = makeBodies(index, reduceMotion)
    this.dust = makeDust(u, reduceMotion)
    this.rings = makeRings(u)
    this.overlay = makeOverlay3D(u)
    this.labels = new Labels(labelCanvas, u)

    this.scene.add(this.nebula.group, this.dust.group, this.bodies.group, this.stars.group, this.overlay.group)
    if (this.rings) this.scene.add(this.rings.object)

    // MSAA 只有 WebGL2 有；WebGL1 上退化成无抗锯齿，轨道环会毛一点，不致命
    const gl = this.renderer.getContext()
    const maxSamples = typeof WebGL2RenderingContext !== 'undefined'
      && gl instanceof WebGL2RenderingContext
      ? (gl.getParameter(gl.MAX_SAMPLES) as number)
      : 0
    this.composer = new EffectComposer(this.renderer, {
      frameBufferType: THREE.HalfFloatType,   // 保住 >1.0 的值，热星才会真的 bloom
      multisampling: Math.min(4, Number.isFinite(maxSamples) ? maxSamples : 0),
      // 行星必须被恒星正确遮挡，所以这条管线要深度缓冲。
      // 其余图层（星云、尘埃、辉光、星芒）依旧 depthTest:false 叠在上面。
      depthBuffer: true,
      stencilBuffer: false,
    })
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,          // 多级 mip 混合，比单核高斯的方形光晕干净
      luminanceThreshold: 0.68,
      luminanceSmoothing: 0.30,
      intensity: 1.02,
      radius: 0.74,
      levels: 8,
    })

    // 色差：电影感的低成本来源，不依赖深度、不碰点精灵。Low 档不创建。
    // 径向调制：中心弱、边缘强（真镜头色差的样子）。
    // Session 4 虫洞穿越时会把 offset 瞬时拉到峰值（~0.02）。
    if (this.quality !== 'low') {
      this.ca = new ChromaticAberrationEffect({
        offset: new THREE.Vector2(0.003, 0.003),
        radialModulation: true,
        modulationOffset: 0.15,
      })
    }

    // 管线顺序 = §7.6：Bloom → 色差 → ToneMap（GravitationalLens 由 Session 5 插入）。
    const effects = this.ca
      ? [bloom, this.ca, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })]
      : [bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })]
    this.composer.addPass(new EffectPass(this.camera, ...effects))

    this.applyMode()
    this.bindPointer()
    this.resize()
  }

  // ── 对外 ──

  start() {
    if (!this.raf) this.raf = requestAnimationFrame(this.frame)
  }

  stop() {
    if (this.raf) cancelAnimationFrame(this.raf)
    this.raf = 0
  }

  destroy() {
    this.stop()
    this.unbindPointer()
    this.labels.clear()
    this.nebula.dispose()
    this.stars.dispose()
    this.bodies.dispose()
    this.dust.dispose()
    this.rings?.dispose()
    this.overlay.dispose()
    this.composer.dispose()
    this.renderer.dispose()
  }

  setMode(mode: Mode, wormIdx = this.wormIdx) {
    this.mode = mode
    this.wormIdx = wormIdx
    // 模式是全局视角，聚焦在单个恒星系上看不出全局，先退回来
    if (mode !== 'all') this.resetView()
    this.applyMode()
  }

  /** 退回星系全景。面板关闭、切模式时调用。 */
  resetView() {
    this.focusStar = null
    this.targetDist = this.R * 1.62
    this.retarget = true
    this.clearPlanet()
  }

  /** 取消行星选中，镜头退回恒星系视角。 */
  clearPlanet() {
    if (!this.selected) return
    this.selected = null
    this.bodies.setSelected(-1)
    this.cb.onAnchor?.(0, 0, false)
    this.cb.onPickPlanet?.(null)
    this.retarget = true
    // resetView 会先把 focusStar 清掉再调这里，所以那条路径不会被覆盖
    if (this.focusStar) this.targetDist = SYSTEM_DIST
  }

  /** Semantic-list equivalent of pointer picking. */
  selectQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    const planet = findQuestionPlanet(this.bodies.planets, starId, questionId)
    if (planet) this.selectPlanet(planet)
    return planet
  }

  /** Re-establish the selected planet and camera after leaving its reading workspace. */
  restoreQuestionPlanet(starId: string, questionId: string): PlanetDatum | null {
    return this.selectQuestionPlanet(starId, questionId)
  }

  /** Keep the live scene visible but quiet and non-interactive behind the reading workspace. */
  setWorkspaceOpen(open: boolean) {
    this.canvas.style.pointerEvents = open ? 'none' : ''
    this.canvas.style.filter = open ? 'brightness(.55) saturate(.72)' : ''
  }

  skipGenesis() {
    if (this.skipAt === null) this.skipAt = performance.now()
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect()
    this.dpr = Math.min(window.devicePixelRatio || 1, 2)
    this.w = Math.max(1, rect.width)
    this.h = Math.max(1, rect.height)

    this.renderer.setPixelRatio(this.dpr)
    this.renderer.setSize(this.w, this.h, false)
    this.composer.setSize(this.w, this.h)
    this.camera.aspect = this.w / this.h
    this.camera.updateProjectionMatrix()
    this.labels.resize(this.w, this.h, this.dpr)
  }

  // ── 主循环 ──

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame)
    if (this.lost) return

    if (this.t0 === null) {
      this.t0 = now
      this.lastNow = now
    }
    const dt = Math.min((now - this.lastNow) / 1000, 0.05)
    this.lastNow = now

    const A = this.reduceMotion ? 0 : now - this.t0

    // 跳过创世：收敛与点火各自补一段 500ms 的缓动，硬跳会很刺眼
    const skipK = this.skipAt === null ? 0 : clamp((now - this.skipAt) / SKIP_MS, 0, 1)
    const natural = this.reduceMotion ? 1 : clamp((A - CONVERGE_FROM) / CONVERGE_MS, 0, 1)
    const conv = Math.max(1 - Math.pow(1 - natural, 3), skipK)
    this.convergence = conv
    const litFloor = this.reduceMotion ? 1 : skipK

    if (!this.reduceMotion && now - this.lastTouch > 3500 && conv > 0.95) {
      this.yaw += 0.085 * dt
    }

    // 注视点：选中行星就跟着行星走，否则跟着恒星，都没有就回星系中心。
    //
    // 跟行星的插值要快得多：行星一直在公转，跟慢了它就一路飘到画面边上 ——
    // 而卡片是钉在行星上的，卡片也会跟着飘出去。
    if (this.selected) {
      this.planetWorld(this.selected, A, this.wantFocus)
    } else if (this.focusStar) {
      this.starWorld(this.focusStar, A, this.wantFocus)
    } else {
      this.wantFocus.set(0, 0, 0)
    }
    if (this.retarget) {
      this.focusOff.copy(this.focus).sub(this.wantFocus)
      this.retarget = false
    }
    // 全部按时间衰减，不按帧 —— 按帧的话掉到 30fps 滞后就翻倍，
    // 跟随行星时直接表现为它偏出画面
    const rate = this.selected ? 9 : this.focusStar ? 6 : 4
    this.focusOff.multiplyScalar(Math.exp(-rate * dt))
    if (this.focusOff.lengthSq() < 1e-6) this.focusOff.set(0, 0, 0)
    this.focus.copy(this.wantFocus).add(this.focusOff)

    // 飞入时，注视点没到位之前先不收距离。反过来的话，相机会在原点附近就收到
    // 16 个单位，再拖着这个距离横扫过整个星系 —— 一路擦着别的恒星穿过去。
    //
    // 只在「往里收」时刹车。退出时注视点同样在半路上，那时再刹车会让
    // 返回全景变得又慢又粘。
    const closingIn = this.targetDist < this.dist
    const hold = closingIn ? smooth(this.focusOff.length(), this.R * 0.03, this.R * 0.45) : 0
    this.dist += (this.targetDist - this.dist) * (1 - Math.exp(-3.4 * dt * (1 - 0.9 * hold)))

    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * Math.cos(this.pitch) * this.dist,
      this.focus.y - Math.sin(this.pitch) * this.dist,
      this.focus.z + Math.cos(this.yaw) * Math.cos(this.pitch) * this.dist,
    )
    this.camera.lookAt(this.focus)

    // 色差为常驻径向效果，构造时定死 offset，无需每帧更新。

    // 景深范围按相机到星系中心的距离算，而不是到注视点的距离 ——
    // 飞进一个恒星系之后，星系另一侧依旧该是压暗的
    const originDist = this.camera.position.length()
    const near = Math.max(1, originDist - this.R * 1.15)
    const far = originDist + this.R * 1.75
    this.depthNear = near
    this.depthFar = far
    const projScale = (this.h * this.dpr * 0.5) / Math.tan((FOV * Math.PI) / 360)

    for (const l of [this.stars, this.dust, this.overlay, this.bodies]) {
      l.setUniform('uT', A)
      l.setUniform('uConverge', conv)
      l.setUniform('uProjScale', projScale)
      l.setUniform('uNear', near)
      l.setUniform('uFar', far)
    }
    this.stars.setUniform('uLitFloor', litFloor)
    this.bodies.setUniform('uLitFloor', litFloor)
    this.rings?.setUniform('uConverge', conv)
    this.rings?.setUniform('uNear', near)
    this.rings?.setUniform('uFar', far)
    // 星云按方向采样，亮度与距离无关 —— 飞进一个恒星系之后，画面上只剩
    // 几个天体，星云就成了压倒性的奶白底。它是背景，靠近时必须退场。
    const nearK = 0.22 + 0.78 * smooth(this.dist, this.R * 0.35, this.R * 1.1)
    this.nebula.setDim((this.mode === 'all' ? 1 : 0.48) * nearK)
    this.nebula.update(A * 0.001, this.camera)

    if (this.selected && this.cb.onAnchor) {
      this.planetWorld(this.selected, A, this.tmp)
      const v = this.tmp.project(this.camera)
      const on = v.z > -1 && v.z < 1
      this.cb.onAnchor(
        (v.x * 0.5 + 0.5) * this.w,
        (-v.y * 0.5 + 0.5) * this.h,
        on,
      )
    }

    this.composer.render()
    this.labels.tooClose = this.R * 0.2
    this.labels.draw(this.camera, conv, this.mode, this.wormIdx, near, far)

    if (!this.genesisDone && (skipK >= 1 || A > this.stars.igniteEnd)) {
      this.genesisDone = true
      this.cb.onGenesisEnd?.()
    }
  }

  private applyMode() {
    this.stars.setDim(this.mode, this.u, this.wormIdx)
    this.bodies.setMode(this.mode, this.u, this.wormIdx)
    this.dust.setMode(this.mode, this.u, this.wormIdx)
    this.rings?.setMode(this.mode, this.u, this.wormIdx)
    this.overlay.setActiveWorm(this.wormIdx)
    this.overlay.setWormVisible(this.mode === 'worm')
    // 暗物质常驻，只是平时很淡 —— 它得一直在那儿，进了模式才被点亮。
    // 全景里压到 0.14：三个大琥珀环会立刻抢走整张图的构图。
    this.overlay.setEmphasis(this.mode === 'dark' ? 1 : 0.14)
  }

  // ── 交互 ──

  private bindPointer() {
    const c = this.canvas
    c.addEventListener('pointerdown', this.onDown)
    c.addEventListener('pointermove', this.onMove)
    c.addEventListener('pointerup', this.onUp)
    c.addEventListener('wheel', this.onWheel, { passive: false })
    c.addEventListener('webglcontextlost', this.onContextLost)
    c.addEventListener('webglcontextrestored', this.onContextRestored)
  }

  private unbindPointer() {
    const c = this.canvas
    c.removeEventListener('pointerdown', this.onDown)
    c.removeEventListener('pointermove', this.onMove)
    c.removeEventListener('pointerup', this.onUp)
    c.removeEventListener('wheel', this.onWheel)
    c.removeEventListener('webglcontextlost', this.onContextLost)
    c.removeEventListener('webglcontextrestored', this.onContextRestored)
  }

  private onContextLost = (e: Event) => {
    e.preventDefault()
    this.lost = true
  }

  private onContextRestored = () => {
    this.lost = false
    this.resize()
  }

  private onDown = (e: PointerEvent) => {
    this.lastTouch = performance.now()
    this.dragging = true
    this.moved = 0
    this.lx = e.clientX
    this.ly = e.clientY
    this.canvas.setPointerCapture(e.pointerId)
  }

  private onMove = (e: PointerEvent) => {
    if (!this.dragging) {
      // 悬停变指针。「每颗天体都能点」这件事得靠光标自己说，
      // 五百多次投影在一次 pointermove 里可以忽略不计
      const rect = this.canvas.getBoundingClientRect()
      const hx = e.clientX - rect.left
      const hy = e.clientY - rect.top
      const over = this.hitPlanet(hx, hy) !== null || this.hitStar(hx, hy) !== null
      const want = over ? 'pointer' : ''
      if (this.canvas.style.cursor !== want) this.canvas.style.cursor = want
      return
    }
    this.lastTouch = performance.now()
    const dx = e.clientX - this.lx
    const dy = e.clientY - this.ly
    this.moved += Math.abs(dx) + Math.abs(dy)
    this.yaw += dx * 0.0055
    this.pitch = clamp(this.pitch + dy * 0.0045, -1.2, 1.2)
    this.lx = e.clientX
    this.ly = e.clientY
  }

  private onUp = (e: PointerEvent) => {
    this.dragging = false
    if (this.moved < 6) this.pick(e.clientX, e.clientY)
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault()
    this.lastTouch = performance.now()
    const next = this.targetDist * (1 + Math.sign(e.deltaY) * 0.12)
    // 三层下限：跟着行星 / 待在恒星系里 / 全景
    const lo = this.selected ? PLANET_NEAR : this.focusStar ? SYSTEM_NEAR : this.R * 0.62
    this.targetDist = clamp(next, lo, this.R * 4.6)
    // 一路拉远就逐级脱离，不用专门去点「返回」：行星 → 恒星系 → 全景
    if (this.selected && this.targetDist > SYSTEM_DIST * 0.85) this.clearPlanet()
    else if (this.focusStar && this.targetDist > this.R * 0.9) this.resetView()
  }

  /**
   * 拾取。
   *
   * 不用 raycaster：THREE.Points 的 raycaster 按相机距离排序而非屏幕距离，
   * 光标压在两颗星之间时会挑中更远但更靠近射线的那颗。
   * 几百颗星直接全部投影到屏幕上按像素距离打分，一次指针事件的开销可以忽略。
   */
  private pick(cx: number, cy: number) {
    const rect = this.canvas.getBoundingClientRect()
    const x = cx - rect.left
    const y = cy - rect.top

    // 行星优先：它们只在贴近时才可见，且总是压在恒星前面。
    // 恒星还在点精灵阶段时行星根本没画出来，这里也就不会误中。
    const planet = this.hitPlanet(x, y)
    if (planet) {
      this.selectPlanet(planet)
      return
    }
    this.clearPlanet()

    const star = this.hitStar(x, y)
    if (star) {
      // 飞过去。LOD 挂在屏幕尺寸上，所以「靠近」这个动作本身
      // 就会把球体、行星、轨道依次带出来
      this.focusStar = star
      this.targetDist = SYSTEM_DIST
      this.retarget = true
    } else if (this.focusStar) {
      this.resetView()
    }
    this.cb.onPick?.(star?.s ?? null)
  }

  private selectPlanet(planet: PlanetDatum) {
    this.selected = planet
    this.bodies.setSelected(planet.index)
    this.focusStar = planet.star
    this.targetDist = planetDist(planet.orbitR)
    this.retarget = true
    this.cb.onPickPlanet?.(planet)
  }

  /** 光标下最近的行星，没有就返回 null。 */
  private hitPlanet(x: number, y: number): PlanetDatum | null {
    if (!this.focusStar) return null
    const A = this.reduceMotion ? 0 : this.lastNow - (this.t0 ?? this.lastNow)
    const projScale = (this.h * this.dpr * 0.5) / Math.tan((FOV * Math.PI) / 360)

    let best: PlanetDatum | null = null
    let bestD = Infinity

    for (const p of this.bodies.planetsForStar(this.focusStar)) {
      const dim = renderDim(p.star.s, this.mode, this.u, this.wormIdx)
      this.planetWorld(p, A, this.tmp)
      this.tmp2.copy(this.tmp).applyMatrix4(this.camera.matrixWorldInverse)
      const planetViewZ = Math.max(1, -this.tmp2.z)
      this.starWorld(p.star, A, this.tmp2).applyMatrix4(this.camera.matrixWorldInverse)
      const starViewZ = Math.max(1, -this.tmp2.z)
      const starPx = p.star.bodyR * projScale / starViewZ

      const pxRadius = (p.radius * (projScale / planetViewZ)) / this.dpr
      this.tmp.project(this.camera)
      if (!planetPickVisible({
        starPx,
        convergence: this.convergence,
        renderDim: dim,
        viewZ: planetViewZ,
        near: this.depthNear,
        far: this.depthFar,
        clipZ: this.tmp.z,
      })) continue
      const sx = (this.tmp.x * 0.5 + 0.5) * this.w
      const sy = (-this.tmp.y * 0.5 + 0.5) * this.h
      const d = Math.hypot(sx - x, sy - y)
      if (d < Math.max(pxRadius * 1.5, PLANET_HIT_MIN) && d < bestD) {
        bestD = d
        best = p
      }
    }
    return best
  }

  private hitStar(x: number, y: number): StarDatum | null {
    const A = this.reduceMotion ? 0 : this.lastNow - (this.t0 ?? this.lastNow)
    const projScale = (this.h * this.dpr * 0.5) / Math.tan((FOV * Math.PI) / 360)

    let best: StarDatum | null = null
    let bestD = Infinity

    for (const d of this.bodies.data) {
      if (modeDim(d.s, this.mode, this.u, this.wormIdx) < 0.4) continue
      this.starWorld(d, A, this.tmp)
      const viewZ = Math.max(1, this.tmp.distanceTo(this.camera.position))
      this.tmp.project(this.camera)
      if (this.tmp.z < -1 || this.tmp.z > 1) continue

      const sx = (this.tmp.x * 0.5 + 0.5) * this.w
      const sy = (-this.tmp.y * 0.5 + 0.5) * this.h
      const dd = Math.hypot(sx - x, sy - y)
      if (dd >= bestD) continue

      // 命中半径跟着它在屏幕上的实际大小走
      const pxRadius = (d.pointSize * 4.3 * (projScale / viewZ)) / (2 * this.dpr)
      if (dd < clamp(pxRadius * 0.62, HIT_MIN, HIT_MAX)) {
        bestD = dd
        best = d
      }
    }
    return best
  }

  /** 行星此刻的世界坐标，与 gl/bodies.ts 顶点着色器里的公式同式。 */
  private planetWorld(p: PlanetDatum, A: number, out: THREE.Vector3): THREE.Vector3 {
    this.starWorld(p.star, A, out)
    const th = p.phase + ((Math.PI * 2) / p.period) * (A / 1000)
    const c = Math.cos(th)
    const s = Math.sin(th)
    return out.set(
      out.x + (p.u[0] * c + p.v[0] * s) * p.orbitR,
      out.y + (p.u[1] * c + p.v[1] * s) * p.orbitR,
      out.z + (p.u[2] * c + p.v[2] * s) * p.orbitR,
    )
  }

  /** 恒星此刻的世界坐标，与 gl/starData 喂给着色器的那套公式同式。 */
  private starWorld(d: StarDatum, A: number, out: THREE.Vector3): THREE.Vector3 {
    const p = orbit(d.p, d.center, d.axis, A)
    const bob = this.reduceMotion
      ? 0
      : Math.sin(A / (6400 + ((d.seed * 311) % 5200)) + d.seed) * 1.35
    return out.set(
      p[0] + d.axis[0] * bob,
      p[1] + d.axis[1] * bob,
      p[2] + d.axis[2] * bob,
    )
  }
}

/** 平滑阶跃，语义与 GLSL 的 smoothstep 一致。 */
function smooth(x: number, lo: number, hi: number) {
  const t = clamp((x - lo) / Math.max(1e-6, hi - lo), 0, 1)
  return t * t * (3 - 2 * t)
}

function clamp(v: number, lo: number, hi: number) {
  return v < lo ? lo : v > hi ? hi : v
}
