import * as THREE from 'three'
import type { Universe } from '../../types'
import { clusterAxis, orbitPeriod } from '../projection'
import { DEPTH_FADE, ORBIT } from './chunks'

// 两种模式叠加物，都放进 3D 里 —— 它们得跟着相机走，也得吃到 bloom。
// 画在 2D 覆盖层上的发光物永远像贴纸。

const AMBER = new THREE.Color(1.0, 0.62, 0.24)

// ── 虫洞 ──
//
// 旧版是一条屏幕空间的虚线加一个中点光斑。改成沿贝塞尔曲线流动的粒子流：
// 虫洞的语义是「你反复地从这个星群跨到那个星群」，流动本身就是那个语义，
// 虚线不是。

const WORM_SAMPLES = 190

const WORM_VERT = /* glsl */ `
${DEPTH_FADE}
attribute float aT;      // 0..1，沿曲线的位置
attribute float aWorm;   // 属于第几条虫洞
uniform float uT;
uniform float uActive;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float on = step(abs(aWorm - uActive), 0.5);
  // 三道脉冲沿曲线跑；尾部拖长，头部收紧
  float phase = fract(aT * 3.0 - uT * 0.00042);
  float pulse = pow(1.0 - phase, 5.0);
  float base = 0.16 + 0.84 * pulse;

  vAlpha = on * base * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
  gl_PointSize = max(1.0, (1.6 + 4.6 * pulse) * (uProjScale / viewZ) * 0.55);
}
`

const WORM_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uGain;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(uColor * exp(-d2 * 3.0) * vAlpha * uGain, 1.0);
}
`

// ── 暗物质 ──
//
// 中心什么都没有，只有引力透镜把背景掰弯 —— 这是这个概念唯一诚实的画法。
// 面片朝相机，因为透镜本来就是个视线现象。

const DARK_VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}
attribute vec2 aCorner;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute float aPeriod;
attribute float aRadius;
attribute float aSeed;
uniform float uT;
uniform float uConverge;
uniform float uNear;
uniform float uFar;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  vec3 wp = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec4 mv = modelViewMatrix * vec4(wp, 1.0);
  float viewZ = max(1.0, -mv.z);
  mv.xy += aCorner * aRadius;
  gl_Position = projectionMatrix * mv;
  vUv = aCorner;
  vSeed = aSeed;
  vAlpha = depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
}
`

const DARK_FRAG = /* glsl */ `
uniform float uT;
uniform float uEmphasis;
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
varying float vSeed;
void main() {
  float r = length(vUv);
  if (r > 1.0) discard;
  float ang = atan(vUv.y, vUv.x);
  float pulse = 0.85 + 0.15 * sin(uT * 0.00038 + vSeed);

  // 外圈：透镜的作用半径
  float halo = exp(-pow((r - 0.92) / 0.045, 2.0)) * 0.28;

  // 爱因斯坦环：两段相对的弧，中间是空的
  float arc = exp(-pow((r - 0.62) / 0.055, 2.0));
  float lobes = pow(max(0.0, abs(cos(ang))), 5.0);

  float a = (halo * 0.9 + arc * lobes * 1.5) * pulse * vAlpha * uEmphasis;
  if (a <= 0.002) discard;
  gl_FragColor = vec4(mix(uColor, vec3(0.86, 0.90, 1.0), arc * lobes) * a, 1.0);
}
`

export interface Overlay3D {
  group: THREE.Group
  setUniform(name: string, value: number): void
  setActiveWorm(i: number): void
  setEmphasis(dark: number): void
  setWormVisible(on: boolean): void
  dispose(): void
}

