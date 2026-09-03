import * as THREE from 'three'
import type { Mode, Star, Universe } from '../../types'
import { DEPTH_FADE, ORBIT } from './chunks'
import { IGNITE_MS, IGNITE_START, IGNITE_STEP, starData, type StarDatum } from './starData'
import { ResourceScope } from '../resourceScope'
import { renderDim } from '../starVisibility'
export { modeDim, renderDim } from '../starVisibility'

// 恒星：core / glow / flare 三层点云叠在同一批坐标上。
//
// 三层共用一个 BufferGeometry —— 属性只上传一次，三次 draw call 就画完全部恒星。
// 公转、创世收敛、点火、闪烁、景深全在 vertex shader 里算，CPU 每帧只更新
// 几个 uniform。旧版每颗星每帧 createRadialGradient + arc + fill，
// 那既是性能问题，更是画质问题：手画的径向渐变不是光。
//
// 唯一每帧不算的是模式压暗（aDim），它只在用户切模式时更新一次。

/** 三层的尺寸倍率。core 是硬核，glow 是弥散辉光，flare 是衍射星芒。 */
const MUL = { core: 0.72, glow: 4.3, flare: 10.5 }
/** HDR 增益：让核心冲到 1.0 以上，bloom 才有东西可抓。 */
const GAIN = { core: 4.6, glow: 1.05, flare: 1.7 }
/**
 * 星芒阈值，卡在未闪烁的基础亮度上。
 *
 * 卡 0.85 意味着只有持续性最高的那十来颗会长芒，而且芒长随亮度连续变化。
 * 阈值低一点点，画面就会变成每颗星都插着十字的廉价滤镜 —— 这是这类图
 * 最容易掉进去的坑。也刻意不卡在闪烁后的亮度上：那会让芒忽长忽短。
 */
const SPIKE_THRESHOLD = 0.85

const VERT = /* glsl */ `
${ORBIT}
${DEPTH_FADE}

attribute vec3 aStart;
attribute vec3 aCenter;
attribute vec3 aAxis;
attribute vec3 aColor;
attribute float aPeriod;
attribute float aSize;
attribute float aBright;
attribute float aBurst;
attribute float aSeed;
attribute float aIgnite;
attribute float aDim;
attribute float aRot;
attribute float aBodyR;

uniform float uT;          // 毫秒
uniform float uConverge;   // 0..1，创世收敛
uniform float uProjScale;  // (drawingBufferHeight / 2) / tan(fov / 2)
uniform float uNear;
uniform float uFar;
uniform float uSizeMul;
uniform float uIgniteMs;
uniform float uLitFloor;  // 跳过创世时把全部星强制点亮
uniform float uBob;

uniform float uFlareShape;   // 1 = 星芒层，尺寸随亮度收缩
uniform float uFadeToBody;   // 1 = 靠近后交给球体接管（只有硬核层这么做）
uniform float uNearMul;      // 近距离时改用「恒星半径的多少倍」当精灵尺寸
uniform float uMaxPx;        // 屏幕尺寸上限

varying vec3 vColor;
varying float vAlpha;
varying float vBright;
varying float vBase;
varying float vRot;
varying float vSphereIn;

void main() {
  float lit = max(uLitFloor, clamp((uT - aIgnite) / uIgniteMs, 0.0, 1.0));

  vec3 target = orbitAround(position, aCenter, aAxis, aPeriod, uT * 0.001);
  // 沿自转轴的轻微起伏 —— 否则半径接近 0 的主星会僵在原地
  target += aAxis * sin(uT / (6400.0 + mod(aSeed * 311.0, 5200.0)) + aSeed) * uBob;

  vec3 p = mix(aStart, target, uConverge);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;

  float tw = 1.0 - (0.09 + 0.26 * aBurst)
           * (0.5 + 0.5 * sin(uT / (760.0 + mod(aSeed * 53.0, 900.0)) + aSeed * 1.7));

  vBright = aBright * tw;
  vBase = aBright;
  vColor = aColor;
  vRot = aRot;
  // 球体在 6→18px 之间渐显，硬核点精灵在同一区间渐隐 —— 两者在同一坐标上、
  // 用同一条曲线，加起来恒为一，所以看不出交接。
  // 阈值必须和 gl/bodies.ts 里恒星球体的 lod 一致；取 6 而不是 2，是因为
  // 全景里最大的恒星也才 6px 左右，卡在 2 会让全景提前变暗。
  float sphereIn = smoothstep(6.0, 18.0, aBodyR * uProjScale / viewZ);
  float handover = 1.0 - uFadeToBody * sphereIn;

  vSphereIn = sphereIn;
  vAlpha = vBright * aDim * lit * handover * depthFade(viewZ, uNear, uFar);

  // 远处：精灵尺寸沿用 aSize，那是让全景好看的那套标定。
  // 近处：改成恒星半径的固定倍数 —— 日冕本来就是恒星半径的几倍，
  // 而不是一个跟距离无关的巨大常数。不换的话飞进去时辉光有五千像素宽。
  float shape = mix(1.0, smoothstep(0.80, 1.0, aBright), uFlareShape);
  float world = mix(aSize * uSizeMul, aBodyR * uNearMul, sphereIn);
  gl_PointSize = min(world * (uProjScale / viewZ) * (0.35 + 0.65 * lit) * shape, uMaxPx);
}
`

