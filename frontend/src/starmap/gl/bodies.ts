import * as THREE from 'three'
import type { Mode, Universe } from '../../types'
import { selectPlanetData, type QuestionPlanetDatum, type UniverseIndex } from '../../domain/universe'
import { DEPTH_FADE, ORBIT, SIMPLEX3 } from './chunks'
import { starData, starWorldPosition, type StarDatum } from './starData'
import { renderDim } from './stars'
import { PLANET_CONVERGENCE_START, PLANET_STAR_LOD_END_PX, PLANET_STAR_LOD_START_PX, indexPlanetsByStar } from '../planetVisibility'
import { ownerOpacity } from '../focusEmphasis'
import { ResourceScope } from '../resourceScope'
import {
  buildMaterialTimeline,
  groupPlanetInstances,
  nextPlanetLod,
  planetFamilyIndex,
  planetInstanceIndexMap,
  planetMaterialInput,
  type PlanetInstanceIndexMap,
  type PlanetLod,
  type PlanetMaterialInput,
} from './planetMaterials'

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
// 行星 = 恒星引用、且已进入全局索引的真实知乎问题。旧 Evidence 不生成行星。
// 只有问题下存在本人创作回答的真实 binding 时，行星才带暖色自发光；收藏关系与
// 纯公共问题都只反射恒星光。新鲜度只取回答的 PublishedAt / UpdatedAt。

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
// xyz=orbit basis U, w=dim
attribute vec4 iBasisDim;
attribute vec3 iStarPos;
attribute vec3 iStarCenter;
// xyz=star axis, w=LOD (0 far, 1 medium, 2 near)
attribute vec4 iAxisLod;
// xyz=star color, w=selected
attribute vec4 iColorSelected;
// x=orbitR y=phase z=period w=planetR
attribute vec4 iOrb;
// x=own*2+fresh y=starSeed z=starR w=starPeriod
//   own   ∈{0,1}  是否本人创作
//   fresh ∈[0,1)  内容的新旧，1 近 0 远
attribute vec4 iMeta;
// x=seed y=answerDensity z=freshness w=familyIndex
attribute vec4 iSurface;
// x=timeSpan y=hasTimeSpan z=created w=collected
attribute vec4 iChronicle;

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
varying float vFresh;
varying float vSeed;
varying float vSel;
varying float vPlanetPx;
varying vec3 vLocal;
varying float vDensity;
varying float vCreated;
varying float vLod;

void main() {
  vec3 starW = orbitAround(iStarPos, iStarCenter, iAxisLod.xyz, iMeta.w, uT * 0.001);
  starW += iAxisLod.xyz * sin(uT / (6400.0 + mod(iMeta.y * 311.0, 5200.0)) + iMeta.y) * uBob;

  float th = iOrb.y + 6.28318530718 / iOrb.z * (uT * 0.001);
  vec3 planetV = normalize(cross(iAxisLod.xyz, iBasisDim.xyz));
  vec3 centerW = starW + (iBasisDim.xyz * cos(th) + planetV * sin(th)) * iOrb.x;
  vec3 nrm = normalize(position);
  vec3 world = centerW + nrm * iOrb.w;

  vec4 mvC = modelViewMatrix * vec4(centerW, 1.0);
  vec4 mvS = modelViewMatrix * vec4(starW, 1.0);
  vec4 mv = modelViewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * mv;

  // LOD 挂在**恒星**的屏幕大小上，不是行星自己的 —— 否则一颗大行星会
  // 在恒星还是个点的时候先冒出来
  float starPx = iMeta.z * uProjScale / max(1.0, -mvS.z);
  float lod = smoothstep(${PLANET_STAR_LOD_START_PX.toFixed(1)}, ${PLANET_STAR_LOD_END_PX.toFixed(1)}, starPx);

  vN = normalize(normalMatrix * nrm);
  vL = mvS.xyz - mv.xyz;
  vV = -mv.xyz;
  vFresh = iSurface.z;
  vSeed = iSurface.x;
  vSel = iColorSelected.w;
  vPlanetPx = iOrb.w * uProjScale / max(1.0, -mvC.z);
  vLocal = nrm;
  vDensity = iSurface.y;
  vCreated = iChronicle.z;
  vLod = iAxisLod.w;
  vColor = iColorSelected.xyz;
  vAlpha = iBasisDim.w * lod * smoothstep(${PLANET_CONVERGENCE_START.toFixed(2)}, 1.0, uConverge)
         * depthFade(max(1.0, -mvC.z), uNear, uFar);
}
`

const PLANET_FRAG = /* glsl */ `
${SIMPLEX3}
uniform float uT;
uniform float uGain;
uniform float uMotion;
varying vec3 vColor;
varying vec3 vN;
varying vec3 vL;
varying vec3 vV;
varying float vAlpha;
varying float vFresh;
varying float vSeed;
varying float vSel;
varying float vPlanetPx;
varying vec3 vLocal;
varying float vDensity;
varying float vCreated;
varying float vLod;

