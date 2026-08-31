import * as THREE from 'three'
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
import type { Universe } from '../../types'
import { makeNebula } from './nebula'
import { cinematicEnvironment } from './cinematic'
import { makeStars } from './stars'
import { makeDust } from './dust'
import { makeRings } from './rings'
import { makeOverlay3D } from './overlay3d'
import { FOV, nebulaPalette, sceneRadius } from './scene'

// 一次性静帧渲染，给宇宙身份证用。
//
// 分享卡必须和实时星图长在同一套渲染管线上。旧版分享卡自己用 Canvas 2D
// 又画了一遍气体和星场 —— 两套代码、两种画质，卡片和星图看着不像同一个产品。
// 这里直接开一个离屏 WebGL 上下文跑同样的图层，画完即弃。
//
// 刻意把时间钉在 0：同一份数据必须导出同一张图，不能这次导出和上次不一样。

/** 星云烘焙在静帧里降一档：一次性开销，没必要为一张 540 宽的图烤 512。 */
const BAKE = 256

/** 星群名在静帧里的落点，交给卡片用同一套相机把文字压上去。 */
export interface StillLabel {
  name: string
  n: number
  x: number
  y: number
}

export interface Still {
  canvas: HTMLCanvasElement
  labels: StillLabel[]
}

export function renderStill(u: Universe, w: number, h: number): Still {
  const canvas = document.createElement('canvas')
  const renderer = new THREE.WebGLRenderer({
    canvas, antialias: false, alpha: false, stencil: false,
    preserveDrawingBuffer: true,   // 画完要 drawImage 出去
  })
  renderer.setPixelRatio(1)
  renderer.setSize(w, h, false)
  renderer.setClearColor(0x000000, 1)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.NoToneMapping

  const R = sceneRadius(u)
  const camera = new THREE.PerspectiveCamera(FOV, w / h, 0.5, R * 90)
  const dist = R * 1.72
  const yaw = 0.5
  const pitch = -0.2
  camera.position.set(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    -Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist,
  )
  camera.lookAt(0, 0, 0)

  const scene = new THREE.Scene()
  const nebula = makeNebula(renderer, R, nebulaPalette(u), { ...cinematicEnvironment('high'), nebulaBake: BAKE })
  const stars = makeStars(u, false)
  const dust = makeDust(u, false)
  const rings = makeRings(u)
  // 虫洞是分享卡的主角，静帧里必须有
  const overlay = makeOverlay3D(u)
  overlay.setActiveWorm(0)
  overlay.setWormVisible(u.wormholes.length > 0)
  overlay.setEmphasis(0.14)
  scene.add(nebula.group, dust.group, stars.group, overlay.group)
  if (rings) scene.add(rings.object)

  const near = Math.max(1, dist - R * 1.15)
  const far = dist + R * 1.75
  const projScale = (h * 0.5) / Math.tan((FOV * Math.PI) / 360)
  for (const l of [stars, dust, overlay]) {
    l.setUniform('uT', 0)
    l.setUniform('uConverge', 1)
    l.setUniform('uProjScale', projScale)
    l.setUniform('uNear', near)
    l.setUniform('uFar', far)
  }
  stars.setUniform('uLitFloor', 1)
  rings?.setUniform('uConverge', 1)
  rings?.setUniform('uNear', near)
  rings?.setUniform('uFar', far)
  nebula.update(0, camera)

  const composer = new EffectComposer(renderer, {
    frameBufferType: THREE.HalfFloatType,
    depthBuffer: false,
    stencilBuffer: false,
  })
  composer.addPass(new RenderPass(scene, camera))
  composer.addPass(new EffectPass(
    camera,
    new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,
      luminanceThreshold: 0.68,
      luminanceSmoothing: 0.30,
      intensity: 1.02,
      radius: 0.74,
      levels: 8,
    }),
    new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
  ))
  composer.render()

  // 星群名的落点：用同一台相机投影，卡片上的文字才会真的贴在星群上
  const v = new THREE.Vector3()
  const labels: StillLabel[] = []
  for (const c of u.clusters) {
    v.set(c.c[0], c.c[1], c.c[2]).project(camera)
    if (v.z < -1 || v.z > 1) continue
    labels.push({
      name: c.name,
      n: c.n,
      x: (v.x * 0.5 + 0.5) * w,
      y: (-v.y * 0.5 + 0.5) * h,
    })
  }
  labels.sort((a, b) => b.n - a.n)

  // 结果拷进一张普通画布，随后就能安全释放 WebGL 上下文
  const out = document.createElement('canvas')
  out.width = w
  out.height = h
  out.getContext('2d')!.drawImage(canvas, 0, 0)

  composer.dispose()
  nebula.dispose()
  stars.dispose()
  dust.dispose()
  rings?.dispose()
  overlay.dispose()
  renderer.dispose()
  renderer.forceContextLoss()

  return { canvas: out, labels }
}