const FRAG_CORE = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d2 = dot(uv, uv);
  if (d2 > 1.0) discard;
  // 热核偏白：恒星中心的有效色温总是高于外缘，纯色心会显得像塑料珠
  vec3 c = mix(vColor, vec3(1.0), 0.74);
  gl_FragColor = vec4(c * exp(-d2 * 7.5) * vAlpha * uGain, 1.0);
}
`

const FRAG_GLOW = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
varying float vSphereIn;
void main() {
  float d = length(gl_PointCoord * 2.0 - 1.0);
  if (d > 1.0) discard;
  // 两段叠加：内段紧、外段松。单段指数衰减会画出生硬的渐变环
  float a = exp(-d * 4.6) * 0.62 + pow(1.0 - d, 3.0) * 0.42;

  // 球体接管之后要把中心掏空 —— 这层是**日冕**，环在恒星外面。
  // 不掏空就是一坨加性光正好糊在球面上，临边昏暗和米粒组织全被冲成死白，
  // 球体等于白做。洞的半径对应精灵里球体占的那一份（1 / uNearMul * 2）。
  a *= mix(1.0, smoothstep(0.13, 0.30, d), vSphereIn);

  gl_FragColor = vec4(vColor * a * vAlpha * uGain, 1.0);
}
`

const FRAG_FLARE = /* glsl */ `
uniform float uGain;
uniform float uThreshold;
varying vec3 vColor;
varying float vAlpha;
varying float vBase;
varying float vRot;
void main() {
  // 亮度不够就整个精灵不画 —— 每颗星都长芒会立刻变成廉价滤镜
  float gate = smoothstep(uThreshold, uThreshold + 0.14, vBase);
  if (gate <= 0.001) discard;

  vec2 uv = gl_PointCoord * 2.0 - 1.0;
  float d = length(uv);
  if (d > 1.0) discard;

  float c = cos(vRot);
  float s = sin(vRot);
  vec2 p = vec2(uv.x * c - uv.y * s, uv.x * s + uv.y * c);

  // 四主芒 + 两副芒：沿芒方向衰减慢，垂直方向衰减极快，这才是衍射的形状
  float h  = exp(-abs(p.x) * 2.4)  * exp(-abs(p.y) * 150.0);
  float v  = exp(-abs(p.y) * 2.4)  * exp(-abs(p.x) * 150.0);
  float k  = 0.70710678;
  float u1 = (p.x + p.y) * k;
  float u2 = (p.x - p.y) * k;
  float a1 = exp(-abs(u1) * 3.6) * exp(-abs(u2) * 230.0);
  float a2 = exp(-abs(u2) * 3.6) * exp(-abs(u1) * 230.0);

  float spikes = (h + v + 0.42 * (a1 + a2)) * smoothstep(1.0, 0.12, d);
  gl_FragColor = vec4(mix(vColor, vec3(1.0), 0.62) * spikes * vAlpha * gate * uGain, 1.0);
}
`

export interface StarLayer {
  group: THREE.Group
  /** 恒星在几何体里的顺序，拾取时按同样顺序算屏幕位置 */
  order: Star[]
  setUniform(name: string, value: number): void
  setDim(mode: Mode, u: Universe, wormIdx: number): void
  /** 点火全部完成的时刻（毫秒） */
  igniteEnd: number
  dispose(): void
}

export function makeStars(u: Universe, reduceMotion: boolean, data: StarDatum[] = starData(u)): StarLayer {
  return ResourceScope.construct((scope) => makeStarsScoped(u, reduceMotion, data, scope))
}