void main() {
  if (vAlpha <= 0.004) discard;
  vec3 N = normalize(vN);
  vec3 L = normalize(vL);
  vec3 V = normalize(vV);

  float mediumLod = step(0.5, vLod) * smoothstep(12.0, 18.0, vPlanetPx);
  float nearLod = step(1.5, vLod) * smoothstep(72.0, 84.0, vPlanetPx);
  float terrain = 0.0;
  float detail = 0.0;
  if (vLod >= 0.5) {
#if PLANET_FAMILY == 0
    terrain = snoise(vLocal * 4.7 + vSeed) * 0.72 + snoise(vLocal * 10.0 - vSeed) * 0.28;
#elif PLANET_FAMILY == 1
    terrain = sin((vLocal.y + snoise(vLocal * 3.2 + vSeed) * 0.10) * 38.0);
#elif PLANET_FAMILY == 2
    float cloudTime = uT * 0.000035 * uMotion;
    terrain = snoise(vLocal * 3.1 + vec3(cloudTime, vSeed, -cloudTime));
#else
    vec3 archiveGrid = abs(fract(vLocal * 11.0 + vSeed) - 0.5);
    terrain = 1.0 - smoothstep(0.035, 0.12, min(archiveGrid.x, archiveGrid.y));
#endif
  }
  if (vLod >= 1.5) {
#if PLANET_FAMILY == 0
    detail = snoise(vLocal * 28.0 + vSeed * 3.0);
#elif PLANET_FAMILY == 1
    detail = sin(vLocal.y * 118.0 + snoise(vLocal * 9.0) * 2.2);
#elif PLANET_FAMILY == 2
    float highCloudTime = uT * 0.000065 * uMotion;
    detail = snoise(vLocal * 12.0 + vec3(-highCloudTime, highCloudTime, vSeed));
#else
    detail = snoise(vLocal * 24.0 + floor(vDensity * 8.0));
#endif
  }
  float roughness = clamp(0.70 - terrain * 0.12 * mediumLod - detail * 0.07 * nearLod, 0.35, 0.92);
  vec3 shapedN = normalize(N + vec3(terrain, detail, -terrain) * (0.045 * mediumLod + 0.025 * nearLod));
  float tex = 0.82 + 0.12 * terrain * mediumLod + 0.06 * detail * nearLod;
  // 岩石本色里掺一点恒星的颜色：行星是被这颗恒星照亮的
  vec3 rock = mix(vec3(0.28, 0.31, 0.40), vColor, 0.30) * tex;

  vec3 col;
  // 每颗行星都由自己的恒星照亮 —— 这是物理，对谁都成立。
  //
  // 这里携带的是问题回答的最近公开发布时间／更新时间：近期仍有公开活动的
  // 问题反照率高、带一层大气轮缘，久远或无公开时间的更暗、更粗糙。
  float d = max(0.0, dot(shapedN, L));
  float term = smoothstep(-0.06, 0.28, dot(shapedN, L));
  float albedo = mix(0.30, 1.0, vFresh);
  col = rock * albedo * (0.05 + (1.0 - roughness * 0.08) * d) * term;
  float atmo = pow(1.0 - max(0.0, dot(N, V)), 3.0) * vFresh * 0.55;
  col += vec3(0.42, 0.58, 0.95) * atmo * (0.25 + 0.75 * d);

  // 存在真实 created binding：夜面透出一点暖光。
  if (vCreated > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 2.2);
    vec3 glow = vec3(1.0, 0.80, 0.48);
    col += glow * (0.09 + rim * 0.36) * (1.0 - term * 0.5);
  }

  // 选中：加一道冷色轮缘。不整颗提亮 —— 那会把「自己发光 / 只反射」这条
  // 语义抹平，选中态不该篡改数据本身在说的事
  if (vSel > 0.5) {
    float rim = pow(1.0 - max(0.0, dot(N, V)), 1.8);
    float scanPhase = mix(0.82, fract(uT * 0.00012), uMotion);
    float longitude = atan(vLocal.z, vLocal.x) / 6.28318530718 + 0.5;
    float latitude = asin(clamp(vLocal.y, -1.0, 1.0)) / 3.14159265359 + 0.5;
    float longitudeScan = 1.0 - smoothstep(0.018, 0.055, abs(longitude - scanPhase));
    float latitudeScan = 1.0 - smoothstep(0.018, 0.055, abs(latitude - (1.0 - scanPhase)));
    float scan = max(longitudeScan, latitudeScan);
    col += vec3(0.52, 0.72, 1.0) * (0.14 + rim * 1.6 + scan * 0.72);
  }

  gl_FragColor = vec4(col * vAlpha * uGain, 1.0);
}
`

function planetFragmentShader(familyIndex: number): string {
  return `#define PLANET_FAMILY ${familyIndex}\n${PLANET_FRAG}`
}

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
  question: QuestionPlanetDatum['question']
  answerCount: number
  created: boolean
  collected: boolean
  latestPublicAt?: number
  answers: QuestionPlanetDatum['answers']
  material: PlanetMaterialInput
  orbitIndex: number
  /** 实例下标，用于置选中态 */
  index: number
  u: [number, number, number]
  v: [number, number, number]
  orbitR: number
  phase: number
  period: number
  radius: number
}

