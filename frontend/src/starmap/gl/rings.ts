import * as THREE from 'three'
import type { Mode, Universe } from '../../types'
import { clusterAxis, orbitRing } from '../projection'
import { starColor } from './blackbody'
import { DEPTH_FADE } from './chunks'
import { ResourceScope } from '../resourceScope'
import { ownerOpacity } from '../focusEmphasis'

// 轨道环。
//
// 「这是个星系」最强的一个视觉信号，而且是免费的诚实：环画在恒星真实的
// 公转半径上，透视由 3D 投影自己给出。全部星群的全部环合成一个
// LineSegments，一次 draw call。

const SAMPLES = 96

const VERT = /* glsl */ `
${DEPTH_FADE}
attribute vec3 aColor;
attribute float aDim;
uniform float uConverge;
uniform float uNear;
uniform float uFar;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float viewZ = max(1.0, -mv.z);
  gl_Position = projectionMatrix * mv;
  vColor = aColor;
  // 收敛完成前不画：创世阶段星星还在飞，轨道环没有意义
  vAlpha = aDim * depthFade(viewZ, uNear, uFar) * smoothstep(0.9, 1.0, uConverge);
}
`

const FRAG = /* glsl */ `
uniform float uGain;
varying vec3 vColor;
varying float vAlpha;
void main() {
  if (vAlpha <= 0.002) discard;
  gl_FragColor = vec4(vColor * vAlpha * uGain, 1.0);
}
`

/** 环的基础增益。缩放淡出是乘在它上面的，见 clusterRingVisibility。 */
export const RING_GAIN = 0.24

export interface RingLayer {
  object: THREE.LineSegments
  setUniform(name: string, value: number): void
  setMode(mode: Mode, u: Universe, wormIdx: number): void
  setFocus(clusterId: number | null): void
  dispose(): void
}

export function makeRings(u: Universe): RingLayer | null {
  return ResourceScope.construct((scope) => makeRingsScoped(u, scope))
}

function makeRingsScoped(u: Universe, scope: ResourceScope): RingLayer | null {
  const segsPos: number[] = []
  const segsCol: number[] = []
  const segsGroup: number[] = []

  for (const c of u.clusters) {
    const axis = clusterAxis(c.g)
    const col = starColor(c.hue, c.sat)
    const radii = new Set<number>()
    for (const name of c.mem) {
      const s = u.stars.find((x) => x.c === name)
      if (!s) continue
      const r = Math.hypot(s.p[0] - c.c[0], s.p[1] - c.c[1], s.p[2] - c.c[2])
      if (r > 1.5) radii.add(Math.round(r))
    }
    for (const r of radii) {
      const ring = orbitRing(c.c, axis, r, SAMPLES)
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]
        const b = ring[(i + 1) % ring.length]
        segsPos.push(a[0], a[1], a[2], b[0], b[1], b[2])
        segsCol.push(col[0], col[1], col[2], col[0], col[1], col[2])
        segsGroup.push(c.g, c.g)
      }
    }
  }
  if (segsPos.length === 0) return null

  const n = segsGroup.length
  const geo = new THREE.BufferGeometry()
  scope.use(geo)
  geo.setAttribute('position', new THREE.Float32BufferAttribute(segsPos, 3))
  geo.setAttribute('aColor', new THREE.Float32BufferAttribute(segsCol, 3))
  const dim = new Float32Array(n).fill(1)
  geo.setAttribute('aDim', new THREE.BufferAttribute(dim, 1))
  geo.computeBoundingSphere()

  const mat = scope.use(new THREE.ShaderMaterial({
    uniforms: {
      uConverge: { value: 0 },
      uNear: { value: 1 },
      uFar: { value: 4000 },
      uGain: { value: RING_GAIN },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  }))

  const object = new THREE.LineSegments(geo, mat)
  object.renderOrder = 4
  object.frustumCulled = false

  const groups = segsGroup
  const modeDim = new Float32Array(n).fill(1)
  let focusedCluster: number | null = null
  const dimAttr = geo.getAttribute('aDim') as THREE.BufferAttribute
  const dispose = scope.release()
  const applyDims = () => {
    for (let i = 0; i < n; i++) dim[i] = modeDim[i] * ownerOpacity(groups[i], focusedCluster)
    dimAttr.needsUpdate = true
  }

  return {
    object,
    setUniform(name, value) { if (mat.uniforms[name]) mat.uniforms[name].value = value },
    setFocus(clusterId) {
      focusedCluster = clusterId
      applyDims()
    },
    setMode(mode, uni, wormIdx) {
      const w = uni.wormholes[wormIdx]
      for (let i = 0; i < n; i++) {
        modeDim[i] = mode === 'all' ? 1
          : mode === 'worm' && w ? (groups[i] === w.a || groups[i] === w.b ? 1 : 0)
          : 0.14
      }
      applyDims()
    },
    dispose,
  }
}