function makeStarsScoped(u: Universe, reduceMotion: boolean, data: StarDatum[], scope: ResourceScope): StarLayer {
  const stars = u.stars
  const n = stars.length

  const pos = new Float32Array(n * 3)
  const start = new Float32Array(n * 3)
  const center = new Float32Array(n * 3)
  const axis = new Float32Array(n * 3)
  const color = new Float32Array(n * 3)
  const period = new Float32Array(n)
  const size = new Float32Array(n)
  const bright = new Float32Array(n)
  const burst = new Float32Array(n)
  const seed = new Float32Array(n)
  const igniteAt = new Float32Array(n)
  const dim = new Float32Array(n).fill(1)
  const rot = new Float32Array(n)
  const bodyR = new Float32Array(n)

  data.forEach((d, i) => {
    pos.set(d.p, i * 3)
    center.set(d.center, i * 3)
    axis.set(d.axis, i * 3)
    start.set(d.start, i * 3)
    color.set(d.color, i * 3)
    period[i] = d.period
    size[i] = d.pointSize
    bright[i] = d.bright
    burst[i] = reduceMotion ? 0 : d.burst
    seed[i] = d.seed
    igniteAt[i] = d.ignite
    rot[i] = d.rot
    bodyR[i] = d.bodyR
  })

  const geo = new THREE.BufferGeometry()
  scope.use(geo)
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  geo.setAttribute('aStart', new THREE.BufferAttribute(start, 3))
  geo.setAttribute('aCenter', new THREE.BufferAttribute(center, 3))
  geo.setAttribute('aAxis', new THREE.BufferAttribute(axis, 3))
  geo.setAttribute('aColor', new THREE.BufferAttribute(color, 3))
  geo.setAttribute('aPeriod', new THREE.BufferAttribute(period, 1))
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1))
  geo.setAttribute('aBright', new THREE.BufferAttribute(bright, 1))
  geo.setAttribute('aBurst', new THREE.BufferAttribute(burst, 1))
  geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
  geo.setAttribute('aIgnite', new THREE.BufferAttribute(igniteAt, 1))
  geo.setAttribute('aDim', new THREE.BufferAttribute(dim, 1))
  geo.setAttribute('aRot', new THREE.BufferAttribute(rot, 1))
  geo.setAttribute('aBodyR', new THREE.BufferAttribute(bodyR, 1))
  // 点云永远围绕原点，包围球一次算好，省得每帧重算
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)

  const shared = {
    uT: { value: 0 },
    uConverge: { value: reduceMotion ? 1 : 0 },
    uProjScale: { value: 1000 },
    uNear: { value: 1 },
    uFar: { value: 4000 },
    uIgniteMs: { value: IGNITE_MS },
    uLitFloor: { value: reduceMotion ? 1 : 0 },
    uBob: { value: reduceMotion ? 0 : 1.35 },
  }

  const mk = (frag: string, mul: number, gain: number, extra: Record<string, { value: number }> = {}) =>
    scope.use(new THREE.ShaderMaterial({
      uniforms: { ...shared, uSizeMul: { value: mul }, uGain: { value: gain }, uFlareShape: { value: 0 }, uFadeToBody: { value: 0 },
        uNearMul: { value: 7 }, uMaxPx: { value: 520 }, ...extra },
      vertexShader: VERT,
      fragmentShader: frag,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    }))

  const matGlow = mk(FRAG_GLOW, MUL.glow, GAIN.glow, { uNearMul: { value: 7.5 }, uMaxPx: { value: 520 } })
  const matCore = mk(FRAG_CORE, MUL.core, GAIN.core, { uFadeToBody: { value: 1 }, uMaxPx: { value: 90 } })
  // 星芒是相机的衍射，不是天体的一部分：近距离不该跟着无限长大
  const matFlare = mk(FRAG_FLARE, MUL.flare, GAIN.flare, {
    uThreshold: { value: SPIKE_THRESHOLD },
    uFlareShape: { value: 1 },
    uNearMul: { value: 26 },
    uMaxPx: { value: 360 },
  })

  const group = new THREE.Group()
  for (const [mat, order] of [[matGlow, 10], [matCore, 12], [matFlare, 14]] as const) {
    const pts = new THREE.Points(geo, mat)
    pts.renderOrder = order
    pts.frustumCulled = false
    group.add(pts)
  }

  const mats = [matGlow, matCore, matFlare]
  const dimAttr = geo.getAttribute('aDim') as THREE.BufferAttribute
  const dispose = scope.release()

  return {
    group,
    order: stars,
    igniteEnd: IGNITE_START + n * IGNITE_STEP + 1500,
    setUniform(name, value) {
      for (const m of mats) if (m.uniforms[name]) m.uniforms[name].value = value
    },
    setDim(mode, uni, wormIdx) {
      for (let i = 0; i < n; i++) dim[i] = renderDim(stars[i], mode, uni, wormIdx)
      dimAttr.needsUpdate = true
    },
    dispose,
  }
}
