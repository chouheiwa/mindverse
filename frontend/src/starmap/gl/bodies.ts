import * as THREE from 'three'
import type { Evidence, Mode, Universe } from '../../types'
import { DEPTH_FADE, ORBIT, SIMPLEX3 } from './chunks'
import { starData, type StarDatum } from './starData'
import { renderDim } from './stars'

// 有体积的天体：恒星球体、行星、行星轨道。
//
// 为什么点精灵不够：远处的恒星本来就该是点，这没错 —— 但一整张图里没有
// 任何一个有体积的东西，靠近了也还是点，那就不是宇宙是散点图。
// 这里按屏幕上的实际大小做连续 LOD，不做模式切换：
//
//   恒星半径 < 2px   纯点精灵
//   2 → 7px          点渐隐，球体渐显（两者在同一坐标上，不会跳）
//   > 11px           行星与轨道开始浮现
//   > 34px           整个恒星系完全展开
//
// 行星 = 这颗恒星携带的真实内容（Star.ev，每颗 3–6 条），不是编出来的装饰。
// 其中最要紧的一条语义：**你写过的行星自己发光，你只收藏的只能反射恒星的光，
// 背面是全黑的**。「收藏了却从没写过」这件事，物理上恰好就是不发光的天体。

/** 行星轨道半径：从这里起步，每颗往外推一档。单位是世界坐标。 */
const ORBIT_BASE = 2.1
const ORBIT_STEP = 1.15
/** 行星半径。刻意远小于恒星，否则读起来是双星不是行星系。 */
const PLANET_MIN = 0.085
const PLANET_MAX = 0.20

/**
 * 增益。
 *
 * 恒星刻意压到 1.05 附近而不是往 HDR 上限冲：冲上去 tone map 之后
 * 整颗球是一个纯白圆盘，临边昏暗和米粒组织全看不见 —— 那就白做了。
 * 「亮」这件事交给外面的日冕精灵和 bloom，球体本身负责「是个天体」。
 */
/**
 * 增益。
 *
 * 恒星取 1.9 是有讲究的：临边昏暗把中心到边缘压成 1.0→0.30，乘上 1.9 之后
 * 中心 1.9（越过 bloom 阈值，会发出耀光），边缘 0.57（留在 1.0 以下，
 * 米粒组织才看得见）。**这段动态范围就是「恒星」和「卫星」的全部区别** ——
 * 整颗压在 1.0 以下是块石头，整颗顶到 1.0 以上是个白盘子。
 */
const GAIN = { star: 1.9, planet: 0.92, ring: 0.10 }

// ── 恒星球体 ──

const STAR_VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}
attribute vec3 iPos;
attribute vec3 iCenter;
attribute vec3 iAxis;
attribute vec3 iStart;
attribute vec3 iColor;
// x=period y=ignite z=radius w=seed
attribute vec4 iOrb;
// x=kelvin y=dim
attribute vec2 iMeta;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uIgniteMs;
uniform float uLitFloor;
uniform float uBob;

varying vec3 vColor;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
varying float vAlpha;
varying float vKelvin;
varying float vSeed;

