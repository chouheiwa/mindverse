import * as THREE from 'three'
import { FBM, SIMPLEX3 } from './chunks'
import type { CinematicEnvironment } from './cinematic'
import { ResourceScope } from '../resourceScope'
import { NEBULA_CORE_DIAMETER_SCALE } from './scene'

// 星际气体：三层不同半径的球壳 + 一枚星系核心。
//
// 为什么是三层壳而不是一张背景图：
// 旧版把气体预渲染成位图再按相机做 2D 平移，转视角时它会「贴着屏幕滑」——
// 这是整张图最大的一处露馅。壳层是真的待在世界坐标里，相机一动，
// 内壳掠过的角度就比外壳大，视差自己就出来了。
//
// 为什么烘焙进 cube map 而不是每帧算：
// 域扭曲 fbm 单像素要跑三十来次 simplex，全屏逐帧算是两位数毫秒起步。
// 星云本来就只需要极慢的自转，一次性烘进立方体贴图之后每帧开销近乎为零。
// 用 cube 而不是等距柱状是为了避开两极挤压和接缝。

/**
 * 壳层参数：半径倍率、噪声频率、亮度、自转速度（弧度/秒）。
 *
 * gain 刻意压得很低。星云是背景，不是主体 —— 它一旦亮到能和恒星争，
 * 整张图就变成「站在云里」而不是「看向深空」。三层加起来的峰值也要留在
 * 1.0 以下，否则 tone map 之后全部塌成灰白，配色等于白配。
 */
const SHELLS = [
  { r: 1.00, freq: 3.4, warp: 1.10, low: 0.10, high: 0.62, flat: 1.45, dust: 0.55, spin: 0.0042 },
  { r: 1.62, freq: 2.3, warp: 0.85, low: 0.16, high: 0.70, flat: 1.05, dust: 0.38, spin: 0.0026 },
  { r: 2.45, freq: 1.5, warp: 0.55, low: 0.24, high: 0.80, flat: 0.72, dust: 0.20, spin: 0.0015 },
]

export interface NebulaLayer {
  group: THREE.Group
  update(t: number, camera: THREE.Camera): void
  /** 非全景模式下整体退让，否则星体一压暗，核心辉光就成了画面最亮的东西 */
  setDim(v: number): void
  dispose(): void
}

/**
 * @param radius 星系包围半径，壳层按它定尺度
 * @param palette 三种线性 RGB —— 取自本人星群的主色，让背景也是数据的一部分
 */
export function makeNebula(
  renderer: THREE.WebGLRenderer,
  radius: number,
  palette: [THREE.Color, THREE.Color, THREE.Color],
  environment: CinematicEnvironment,
): NebulaLayer {
  return ResourceScope.construct((scope) => makeNebulaScoped(renderer, radius, palette, environment, scope))
}

