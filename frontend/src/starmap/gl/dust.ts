import * as THREE from 'three'
import type { Mode, Universe } from '../../types'
import { clusterAxis, orbitPeriod } from '../projection'
import { starColor } from './blackbody'
import { DEPTH_FADE, ORBIT } from './chunks'

// 尘埃与边缘微光。
//
// 尘埃 = 每一条真实内容一粒，跟着它所属的星群一起公转。它们不是装饰：
// 星群「有多重」在画面上就是这团尘埃有多稠。
//
// 边缘微光（solo）是没能进入任何星群的概念。旧版根本没画它们，
// 于是「边缘微光」这个模式点下去什么都不会发生 —— 那比难看更糟。

const VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}

attribute vec3 aStart;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aDim;
attribute float aSeed;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uTwinkle;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 target = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  vec3 p = mix(aStart, target, uConverge);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float tw = 1.0 - uTwinkle * (0.5 + 0.5 * sin(uT / (1100.0 + mod(aSeed * 91.0, 1700.0)) + aSeed));
  vColor = aColor;
  vAlpha = aDim * tw * depthFade(viewZ, uNear, uFar) * (0.35 + 0.65 * uConverge);
  // 必须封顶。尘埃是一条内容，飞进恒星系时它按 1/z 能涨到上百像素，
  // 整个背景会糊成一团棉花 —— 那是之前那版最脏的一处
  gl_PointSize = clamp(aSize * (uProjScale / viewZ), 1.0, 9.0);
}
`

const FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float d2 = dot(gl_PointCoord * 2.0 - 1.0, gl_PointCoord * 2.0 - 1.0);
  if (d2 > 1.0) discard;
  gl_FragColor = vec4(vColor * exp(-d2 * 3.4) * vAlpha * uGain, 1.0);
}
`

export interface DustLayer {
  group: THREE.Group
  setUniform(name: string, value: number): void
  setMode(mode: Mode, u: Universe, wormIdx: number): void
  dispose(): void
}

export function makeDust(u: Universe, reduceMotion: boolean): DustLayer {
  const centerOf = new Map<number, [number, number, number]>()
  const axisOf = new Map<number, [number, number, number]>()
  const hueOf = new Map<number, [number, number]>()
  for (const c of u.clusters) {
    centerOf.set(c.g, c.c)
    axisOf.set(c.g, clusterAxis(c.g))
    hueOf.set(c.g, [c.hue, c.sat])
  }

  const rnd = mulberry(1319)

  // ── 尘埃 ──
  const parts = u.particles
  const pn = parts.length
  const dustGroups = new Int32Array(pn)
  const dust = buildPoints(pn, (i, w) => {
    const p = parts[i]
    const g = p[3]
    const c = centerOf.get(g) ?? [0, 0, 0]
    const ax = axisOf.get(g) ?? [0, 1, 0]
    const [hue, sat] = hueOf.get(g) ?? [218, 0]
    dustGroups[i] = g
    w.pos = [p[0], p[1], p[2]]
    w.center = c
    w.axis = ax
    w.period = orbitPeriod(w.pos, c)
    // 本人创作的那一粒亮一点、白一点 —— 这是画面里唯一区分「写过 / 收过」的尘埃线索
    w.color = starColor(hue, p[4] ? Math.max(sat, 24) : sat)
    w.size = p[4] ? 1.9 : 1.35
    w.seed = i * 0.618
    w.start = jet(rnd)
  })

  // ── 边缘微光 ──
  const solos = u.solo
  const sn = solos.length
  const solo = sn > 0 ? buildPoints(sn, (i, w) => {
    const s = solos[i]
    w.pos = [s.p[0], s.p[1], s.p[2]]
    w.center = [s.p[0], s.p[1], s.p[2]]
    w.axis = [0, 1, 0]
    w.period = 0
    w.color = [0.72, 0.80, 1.0]
    w.size = 2.2
    w.seed = i * 1.37 + 5
    w.start = jet(rnd)
  }) : null

  const shared = {
    uT: { value: 0 },
    uConverge: { value: reduceMotion ? 1 : 0 },
    uProjScale: { value: 1000 },
    uNear: { value: 1 },
    uFar: { value: 4000 },
  }

  const dustMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uGain: { value: 0.30 }, uTwinkle: { value: 0 } },
    vertexShader: VERT, fragmentShader: FRAG,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  })
  // 边缘微光会呼吸：它们是「差一点就成星」的东西，闪烁本身就是语义
  const soloMat = new THREE.ShaderMaterial({
    uniforms: { ...shared, uGain: { value: 0.85 }, uTwinkle: { value: reduceMotion ? 0 : 0.55 } },
    vertexShader: VERT, fragmentShader: FRAG,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true,
  })

  const group = new THREE.Group()
  const dustPts = new THREE.Points(dust.geo, dustMat)
  dustPts.renderOrder = 6
  dustPts.frustumCulled = false
  group.add(dustPts)

  let soloPts: THREE.Points | null = null
  if (solo) {
    soloPts = new THREE.Points(solo.geo, soloMat)
    soloPts.renderOrder = 8
    soloPts.frustumCulled = false
    group.add(soloPts)
  }

  const mats = [dustMat, soloMat]

  return {
    group,
    setUniform(name, value) {
      for (const m of mats) if (m.uniforms[name]) m.uniforms[name].value = value
    },
    setMode(mode, uni, wormIdx) {
      // 尘埃：只在虫洞模式里区分星群，其余模式整体退让给被强调的对象
      const w = uni.wormholes[wormIdx]
      for (let i = 0; i < pn; i++) {
        dust.dim[i] = mode === 'all' ? 1
          : mode === 'worm' && w ? (dustGroups[i] === w.a || dustGroups[i] === w.b ? 0.9 : 0.07)
          : 0.12
      }
      dust.dimAttr.needsUpdate = true
      if (solo) {
        const on = mode === 'solo' ? 1 : mode === 'all' ? 0.34 : 0.08
        solo.dim.fill(on)
        solo.dimAttr.needsUpdate = true
      }
    },
    dispose() {
      dust.geo.dispose()
      solo?.geo.dispose()
      for (const m of mats) m.dispose()
    },
  }
}