void main() {
  float lit = max(uLitFloor, clamp((uT - iOrb.y) / uIgniteMs, 0.0, 1.0));
  vec3 target = orbitAround(iPos, iCenter, iAxis, iOrb.x, uT * 0.001);
  target += iAxis * sin(uT / (6400.0 + mod(iOrb.w * 311.0, 5200.0)) + iOrb.w) * uBob;
  vec3 c = mix(iStart, target, uConverge);

  vec3 world = c + normalize(position) * iOrb.z * lit;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  // 屏幕上的半径决定它该不该现形；和点精灵的淡出互补，两边加起来恒为一。
  // 这两个阈值必须和 gl/stars.ts 的 sphereIn 逐字一致
  float px = iOrb.z * uProjScale / viewZ;
  float lod = smoothstep(6.0, 18.0, px);

  vN = normalize(normalMatrix * normalize(position));
  vLocal = normalize(position);
  vView = mv.xyz;
  vColor = iColor;
  vKelvin = iMeta.x;
  vSeed = iOrb.w;
  vAlpha = iMeta.y * lit * lod * depthFade(viewZ, uNear, uFar);
}
`

const STAR_FRAG = /* glsl */ `
${SIMPLEX3}
uniform float uT;
uniform float uGain;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vLocal;
varying vec3 vView;
varying float vAlpha;
varying float vKelvin;
varying float vSeed;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 n = normalize(vLocal);

  // 米粒组织：三层噪声就够，不用整套 fbm —— 这是逐像素跑在可能占满屏的球上。
  // 频率刻意取高：低频噪声在球面上会长成一块块环形山，那读起来是卫星不是恒星。
  float t = uT * 0.00009;
  float g = snoise(n * 6.2 + vec3(vSeed, t, -t)) * 0.50
          + snoise(n * 15.0 - vec3(t * 1.7, vSeed, t)) * 0.32
          + snoise(n * 34.0 + vec3(-t, t * 2.2, vSeed)) * 0.18;

  // 冷星表面粗粝翻滚，热星平滑刺眼 —— 这是色温在表面上的样子
  float rough = clamp((5600.0 - vKelvin) / 2800.0, 0.0, 1.0);
  float cell = clamp(0.5 + 0.62 * g, 0.0, 1.0);
  cell = mix(0.88, cell, 0.30 + 0.70 * rough);

  // 临边昏暗：中心亮、边缘暗。这是「它是个球」最强的一个信号
  float mu = clamp(dot(normalize(vN), normalize(-vView)), 0.0, 1.0);
  float limb = 0.30 + 0.70 * pow(mu, 0.58);

  // 色球：最边上那一圈更冷更红，而且要比昏暗的过渡带亮一点点 ——
  // 真恒星的边缘不是渐隐到黑，是有一道薄薄的亮边
  float chromo = pow(1.0 - mu, 7.0);

  vec3 core = mix(vColor, vec3(1.0), 0.78);
  vec3 edge = mix(vColor, vec3(1.0, 0.58, 0.30), 0.42);
  vec3 col = mix(edge, core, limb * (0.45 + 0.55 * cell));

  float lum = limb * (0.68 + 0.32 * cell) + chromo * 0.55;
  gl_FragColor = vec4(col * lum * vAlpha * uGain, 1.0);
}
`

// ── 行星 ──

const PLANET_VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}
attribute vec3 iU;
attribute vec3 iV;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
attribute vec3 iStarAxis;
attribute vec3 iColor;
// x=orbitR y=phase z=period w=planetR
attribute vec4 iOrb;
// x=own*2+fresh y=starSeed z=starR w=starPeriod
//   own   ∈{0,1}  是否本人创作
//   fresh ∈[0,1)  内容的新旧，1 近 0 远
attribute vec4 iMeta;
attribute float iDim;
attribute float iSel;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uBob;

varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vOwn;
varying float vFresh;
varying float vSeed;
varying float vSel;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iStarAxis, iMeta.w, uT * 0.001);
  starW += iStarAxis * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  float th = iOrb.y + 6.28318530718 / iOrb.z * (uT * 0.001);
  vec3 centerW = starW + (iU * cos(th) + iV * sin(th)) * iOrb.x;
  vec3 nrm = normalize(position);
  vec3 world = centerW + nrm * iOrb.w;

  vec4 mvC = modelViewMatrix * vec4(centerW, 1.0);
  vec4 mvS = modelViewMatrix * vec4(starW, 1.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // LOD 挂在**恒星**的屏幕大小上，不是行星自己的 —— 否则一颗大行星会
  // 在恒星还是个点的时候先冒出来
  float starPx = iMeta.z * uProjScale / max(1.0, -mvS.z);
  float lod = smoothstep(13.0, 40.0, starPx);

  vN = normalize(normalMatrix * nrm);
  vL = mvS.xyz - mv.xyz;
  vV = -mv.xyz;
  vOwn = step(2.0, iMeta.x);
  vFresh = iMeta.x - vOwn * 2.0;
  vSeed = iOrb.y;
  vSel = iSel;
  vColor = iColor;
  vAlpha = iDim * lod * smoothstep(0.90, 1.0, uConverge)
         * depthFade(max(1.0, -mvC.z), uNear, uFar);
}
`