function makeNebulaScoped(
  renderer: THREE.WebGLRenderer,
  radius: number,
  palette: [THREE.Color, THREE.Color, THREE.Color],
  environment: CinematicEnvironment,
  scope: ResourceScope,
): NebulaLayer {
  const group = new THREE.Group()
  const shells: { mesh: THREE.Mesh; spin: number }[] = []
  const gains: { u: THREE.IUniform<number>; base: number }[] = []

  SHELLS.forEach((cfg, i) => {
    const cube = scope.use(bake(renderer, environment.nebulaBake, {
      freq: cfg.freq, warp: cfg.warp, low: cfg.low, high: cfg.high,
      flat: cfg.flat, dust: cfg.dust, seed: 3.7 + i * 17.3,
      colA: palette[0], colB: palette[1], colC: palette[2],
    }))

    const gain = environment.shellGain[i]
    const mat = scope.use(new THREE.ShaderMaterial({
      uniforms: {
        uMap: { value: cube.texture },
        uGain: { value: gain },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main() {
          vDir = position;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform samplerCube uMap;
        uniform float uGain;
        varying vec3 vDir;
        void main() {
          gl_FragColor = vec4(textureCube(uMap, normalize(vDir)).rgb * uGain, 1.0);
        }
      `,
      side: THREE.BackSide,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    }))

    const geo = scope.use(new THREE.BoxGeometry(1, 1, 1))
    const mesh = new THREE.Mesh(geo, mat)
    // 半边长 = radius * r * 11：相机最远 4.6R，必须始终待在内层壳里面
    mesh.scale.setScalar(radius * cfg.r * 22)
    mesh.renderOrder = -40 + i
    mesh.frustumCulled = false
    // 每层给一个固定的初始朝向，否则三层的结构会对齐成同心花纹
    mesh.rotation.set(i * 1.31, i * 2.17, i * 0.73)
    group.add(mesh)
    shells.push({ mesh, spin: cfg.spin })
    gains.push({ u: mat.uniforms.uGain, base: gain })
  })

  // 星系核心：真的钉在原点，所以它会随相机正确地视差，而不是永远糊在屏幕中央
  const core = makeCore(radius, palette[1], environment.coreGain, scope)
  group.add(core)
  gains.push({ u: (core.material as THREE.ShaderMaterial).uniforms.uGain, base: environment.coreGain })

  const dispose = scope.release()

  return {
    group,
    update(t, camera) {
      // 按绝对时间设角度，不累加 —— 累加会随帧率漂移
      shells.forEach((s, i) => {
        s.mesh.rotation.set(i * 1.31, i * 2.17 + t * s.spin, i * 0.73)
      })
      core.quaternion.copy(camera.quaternion)
    },
    setDim(v) {
      for (const g of gains) g.u.value = g.base * v
    },
    dispose,
  }
}

function makeCore(radius: number, tint: THREE.Color, gain: number, scope: ResourceScope): THREE.Mesh {
  const mat = scope.use(new THREE.ShaderMaterial({
    uniforms: { uTint: { value: tint.clone() }, uGain: { value: gain } },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uTint;
      uniform float uGain;
      varying vec2 vUv;
      void main() {
        // 扁的：星系核心是个透视中的盘，不是球
        vec2 p = (vUv - 0.5) * vec2(2.0, 5.2);
        float d = length(p);
        float halo = exp(-d * 2.6) * 0.16 + exp(-d * 7.5) * 0.40;
        gl_FragColor = vec4(mix(uTint, vec3(1.0), 0.45) * halo * uGain, 1.0);
      }
    `,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  }))
  const mesh = new THREE.Mesh(scope.use(new THREE.PlaneGeometry(
    radius * NEBULA_CORE_DIAMETER_SCALE,
    radius * NEBULA_CORE_DIAMETER_SCALE,
  )), mat)
  mesh.renderOrder = -5
  mesh.frustumCulled = false
  return mesh
}

interface BakeOpts {
  freq: number; warp: number; low: number; high: number
  flat: number; dust: number; seed: number
  colA: THREE.Color; colB: THREE.Color; colC: THREE.Color
}

/** 把噪声星云渲进一张立方体贴图。只在构造时跑一次。 */
function bake(renderer: THREE.WebGLRenderer, size: number, o: BakeOpts): THREE.WebGLCubeRenderTarget {
  const target = new THREE.WebGLCubeRenderTarget(size, {
    type: THREE.HalfFloatType,
    format: THREE.RGBAFormat,
    generateMipmaps: false,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
  })
  const temporary = new ResourceScope()
  try {

  const mat = temporary.use(new THREE.ShaderMaterial({
    uniforms: {
      uFreq: { value: o.freq }, uWarp: { value: o.warp },
      uLow: { value: o.low }, uHigh: { value: o.high },
      uFlat: { value: o.flat }, uDust: { value: o.dust },
      uSeed: { value: o.seed },
      uColA: { value: o.colA.clone() },
      uColB: { value: o.colB.clone() },
      uColC: { value: o.colC.clone() },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = position;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      ${SIMPLEX3}
      ${FBM}
      uniform float uFreq, uWarp, uLow, uHigh, uFlat, uDust, uSeed;
      uniform vec3 uColA, uColB, uColC;
      varying vec3 vDir;

      void main() {
        vec3 d = normalize(vDir);
        vec3 q = d * uFreq + uSeed;

        float n = warpedFbm(q, uWarp);
        float m = smoothstep(uLow, uHigh, n);

        // 两条独立的噪声通道决定色相，否则整片星云只有一个颜色
        float c1 = clamp(fbm(q * 1.63 + 7.0) * 0.5 + 0.5, 0.0, 1.0);
        vec3 col = mix(uColA, uColB, c1);
        col = mix(col, uColC, smoothstep(0.34, 0.95, n));

        // 尘埃带：真星系都有的暗痕，靠减法而不是画一条黑条
        float dust = smoothstep(0.15, 0.75, fbm(q * 2.6 - 13.0));
        m *= 1.0 - uDust * dust;

        // 盘是扁的：赤道浓、两极稀
        float band = exp(-pow(d.y * uFlat, 2.0));
        m *= mix(0.18, 1.0, band);

        gl_FragColor = vec4(col * m, 1.0);
      }
    `,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
  }))

  const scene = new THREE.Scene()
  const box = new THREE.Mesh(temporary.use(new THREE.BoxGeometry(10, 10, 10)), mat)
  box.frustumCulled = false
  scene.add(box)

  const cam = new THREE.CubeCamera(0.5, 40, target)
  const prevTarget = renderer.getRenderTarget()
  try {
    cam.update(renderer, scene)
  } finally {
    renderer.setRenderTarget(prevTarget)
  }

  temporary.dispose()
  return target
  } catch (cause) {
    temporary.dispose()
    target.dispose()
    throw cause
  }
}