export interface BodyLayer {
  group: THREE.Group
  setUniform(name: string, value: number): void
  setMode(mode: Mode, u: Universe, wormIdx: number): void
  setFocus(starId: string | null): void
  /** 只更新当前聚焦恒星系的材质 LOD，并保留每实例上一帧状态以实现滞回。 */
  updatePlanetLods(camera: THREE.Camera, elapsedMs: number, projectionScale: number): void
  /** 供拾取与飞入复用，顺序与 u.stars 一致 */
  data: StarDatum[]
  /** 全部行星，顺序即实例顺序 */
  planets: PlanetDatum[]
  /** CPU 拾取使用的全局行星下标与家族批次下标映射。 */
  planetIndexMap: PlanetInstanceIndexMap
  /** 当前恒星系的预索引行星，避免拾取扫描整个宇宙。 */
  planetsForStar(star: StarDatum): readonly PlanetDatum[]
  /** 置选中；传 -1 清空 */
  setSelected(index: number): void
  dispose(): void
}

export function makeBodies(index: UniverseIndex, reduceMotion: boolean): BodyLayer {
  return ResourceScope.construct((scope) => makeBodiesScoped(index, reduceMotion, scope))
}

function makeBodiesScoped(index: UniverseIndex, reduceMotion: boolean, scope: ResourceScope): BodyLayer {
  const u = index.universe
  const data = starData(u)
  const n = data.length

  // ── 恒星球体 ──
  const sphere = scope.use(new THREE.SphereGeometry(1, 32, 20))
  const starGeo = scope.use(new THREE.InstancedBufferGeometry())
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

  const starMat = scope.use(new THREE.ShaderMaterial({
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
  }))
  const starMesh = new THREE.Mesh(starGeo, starMat)
  starMesh.renderOrder = 9
  starMesh.frustumCulled = false

  // ── 行星与轨道 ──
  //
  // 每个由恒星显式引用、并存在于全局索引的问题生成一颗星系内行星。
  // 材质输入在 CPU 侧统一从已收录答案派生；Shader 只接收归一化数值。
  const selectedQuestions = data.map((d) => selectPlanetData(index, d.s))
  const timeline = buildMaterialTimeline([...index.answersById.values()])
  const planets: { d: StarDatum; idx: number; datum: QuestionPlanetDatum; material: PlanetMaterialInput }[] = []
  data.forEach((d, starIndex) => selectedQuestions[starIndex].forEach((datum, idx) => planets.push({
    d,
    idx,
    datum,
    material: planetMaterialInput(datum, timeline),
  })))
  const pn = planets.length

  const pU = new Float32Array(pn * 3)
  const pV = new Float32Array(pn * 3)
  const pStarPos = new Float32Array(pn * 3)
  const pStarCenter = new Float32Array(pn * 3)
  const pStarAxis = new Float32Array(pn * 3)
  const pColor = new Float32Array(pn * 3)
  const pOrb = new Float32Array(pn * 4)
  const pMeta = new Float32Array(pn * 4)
  const pSurface = new Float32Array(pn * 4)
  const pChronicle = new Float32Array(pn * 4)
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
    const rad = PLANET_MIN + (PLANET_MAX - PLANET_MIN) * p.material.answerDensity

    pU.set(uu, i * 3)
    pV.set(vv, i * 3)
    pStarPos.set(d.p, i * 3)
    pStarCenter.set(d.center, i * 3)
    pStarAxis.set(d.axis, i * 3)
    pColor.set(d.color, i * 3)
    pOrb.set([r, phase, period, rad], i * 4)
    pMeta.set([(p.material.created ? 2 : 0) + p.material.freshness, d.seed, d.bodyR, d.period], i * 4)
    pSurface.set([
      p.material.seed,
      p.material.answerDensity,
      p.material.freshness,
      planetFamilyIndex(p.material.family),
    ], i * 4)
    pChronicle.set([
      p.material.timeSpan ?? 0,
      p.material.timeSpan === null ? 0 : 1,
      p.material.created ? 1 : 0,
      p.material.collected ? 1 : 0,
    ], i * 4)
    pStarIndex[i] = starIndexOf.get(d)!
    planetData.push({
      star: d,
      question: p.datum.question,
      answerCount: p.datum.answerCount,
      created: p.datum.created,
      collected: p.datum.collected,
      latestPublicAt: p.datum.latestPublicAt,
      answers: p.datum.answers,
      material: p.material,
      orbitIndex: p.datum.orbitIndex,
      index: i,
      u: uu, v: vv, orbitR: r, phase, period, radius: rad,
    })
  })

  const planetSphere = scope.use(new THREE.SphereGeometry(1, 20, 14))
  const planetGroups = groupPlanetInstances(planets.map(({ material }) => material))
  const planetIndexMap = planetInstanceIndexMap(planetGroups, pn)
  const planetBatches = planetGroups.map((planetGroup) => {
    const count = planetGroup.globalIndices.length
    const local = batchArrays(planetGroup.globalIndices, {
      pU, pV, pStarPos, pStarCenter, pStarAxis, pColor, pOrb, pMeta, pSurface, pChronicle, pDim, pSel,
    })
    const geometry = scope.use(new THREE.InstancedBufferGeometry())
    geometry.index = planetSphere.index
    geometry.setAttribute('position', planetSphere.getAttribute('position'))
    geometry.instanceCount = count
    attachPlanetOrbitAttrs(geometry, local)
    geometry.setAttribute('iSurface', new THREE.InstancedBufferAttribute(local.pSurface, 4))
    geometry.setAttribute('iChronicle', new THREE.InstancedBufferAttribute(local.pChronicle, 4))
    const basisDim = new Float32Array(count * 4)
    const colorSelected = new Float32Array(count * 4)
    const axisLod = new Float32Array(count * 4)
    for (let localIndex = 0; localIndex < count; localIndex++) {
      basisDim.set(local.pU.subarray(localIndex * 3, localIndex * 3 + 3), localIndex * 4)
      basisDim[localIndex * 4 + 3] = local.pDim[localIndex]
      colorSelected.set(local.pColor.subarray(localIndex * 3, localIndex * 3 + 3), localIndex * 4)
      colorSelected[localIndex * 4 + 3] = local.pSel[localIndex]
      axisLod.set(local.pStarAxis.subarray(localIndex * 3, localIndex * 3 + 3), localIndex * 4)
    }
    geometry.setAttribute('iBasisDim', new THREE.InstancedBufferAttribute(basisDim, 4))
    geometry.setAttribute('iColorSelected', new THREE.InstancedBufferAttribute(colorSelected, 4))
    geometry.setAttribute('iAxisLod', new THREE.InstancedBufferAttribute(axisLod, 4))

    const familyIndex = planetFamilyIndex(planetGroup.family)
    const material = scope.use(new THREE.ShaderMaterial({
      uniforms: { ...shared(), uGain: { value: GAIN.planet }, uMotion: { value: reduceMotion ? 0 : 1 } },
      vertexShader: PLANET_VERT,
      fragmentShader: planetFragmentShader(familyIndex),
      transparent: true,
      depthTest: true,
      depthWrite: true,
    }))
    const mesh = new THREE.InstancedMesh(geometry, material, count)
    mesh.userData.planetFamily = planetGroup.family
    mesh.renderOrder = 9
    mesh.frustumCulled = false
    return {
      family: planetGroup.family,
      globalIndices: planetGroup.globalIndices,
      geometry,
      material,
      mesh,
      basisDim,
      colorSelected,
      axisLod,
      basisDimAttribute: geometry.getAttribute('iBasisDim') as THREE.InstancedBufferAttribute,
      colorSelectedAttribute: geometry.getAttribute('iColorSelected') as THREE.InstancedBufferAttribute,
      axisLodAttribute: geometry.getAttribute('iAxisLod') as THREE.InstancedBufferAttribute,
    }
  })

  // 轨道环：底几何是一圈单位圆的线段，实例化到每条轨道上
  const SEG = 72
  const ringPos = new Float32Array(SEG * 2 * 3)
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * Math.PI * 2
    const a1 = ((i + 1) / SEG) * Math.PI * 2
    ringPos.set([Math.cos(a0), Math.sin(a0), 0, Math.cos(a1), Math.sin(a1), 0], i * 6)
  }
  const ringGeo = scope.use(new THREE.InstancedBufferGeometry())
  ringGeo.setAttribute('position', new THREE.BufferAttribute(ringPos, 3))
  ringGeo.instanceCount = pn
  attachOrbitAttrs(ringGeo, { pU, pV, pStarPos, pStarCenter, pStarAxis, pColor, pOrb, pMeta, pDim, pSel })

  const ringMat = scope.use(new THREE.ShaderMaterial({
    uniforms: { ...shared(), uGain: { value: GAIN.ring } },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
  }))
  const ringMesh = new THREE.LineSegments(ringGeo, ringMat)
  ringMesh.renderOrder = 8.5
  ringMesh.frustumCulled = false

  const group = new THREE.Group()
  group.add(ringMesh, starMesh, ...planetBatches.map(({ mesh }) => mesh))

  const mats = [starMat, ringMat, ...planetBatches.map(({ material }) => material)]
  const sMetaAttr = starGeo.getAttribute('iMeta') as THREE.InstancedBufferAttribute
  const rDimAttr = ringGeo.getAttribute('iDim') as THREE.InstancedBufferAttribute
  const rSelAttr = ringGeo.getAttribute('iSel') as THREE.InstancedBufferAttribute
  let selected = -1
  const planetsByStar = indexPlanetsByStar(planetData)
  const planetLods: PlanetLod[] = planetData.map(() => 'far')
  const noPlanets: readonly PlanetDatum[] = Object.freeze([])
  let activeLodPlanets = noPlanets
  const lodWorld = new THREE.Vector3()
  const lodView = new THREE.Vector3()
  const batchByFamily = new Map(planetBatches.map((batch) => [batch.family, batch]))
  let modeDims = data.map(() => 1)
  let focusedStarId: string | null = null
  let focusedLodStar: StarDatum | null = null
  const dispose = scope.release()
  const applyDims = () => {
    for (let i = 0; i < n; i++) sMeta[i * 2 + 1] = modeDims[i] * ownerOpacity(data[i].s.c, focusedStarId)
    for (let i = 0; i < pn; i++) pDim[i] = modeDims[pStarIndex[i]] * ownerOpacity(planetData[i].star.s.c, focusedStarId)
    for (const batch of planetBatches) {
      batch.globalIndices.forEach((globalIndex, localIndex) => { batch.basisDim[localIndex * 4 + 3] = pDim[globalIndex] })
      batch.basisDimAttribute.needsUpdate = true
    }
    sMetaAttr.needsUpdate = true
    rDimAttr.needsUpdate = true
  }

  return {
    group,
    data,
    planets: planetData,
    planetIndexMap,
    planetsForStar: (star) => planetsByStar.get(star) ?? [],
    setSelected(index) {
      if (index === selected) return
      if (selected >= 0) {
        pSel[selected] = 0
        const previous = planetIndexMap.toLocal(selected)
        if (previous) {
          const batch = planetBatches.find(({ family }) => family === previous.family)!
          batch.colorSelected[previous.instanceIndex * 4 + 3] = 0
          batch.colorSelectedAttribute.needsUpdate = true
        }
      }
      selected = index >= 0 && index < pn ? index : -1
      if (selected >= 0) {
        pSel[selected] = 1
        const current = planetIndexMap.toLocal(selected)!
        const batch = planetBatches.find(({ family }) => family === current.family)!
        batch.colorSelected[current.instanceIndex * 4 + 3] = 1
        batch.colorSelectedAttribute.needsUpdate = true
      }
      rSelAttr.needsUpdate = true
    },
    updatePlanetLods(camera, elapsedMs, projectionScale) {
      const nextActive = focusedLodStar === null ? noPlanets : planetsByStar.get(focusedLodStar) ?? noPlanets
      const changedBatches = new Set<(typeof planetBatches)[number]>()
      const writeLod = (planet: PlanetDatum, lod: PlanetLod) => {
        if (planetLods[planet.index] === lod) return
        planetLods[planet.index] = lod
        const local = planetIndexMap.toLocal(planet.index)!
        const batch = batchByFamily.get(local.family)!
        batch.axisLod[local.instanceIndex * 4 + 3] = lod === 'far' ? 0 : lod === 'medium' ? 1 : 2
        changedBatches.add(batch)
      }
      if (nextActive !== activeLodPlanets) {
        for (const planet of activeLodPlanets) writeLod(planet, 'far')
        activeLodPlanets = nextActive
      }
      camera.updateMatrixWorld()
      const bob = reduceMotion ? 0 : 1.35
      for (const planet of activeLodPlanets) {
        starWorldPosition(planet.star, elapsedMs, bob, lodWorld)
        const theta = planet.phase + ((Math.PI * 2) / planet.period) * (elapsedMs / 1000)
        const cosine = Math.cos(theta)
        const sine = Math.sin(theta)
        lodWorld.set(
          lodWorld.x + (planet.u[0] * cosine + planet.v[0] * sine) * planet.orbitR,
          lodWorld.y + (planet.u[1] * cosine + planet.v[1] * sine) * planet.orbitR,
          lodWorld.z + (planet.u[2] * cosine + planet.v[2] * sine) * planet.orbitR,
        )
        lodView.copy(lodWorld).applyMatrix4(camera.matrixWorldInverse)
        const projectedRadius = planet.radius * projectionScale / Math.max(1, -lodView.z)
        writeLod(planet, nextPlanetLod(planetLods[planet.index], projectedRadius))
      }
      for (const batch of changedBatches) batch.axisLodAttribute.needsUpdate = true
    },
    setUniform(name, value) {
      for (const m of mats) if (m.uniforms[name]) m.uniforms[name].value = value
    },
    setFocus(starId) {
      focusedStarId = starId
      focusedLodStar = starId === null ? null : data.find((datum) => datum.s.c === starId) ?? null
      applyDims()
    },
    setMode(mode, uni, wormIdx) {
      modeDims = data.map((d) => renderDim(d.s, mode, uni, wormIdx))
      applyDims()
    },
    dispose,
  }
}