const PLANET_FRAG = /* glsl */ `
${SIMPLEX3}
uniform float uGain;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vOwn;
varying float vFresh;
varying float vSeed;
varying float vSel;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);

  float tex = 0.82 + 0.18 * (snoise(N * 5.0 + vSeed) * 0.7 + snoise(N * 13.0 - vSeed) * 0.3);
  // 岩石本色里掺一点恒星的颜色：行星是被这颗恒星照亮的
  vec3 rock = mix(vec3(0.28, 0.31, 0.40), vColor, 0.30) * tex;

  vec3 col;
  // 每颗行星都由自己的恒星照亮 —— 这是物理，对谁都成立。
  //
  // 这里携带的数据是「新旧」：近期还在收的内容反照率高、带一层大气轮缘，
  // 久远的暗而粗糙。曾经这里是「我写过的自己发光 / 只收藏的全黑」，
  // 但绝大多数用户从不创作，那套规则会让他们的每一颗行星都是黑的。
  float d = max(0.0, dot(N, L));
  float term = smoothstep(-0.06, 0.28, dot(N, L));
  float albedo = mix(0.30, 1.0, vFresh);
  col = rock * albedo * (0.05 + 0.95 * d) * term;
  float atmo = pow(1.0 - max(0.0, dot(N, V)), 3.0) * vFresh * 0.55;
  col += vec3(0.42, 0.58, 0.95) * atmo * (0.25 + 0.75 * d);

  // 我写过的：夜面也透出一点自己的光。是叠加，不再是有无光的分界。
  if (vOwn > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.2);
    vec3 glow = vec3(1.0, 0.80, 0.48);
    col += glow * (0.09 + rim * 0.36) * (1.0 - term * 0.5);
  }

  // 选中：加一道冷色轮缘。不整颗提亮 —— 那会把「自己发光 / 只反射」这条
  // 语义抹平，选中态不该篡改数据本身在说的事
  if (vSel > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 1.8);
    col += vec3(0.52, 0.72, 1.0) * (0.14 + rim * 1.6);
  }

  gl_FragColor = vec4(col * vAlpha * uGain, 1.0);
}
`

// ── 行星轨道 ──

const RING_VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}
attribute vec3 iU;
attribute vec3 iV;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
attribute vec3 iStarAxis;
attribute vec3 iColor;
attribute vec4 iOrb;
attribute vec4 iMeta;
attribute float iDim;
attribute float iSel;

uniform float uT;
uniform float uConverge;
uniform float uProjScale;
uniform float uNear;
uniform float uFar;
uniform float uBob;

varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iStarAxis, iMeta.w, uT * 0.001);
  starW += iStarAxis * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  // position.xy 是单位圆上的参数，铺到这条轨道的平面里
  vec3 world = starW + (iU * position.x + iV * position.y) * iOrb.x;
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  float starPx = iMeta.z * uProjScale / max(1.0, -(modelViewMatrix * vec4(starW, 1.0)).z);
  float lod = smoothstep(22.0, 62.0, starPx);

  // 选中那条轨道亮起来，让「这颗行星走的是哪一圈」一眼可见
  vColor = mix(iColor, vec3(0.62, 0.78, 1.0), iSel);
  vAlpha = iDim * lod * smoothstep(0.90, 1.0, uConverge) * (1.0 + 5.0 * iSel)
         * depthFade(max(1.0, -mv.z), uNear, uFar);
}
`

const RING_FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.003) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`

/**
 * 一颗行星。
 *
 * 拾取要在 CPU 上重算它此刻的位置，所以轨道参数必须原样留一份出来 ——
 * 与顶点着色器里的公式逐字对应，否则点得到的和看到的不是同一颗。
 */
export interface PlanetDatum {
  star: StarDatum
  ev: Evidence
  /** 实例下标，用于置选中态 */
  index: number
  u: [number, number, number]
  v: [number, number, number]
  orbitR: number
  phase: number
  period: number
  radius: number
  own: boolean
}

export interface BodyLayer {
  group: THREE.Group
  setUniform(name: string, value: number): void
  setMode(mode: Mode, u: Universe, wormIdx: number): void
  /** 供拾取与飞入复用，顺序与 u.stars 一致 */
  data: StarDatum[]
  /** 全部行星，顺序即实例顺序 */
  planets: PlanetDatum[]
  /** 置选中；传 -1 清空 */
  setSelected(index: number): void
  dispose(): void
}