interface Writer {
  pos: [number, number, number]
  start: [number, number, number]
  center: readonly [number, number, number]
  axis: readonly [number, number, number]
  color: [number, number, number]
  period: number
  size: number
  seed: number
}

function buildPoints(n: number, fill: (i: number, w: Writer) => void) {
  const pos = new Float32Array(n * 3)
  const start = new Float32Array(n * 3)
  const center = new Float32Array(n * 3)
  const axis = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  const period = new Float32Array(n)
  const size = new Float32Array(n)
  const dim = new Float32Array(n).fill(1)
  const seed = new Float32Array(n)

  const w: Writer = {
    pos: [0, 0, 0], start: [0, 0, 0], center: [0, 0, 0], axis: [0, 1, 0],
    color: [1, 1, 1], period: 0, size: 1, seed: 0,
  }
  for (let i = 0; i < n; i++) {
    fill(i, w)
    pos.set(w.pos, i * 3)
    start.set(w.start, i * 3)
    center[i * 3] = w.center[0]; center[i * 3 + 1] = w.center[1]; center[i * 3 + 2] = w.center[2]
    axis[i * 3] = w.axis[0]; axis[i * 3 + 1] = w.axis[1]; axis[i * 3 + 2] = w.axis[2]
    color.set(w.color, i * 3)
    period[i] = w.period
    size[i] = w.size
    seed[i] = w.seed
  }

  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
  geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  geo.setAttribute('aPeriod', new THREE.BufferAttribute(period, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  geo.setAttribute('aDim', new THREE.BufferAttribute(dim, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

  return { geo, dim, dimAttr: geo.getAttribute('aDim') as THREE.BufferAttribute }
}

/** 创世喷发的起点：奇点附近的一小团。 */
function jet(rnd: () => number): [number, number, number] {
  const a = rnd() * Math.PI * 2
  const b = Math.acos(2 * rnd() - 1)
  const r = 2 + rnd() * 5
  return [r * Math.sin(b) * Math.cos(a), r * Math.sin(b) * Math.sin(a), r * Math.cos(b)]
}

function mulberry(s: number) {
  let a = s >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