export function makeOverlay3D(u: Universe): Overlay3D {
  const group = new THREE.Group()
  const disposables: { dispose(): void }[] = []
  const shared = () => ({
    uT: { value: 0 },
    uConverge: { value: 0 },
    uProjScale: { value: 1000 },
    uNear: { value: 1 },
    uFar: { value: 4000 },
  })
  const mats: THREE.ShaderMaterial[] = []

  // ── 虫洞粒子流 ──
  const centerOf = new Map<number, [number, number, number]>()
  for (const c of u.clusters) centerOf.set(c.g, c.c)

  const wp: number[] = []
  const wt: number[] = []
  const wi: number[] = []
  u.wormholes.forEach((w, idx) => {
    const a = centerOf.get(w.a)
    const b = centerOf.get(w.b)
    if (!a || !b) return
    const mid = arcMid(a, b)
    for (let i = 0; i < WORM_SAMPLES; i++) {
      const t = i / (WORM_SAMPLES - 1)
      const p = quadratic(a, mid, b, t)
      wp.push(p[0], p[1], p[2])
      wt.push(t)
      wi.push(idx)
    }
  })

  let wormPts: THREE.Points | null = null
  let wormMat: THREE.ShaderMaterial | null = null
  if (wp.length > 0) {
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(wp, 3))
    geo.setAttribute('aT', new THREE.Float32BufferAttribute(wt, 1))
    geo.setAttribute('aWorm', new THREE.Float32BufferAttribute(wi, 1))
    geo.computeBoundingSphere()
    wormMat = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uActive: { value: 0 }, uColor: { value: AMBER.clone() }, uGain: { value: 2.6 } },
      vertexShader: WORM_VERT, fragmentShader: WORM_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
    })
    wormPts = new THREE.Points(geo, wormMat)
    wormPts.renderOrder = 16
    wormPts.frustumCulled = false
    wormPts.visible = false
    group.add(wormPts)
    disposables.push(geo, wormMat)
    mats.push(wormMat)
  }

  // ── 暗物质透镜 ──
  let darkMat: THREE.ShaderMaterial | null = null
  const darkItems = u.dark
    .map((d) => ({ d, s: u.stars.find((x) => x.c === d.c) }))
    .filter((o): o is { d: typeof u.dark[number]; s: NonNullable<typeof o.s> } => !!o.s)

  if (darkItems.length > 0) {
    const quad: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]]
    const dp: number[] = []
    const dc: number[] = []
    const dcen: number[] = []
    const dax: number[] = []
    const dper: number[] = []
    const drad: number[] = []
    const dseed: number[] = []

    darkItems.forEach(({ d, s }, k) => {
      const cluster = u.clusters.find((c) => c.g === s.g)
      const cen = cluster ? cluster.c : s.p
      const ax = clusterAxis(s.g)
      const period = cluster ? orbitPeriod(s.p, cen) : 0
      const R = 34 + d.f * 2.2
      for (const [cx, cy] of quad) {
        dp.push(s.p[0], s.p[1], s.p[2])
        dc.push(cx, cy)
        dcen.push(cen[0], cen[1], cen[2])
        dax.push(ax[0], ax[1], ax[2])
        dper.push(period)
        drad.push(R)
        dseed.push(k * 1.7 + d.f)
      }
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3))
    geo.setAttribute('aCorner', new THREE.Float32BufferAttribute(dc, 2))
    geo.setAttribute('aCenter', new THREE.Float32BufferAttribute(dcen, 3))
    geo.setAttribute('aAxis', new THREE.Float32BufferAttribute(dax, 3))
    geo.setAttribute('aPeriod', new THREE.Float32BufferAttribute(dper, 1))
    geo.setAttribute('aRadius', new THREE.Float32BufferAttribute(drad, 1))
    geo.setAttribute('aSeed', new THREE.Float32BufferAttribute(dseed, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

    darkMat = new THREE.ShaderMaterial({
      uniforms: { ...shared(), uEmphasis: { value: 0.14 }, uColor: { value: AMBER.clone() } },
      vertexShader: DARK_VERT, fragmentShader: DARK_FRAG,
      blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
    })
    const mesh = new THREE.Mesh(geo, darkMat)
    mesh.renderOrder = 15
    mesh.frustumCulled = false
    group.add(mesh)
    disposables.push(geo, darkMat)
    mats.push(darkMat)
  }

  return {
    group,
    setUniform(name, value) {
      for (const m of mats) if (m.uniforms[name]) m.uniforms[name].value = value
    },
    setActiveWorm(i) { if (wormMat) wormMat.uniforms.uActive.value = i },
    setEmphasis(dark) { if (darkMat) darkMat.uniforms.uEmphasis.value = dark },
    setWormVisible(on) { if (wormPts) wormPts.visible = on },
    dispose() { for (const d of disposables) d.dispose() },
  }
}

/** 弧的中点：从 AB 连线朝「世界上方在垂直于 AB 的分量」抬起。 */
function arcMid(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
): [number, number, number] {
  const d: [number, number, number] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const dir: [number, number, number] = [d[0] / len, d[1] / len, d[2] / len]
  const up: [number, number, number] = [0, 1, 0]
  const k = up[0] * dir[0] + up[1] * dir[1] + up[2] * dir[2]
  let n: [number, number, number] = [up[0] - dir[0] * k, up[1] - dir[1] * k, up[2] - dir[2] * k]
  let nl = Math.hypot(n[0], n[1], n[2])
  if (nl < 1e-4) {
    // AB 恰好竖直：换一根参考轴
    n = [1 - dir[0] * dir[0], -dir[1] * dir[0], -dir[2] * dir[0]]
    nl = Math.hypot(n[0], n[1], n[2]) || 1
  }
  const h = len * 0.3
  return [
    (a[0] + b[0]) / 2 + (n[0] / nl) * h,
    (a[1] + b[1]) / 2 + (n[1] / nl) * h,
    (a[2] + b[2]) / 2 + (n[2] / nl) * h,
  ]
}

function quadratic(
  a: readonly [number, number, number],
  m: readonly [number, number, number],
  b: readonly [number, number, number],
  t: number,
): [number, number, number] {
  const u = 1 - t
  const w0 = u * u
  const w1 = 2 * u * t
  const w2 = t * t
  return [
    a[0] * w0 + m[0] * w1 + b[0] * w2,
    a[1] * w0 + m[1] * w1 + b[1] * w2,
    a[2] * w0 + m[2] * w1 + b[2] * w2,
  ]
}