export function makeBodies(u: Universe, reduceMotion: boolean): BodyLayer {
  const data = starData(u)
  const n = data.length

  // ── 恒星球体 ──
  const sphere = new THREE.SphereGeometry(1, 32, 20)
  const starGeo = new THREE.InstancedBufferGeometry()
  starGeo.index = sphere.index
  starGeo.setAttribute('position', sphere.getAttribute('position'))
  starGeo.instanceCount = n

  const sPos = new Float32Array(n * 3)
  const sCenter = new Float32Array(n * 3)
  const sAxis = new Float32Array(n * 3)
  const sStart = new Float32Array(n * 3)
  const sColor = new Float32Array(n * 3)
  const sOrb = new Float32Array(n * 4)
  const sMeta = new Float32Array(n * 2)

  data.forEach((d, i) => {
    sPos.set(d.p, i * 3)
    sCenter.set(d.center, i * 3)
    sAxis.set(d.axis, i * 3)
    sStart.set(d.start, i * 3)
    sColor.set(d.color, i * 3)
    sOrb.set([d.period, d.ignite, d.bodyR, d.seed], i * 4)
    sMeta.set([d.kelvin, 1], i * 2)
  })

  starGeo.setAttribute('iPos', new THREE.InstancedBufferAttribute(sPos, 3))
  starGeo.setAttribute('iCenter', new THREE.InstancedBufferAttribute(sCenter, 3))
  starGeo.setAttribute('iAxis', new THREE.InstancedBufferAttribute(sAxis, 3))
  starGeo.setAttribute('iStart', new THREE.InstancedBufferAttribute(sStart, 3))
  starGeo.setAttribute('iColor', new THREE.InstancedBufferAttribute(sColor, 3))
  starGeo.setAttribute('iOrb', new THREE.InstancedBufferAttribute(sOrb, 4))
  starGeo.setAttribute('iMeta', new THREE.InstancedBufferAttribute(sMeta, 2))
  starGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

  const shared = () => ({
    uT: { value: 0 },
    uConverge: { value: reduceMotion ? 1 : 0 },
    uProjScale: { value: 1000 },
    uNear: { value: 1 },
    uFar: { value: 4000 },
    uBob: { value: reduceMotion ? 0 : 1.35 },
  })

  const starMat = new THREE.ShaderMaterial({
    uniforms: {
      ...shared(),
      uIgniteMs: { value: 700 },
      uLitFloor: { value: reduceMotion ? 1 : 0 },
      uGain: { value: GAIN.star },
    },
    vertexShader: STAR_VERT,
    fragmentShader: STAR_FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: true,
  })
  const starMesh = new THREE.Mesh(starGeo, starMat)
  starMesh.renderOrder = 9
  starMesh.frustumCulled = false

  // ── 行星与轨道 ──
  //
  // 每条真实内容一颗行星。ev 由后端封顶在 6 条，所以一个恒星系是 3–6 颗，
  // 正好是能读清的量。
  // 新鲜度按全宇宙的时间跨度归一化，而不是各恒星自己的跨度 ——
  // 否则每个星系里都必然有一颗「最新的」，跨系之间就没法比。
  const monthOf = (y: string) => {
    const [a, b] = y.split('.')
    let yy = Number(a)
    if (yy < 100) yy += 2000
    return yy * 12 + Number(b)
  }
  let lo = Infinity, hi = -Infinity
  for (const d of data) {
    for (const e of d.s.ev ?? []) {
      const m = monthOf(e.y)
      if (Number.isFinite(m)) { if (m < lo) lo = m; if (m > hi) hi = m }
    }
  }
  const span = Math.max(1, hi - lo)
  const freshOf = (y: string) => {
    const m = monthOf(y)
    if (!Number.isFinite(m)) return 0.5
    // 收在 [0,0.999]：1.0 会让打包进 iMeta.x 的 own 位读错
    return Math.min(0.999, Math.max(0, (m - lo) / span))
  }

  const planets: { d: StarDatum; idx: number; own: number; fresh: number; count: number }[] = []
  for (const d of data) {
    const ev = d.s.ev ?? []
    ev.forEach((e, k) =>
      planets.push({ d, idx: k, own: e.o ? 1 : 0, fresh: freshOf(e.y), count: ev.length }))
  }
  const pn = planets.length

  const pU = new Float32Array(pn * 3)
  const pV = new Float32Array(pn * 3)
  const pStarPos = new Float32Array(pn * 3)
  const pStarCenter = new Float32Array(pn * 3)
  const pStarAxis = new Float32Array(pn * 3)
  const pColor = new Float32Array(pn * 3)
  const pOrb = new Float32Array(pn * 4)
  const pMeta = new Float32Array(pn * 4)
  const pDim = new Float32Array(pn).fill(1)
  const pSel = new Float32Array(pn)
  const pStarIndex = new Int32Array(pn)
  const planetData: PlanetDatum[] = []

  const starIndexOf = new Map<StarDatum, number>()
  data.forEach((d, i) => starIndexOf.set(d, i))

  planets.forEach((p, i) => {
    const d = p.d
    // 轨道面：整个恒星系共用一根轴，每颗再给一点点倾角，才有层次不是同心圆
    const tilt = ((p.idx * 2654435761) % 1000) / 1000 - 0.5
    const [uu, vv] = tilted(d.sysU, d.sysV, d.sysAxis, tilt * 0.22)
    const r = ORBIT_BASE + p.idx * ORBIT_STEP
    // 开普勒式：外圈更慢
    const period = 7 + 2.4 * Math.pow(r, 1.5)
    const phase = ((p.idx * 137.508 + d.seed * 31.7) * Math.PI) / 180
    const rad = PLANET_MIN + (PLANET_MAX - PLANET_MIN) * (((p.idx * 7919) % 100) / 100)

    pU.set(uu, i * 3)
    pV.set(vv, i * 3)
    pStarPos.set(d.p, i * 3)
    pStarCenter.set(d.center, i * 3)
    pStarAxis.set(d.axis, i * 3)
    pColor.set(d.color, i * 3)
    pOrb.set([r, phase, period, rad], i * 4)
    pMeta.set([p.own * 2 + p.fresh, d.seed, d.bodyR, d.period], i * 4)
    pStarIndex[i] = starIndexOf.get(d)!
    planetData.push({
      star: d, ev: d.s.ev[p.idx], index: i,
      u: uu, v: vv, orbitR: r, phase, period, radius: rad, own: p.own === 1,
    })
  })

  const planetSphere = new THREE.SphereGeometry(1, 20, 14)
  const planetGeo = new THREE.InstancedBufferGeometry()
  planetGeo.index = planetSphere.index
  planetGeo.setAttribute('position', planetSphere.getAttribute('position'))
  planetGeo.instanceCount = pn
  attachOrbitAttrs(planetGeo, { pU, pV, pStarPos, pStarCenter, pStarAxis, pColor, pOrb, pMeta, pDim, pSel })

  const planetMat = new THREE.ShaderMaterial({
    uniforms: { ...shared(), uGain: { value: GAIN.planet } },
    vertexShader: PLANET_VERT,
    fragmentShader: PLANET_FRAG,
    transparent: true,
    depthTest: true,
    depthWrite: true,
  })
  const planetMesh = new THREE.Mesh(planetGeo, planetMat)
  planetMesh.renderOrder = 9
  planetMesh.frustumCulled = false

  // 轨道环：底几何是一圈单位圆的线段，实例化到每条轨道上
  const SEG = 72
  const ringPos = new Float32Array(SEG * 2 * 3)
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2
    const a1 = ((i + 1) / SEG) * Math.PI * 2
    ringPos.set([Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0], i * 6)
  }
  const ringGeo = new THREE.InstancedBufferGeometry()
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3))
  ringGeo.instanceCount = pn
  attachOrbitAttrs(ringGeo, { pU, pV, pStarPos, pStarCenter, pStarAxis, pColor, pOrb, pMeta, pDim, pSel })

  const ringMat = new THREE.ShaderMaterial({
    uniforms: { ...shared(), uGain: { value: GAIN.ring } },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  })
  const ringMesh = new THREE.LineSegments(ringGeo, ringMat)
  ringMesh.renderOrder = 8.5
  ringMesh.frustumCulled = false

  const group = new THREE.Group()
  group.add(ringMesh, starMesh, planetMesh)

  const mats = [starMat, planetMat, ringMat]
  const sMetaAttr = starGeo.getAttribute('iMeta') as THREE.InstancedBufferAttribute
  const pDimAttr = planetGeo.getAttribute('iDim') as THREE.InstancedBufferAttribute
  const rDimAttr = ringGeo.getAttribute('iDim') as THREE.InstancedBufferAttribute
  const pSelAttr = planetGeo.getAttribute('iSel') as THREE.InstancedBufferAttribute
  const rSelAttr = ringGeo.getAttribute('iSel') as THREE.InstancedBufferAttribute
  let selected = -1

  return {
    group,
    data,
    planets: planetData,
    setSelected(index) {
      if (index === selected) return
      if (selected >= 0) pSel[selected] = 0
      selected = index >= 0 && index < pn ? index : -1
      if (selected >= 0) pSel[selected] = 1
      pSelAttr.needsUpdate = true
      rSelAttr.needsUpdate = true
    },
    setUniform(name, value) {
      for (const m of mats) if (m.uniforms[name]) m.uniforms[name].value = value
    },
    setMode(mode, uni, wormIdx) {
      const dims = data.map((d) => renderDim(d.s, mode, uni, wormIdx))
      for (let i = 0; i < n; i++) sMeta[i * 2 + 1] = dims[i]
      sMetaAttr.needsUpdate = true
      for (let i = 0; i < pn; i++) pDim[i] = dims[pStarIndex[i]]
      pDimAttr.needsUpdate = true
      rDimAttr.needsUpdate = true
    },
    dispose() {
      sphere.dispose()
      planetSphere.dispose()
      starGeo.dispose()
      planetGeo.dispose()
      ringGeo.dispose()
      for (const m of mats) m.dispose()
    },
  }
}