function attachPlanetOrbitAttrs(g: THREE.InstancedBufferGeometry, a: GlobalPlanetArrays) {
  g.setAttribute('iStarPos', new THREE.InstancedBufferAttribute(a.pStarPos, 3))
  g.setAttribute('iStarCenter', new THREE.InstancedBufferAttribute(a.pStarCenter, 3))
  g.setAttribute('iOrb', new THREE.InstancedBufferAttribute(a.pOrb, 4))
  g.setAttribute('iMeta', new THREE.InstancedBufferAttribute(a.pMeta, 4))
  g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6)
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

interface GlobalPlanetArrays {
  pU: Float32Array
  pV: Float32Array
  pStarPos: Float32Array
  pStarCenter: Float32Array
  pStarAxis: Float32Array
  pColor: Float32Array
  pOrb: Float32Array
  pMeta: Float32Array
  pSurface: Float32Array
  pChronicle: Float32Array
  pDim: Float32Array
  pSel: Float32Array
}

function batchArrays(globalIndices: readonly number[], source: GlobalPlanetArrays): GlobalPlanetArrays {
  const result: GlobalPlanetArrays = {
    pU: new Float32Array(globalIndices.length * 3),
    pV: new Float32Array(globalIndices.length * 3),
    pStarPos: new Float32Array(globalIndices.length * 3),
    pStarCenter: new Float32Array(globalIndices.length * 3),
    pStarAxis: new Float32Array(globalIndices.length * 3),
    pColor: new Float32Array(globalIndices.length * 3),
    pOrb: new Float32Array(globalIndices.length * 4),
    pMeta: new Float32Array(globalIndices.length * 4),
    pSurface: new Float32Array(globalIndices.length * 4),
    pChronicle: new Float32Array(globalIndices.length * 4),
    pDim: new Float32Array(globalIndices.length),
    pSel: new Float32Array(globalIndices.length),
  }
  const copy = (target: Float32Array, input: Float32Array, width: number, globalIndex: number, localIndex: number) => {
    target.set(input.subarray(globalIndex * width, globalIndex * width + width), localIndex * width)
  }
  globalIndices.forEach((globalIndex, localIndex) => {
    copy(result.pU, source.pU, 3, globalIndex, localIndex)
    copy(result.pV, source.pV, 3, globalIndex, localIndex)
    copy(result.pStarPos, source.pStarPos, 3, globalIndex, localIndex)
    copy(result.pStarCenter, source.pStarCenter, 3, globalIndex, localIndex)
    copy(result.pStarAxis, source.pStarAxis, 3, globalIndex, localIndex)
    copy(result.pColor, source.pColor, 3, globalIndex, localIndex)
    copy(result.pOrb, source.pOrb, 4, globalIndex, localIndex)
    copy(result.pMeta, source.pMeta, 4, globalIndex, localIndex)
    copy(result.pSurface, source.pSurface, 4, globalIndex, localIndex)
    copy(result.pChronicle, source.pChronicle, 4, globalIndex, localIndex)
    result.pDim[localIndex] = source.pDim[globalIndex]
    result.pSel[localIndex] = source.pSel[globalIndex]
  })
  return result
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