function attachOrbitAttrs(g: THREE.InstancedBufferGeometry, a: {
  pU: Float32Array; pV: Float32Array; pStarPos: Float32Array
  pStarCenter: Float32Array; pStarAxis: Float32Array; pColor: Float32Array
  pOrb: Float32Array; pMeta: Float32Array; pDim: Float32Array; pSel: Float32Array
}) {
  g.setAttribute('iU', new THREE.InstancedBufferAttribute(a.pU, 3))
  g.setAttribute('iV', new THREE.InstancedBufferAttribute(a.pV, 3))
  g.setAttribute('iStarPos', new THREE.InstancedBufferAttribute(a.pStarPos, 3))
  g.setAttribute('iStarCenter', new THREE.InstancedBufferAttribute(a.pStarCenter, 3))
  g.setAttribute('iStarAxis', new THREE.InstancedBufferAttribute(a.pStarAxis, 3))
  g.setAttribute('iColor', new THREE.InstancedBufferAttribute(a.pColor, 3))
  g.setAttribute('iOrb', new THREE.InstancedBufferAttribute(a.pOrb, 4))
  g.setAttribute('iMeta', new THREE.InstancedBufferAttribute(a.pMeta, 4))
  g.setAttribute('iDim', new THREE.InstancedBufferAttribute(a.pDim, 1))
  g.setAttribute('iSel', new THREE.InstancedBufferAttribute(a.pSel, 1))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
}

/** 把一组正交基绕 axis 所在平面倾一个小角，给行星轨道一点层次。 */
function tilted(
  u: readonly [number, number, number],
  v: readonly [number, number, number],
  axis: readonly [number, number, number],
  ang: number,
): [[number, number, number], [number, number, number]] {
  const c = Math.cos(ang)
  const s = Math.sin(ang)
  const nu: [number, number, number] = [
    u[0] * c + axis[0] * s, u[1] * c + axis[1] * s, u[2] * c + axis[2] * s,
  ]
  const nn = Math.hypot(nu[0], nu[1], nu[2]) || 1
  nu[0] /= nn; nu[1] /= nn; nu[2] /= nn
  return [nu, [v[0], v[1], v[2]]]
}
