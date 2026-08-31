import * as THREE from 'three'
import { probesForStar, type UniverseIndex } from '../../domain/universe'
import type { CurrentStar } from '../../types'
import { ResourceScope, type ResourceCleanup } from '../resourceScope'
import type { StarDatum } from './starData'

export type ProbeLod = 'far' | 'medium' | 'near'
export type ProbePart =
  | 'hull'
  | 'left-wing'
  | 'right-wing'
  | 'beacon'
  | 'antenna'
  | 'thruster'
  | 'left-hinge'
  | 'right-hinge'
  | 'seam'
  | 'scanner-lens'
  | 'light-strip-inner'
  | 'etching'

export interface ProbeFrame {
  elapsedMs: number
  camera: THREE.PerspectiveCamera
  /** CSS-pixel projection scale, not device pixels. */
  projectionScale: number
  focusedStarId: string | null
  convergence: number
  starWorldPositions: ReadonlyMap<string, THREE.Vector3>
  starOpacities: ReadonlyMap<string, number>
}

export interface ProbeLayer {
  group: THREE.Group
  update(ctx: ProbeFrame): void
  inspect(probeId: string | null): void
  setPartHighlight(part: ProbePart | null): void
  setScanning(scanning: boolean): void
  dispose(): void
}

export interface ProbeOrbitDatum {
  readonly starId: string
  readonly probeId: string
  readonly slot: number
  readonly phase: number
  readonly radius: number
  readonly position: readonly [number, number, number]
}

interface OrbitRecord extends ProbeOrbitDatum {
  readonly axis: readonly [number, number, number]
  readonly u: readonly [number, number, number]
  readonly v: readonly [number, number, number]
  readonly speed: number
}

interface PartDefinition {
  part: ProbePart
  geometry: THREE.BufferGeometry
  material: THREE.Material
  local: THREE.Matrix4
}

interface InstancedPart {
  part: ProbePart
  mesh: THREE.InstancedMesh
  local: THREE.Matrix4
}

export interface ProbeLayerSnapshot {
  readonly probeCount: number
  readonly sharedResourceCount: number
  readonly nearModelCount: number
  readonly lods: Readonly<Record<ProbeLod, number>>
  readonly maxSimultaneousLevels: number
  readonly parts: Readonly<Record<ProbeLod, readonly ProbePart[]>>
  readonly inspectedProbeId: string | null
  readonly highlightedPart: ProbePart | null
  readonly scanning: boolean
}

interface MutableSnapshot {
  probeCount: number
  sharedResourceCount: number
  nearModelCount: number
  lods: Record<ProbeLod, number>
  maxSimultaneousLevels: number
  parts: Record<ProbeLod, ProbePart[]>
  inspectedProbeId: string | null
  highlightedPart: ProbePart | null
  scanning: boolean
}

const snapshots = new WeakMap<ProbeLayer, MutableSnapshot>()
const PROBE_RADIUS = 0.34
const INITIAL_SLOT_COUNT = 512
const SLOT_ANGLE_COUNT = 64
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0)
const WHITE = new THREE.Color()

export function nextProbeLod(current: ProbeLod, projectedRadiusPx: number): ProbeLod {
  const px = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (current === 'far') return px >= 28 ? 'medium' : 'far'
  if (current === 'medium') {
    if (px <= 14) return 'far'
    if (px >= 92) return 'near'
    return 'medium'
  }
  return px <= 76 ? 'medium' : 'near'
}

export function probeLodWeights(lod: ProbeLod, projectedRadiusPx: number): Record<ProbeLod, number> {
  const weights = { far: 0, medium: 0, near: 0 }
  writeLodWeights(weights, lod, projectedRadiusPx)
  return weights
}

function writeLodWeights(target: Record<ProbeLod, number>, lod: ProbeLod, projectedRadiusPx: number): void {
  const px = Number.isFinite(projectedRadiusPx) ? Math.max(0, projectedRadiusPx) : 0
  if (lod === 'far') {
    const medium = smoothstep(20, 28, px)
    target.far = 1 - medium; target.medium = medium; target.near = 0
    return
  }
  if (lod === 'medium' && px < 28) {
    const medium = smoothstep(14, 28, px)
    target.far = 1 - medium; target.medium = medium; target.near = 0
    return
  }
  if (lod === 'medium' && px > 76) {
    const near = smoothstep(76, 92, px)
    target.far = 0; target.medium = 1 - near; target.near = near
    return
  }
  if (lod === 'near') {
    const near = smoothstep(76, 92, px)
    target.far = 0; target.medium = 1 - near; target.near = near
    return
  }
  target.far = 0; target.medium = 1; target.near = 0
}

/** Stable, star-local orbit assignments. Questions are deliberately absent from this path. */
export function probeOrbitData(index: UniverseIndex, stars: readonly StarDatum[]): readonly ProbeOrbitDatum[] {
  return buildOrbitRecords(index, stars).map(({ axis: _axis, u: _u, v: _v, speed: _speed, ...datum }) =>
    Object.freeze(datum))
}

export function probeLayerSnapshot(layer: ProbeLayer): ProbeLayerSnapshot {
  const state = snapshots.get(layer)
  if (!state) throw new Error('Unknown or disposed probe layer')
  return Object.freeze({
    ...state,
    lods: Object.freeze({ ...state.lods }),
    parts: Object.freeze({
      far: Object.freeze([...state.parts.far]),
      medium: Object.freeze([...state.parts.medium]),
      near: Object.freeze([...state.parts.near]),
    }),
  })
}

export function makeProbe(index: UniverseIndex, stars: readonly StarDatum[]): ProbeLayer {
  return ResourceScope.construct((scope) => makeProbeScoped(index, stars, scope))
}

function makeProbeScoped(index: UniverseIndex, stars: readonly StarDatum[], scope: ResourceScope): ProbeLayer {
  const records = buildOrbitRecords(index, stars)
  let sharedResourceCount = 0
  const registerResource = <T extends { dispose(): void }>(resource: T): T => {
    sharedResourceCount += 1
    return scope.use(resource)
  }

  const hullGeometry = registerResource(new THREE.CylinderGeometry(0.18, 0.18, 0.52, 6, 1, false).rotateZ(Math.PI / 2))
  const wingGeometry = registerResource(new THREE.BoxGeometry(0.34, 0.025, 0.24))
  const beaconGeometry = registerResource(new THREE.SphereGeometry(0.055, 8, 6))
  const antennaGeometry = registerResource(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6))
  const thrusterGeometry = registerResource(new THREE.ConeGeometry(0.10, 0.18, 8).rotateZ(-Math.PI / 2))
  const hingeGeometry = registerResource(new THREE.CylinderGeometry(0.035, 0.035, 0.17, 8).rotateX(Math.PI / 2))
  const seamGeometry = registerResource(new THREE.TorusGeometry(0.181, 0.008, 4, 16).rotateY(Math.PI / 2))
  const scannerGeometry = registerResource(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12).rotateX(Math.PI / 2))
  const stripGeometry = registerResource(new THREE.BoxGeometry(0.28, 0.012, 0.018))
  const etchingGeometry = registerResource(new THREE.PlaneGeometry(0.22, 0.08))

  const hullMaterial = registerResource(fadingStandard({ color: 0x536173, metalness: 0.72, roughness: 0.36 }))
  const panelMaterial = registerResource(fadingStandard({ color: 0x253959, metalness: 0.56, roughness: 0.28 }))
  const amberMaterial = registerResource(fadingStandard({ color: 0xffa43a, emissive: 0xff7818, emissiveIntensity: 1.8, roughness: 0.28 }))
  const metalMaterial = registerResource(fadingStandard({ color: 0x929eab, metalness: 0.84, roughness: 0.24 }))
  const lensMaterial = registerResource(new THREE.MeshPhysicalMaterial({
    color: 0x73bde8, emissive: 0x12334c, emissiveIntensity: 0.8,
    metalness: 0.25, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
    transparent: true,
  }))
  const lightMaterial = registerResource(fadingStandard({ color: 0xffb14c, emissive: 0xff7b19, emissiveIntensity: 2.1, roughness: 0.22 }))
  const etchingMaterial = registerResource(fadingStandard({ color: 0xc5d1dc, emissive: 0x152331, emissiveIntensity: 0.25, metalness: 0.66, roughness: 0.3, side: THREE.DoubleSide }))

  const far: PartDefinition[] = [
    part('hull', hullGeometry, hullMaterial),
    part('left-wing', wingGeometry, panelMaterial, [0, 0, -0.31]),
    part('right-wing', wingGeometry, panelMaterial, [0, 0, 0.31]),
    part('beacon', beaconGeometry, amberMaterial, [0, 0.22, 0]),
  ]
  const additions: PartDefinition[] = [
    part('antenna', antennaGeometry, metalMaterial, [0.05, 0.25, 0]),
    part('thruster', thrusterGeometry, metalMaterial, [-0.34, 0, 0]),
    part('left-hinge', hingeGeometry, metalMaterial, [0, 0, -0.20]),
    part('right-hinge', hingeGeometry, metalMaterial, [0, 0, 0.20]),
  ]
  const nearOnly: PartDefinition[] = [
    part('seam', seamGeometry, metalMaterial, [0.05, 0, 0]),
    part('scanner-lens', scannerGeometry, lensMaterial, [0.12, 0, 0.20]),
    part('light-strip-inner', stripGeometry, lightMaterial, [0.03, -0.17, 0]),
    part('etching', etchingGeometry, etchingMaterial, [0.08, 0.01, -0.185], [Math.PI / 2, 0, 0]),
  ]
  const medium = [...far, ...additions]
  const near = [...medium, ...nearOnly]
  const capacity = Math.max(1, records.length)
  const farGroup = new THREE.Group()
  farGroup.name = 'probe-far'
  const mediumGroup = new THREE.Group()
  mediumGroup.name = 'probe-medium'
  const nearGroup = new THREE.Group()
  nearGroup.name = 'probe-near-singleton'
  const farMeshes = instantiate(far, capacity, farGroup, registerResource)
  const mediumMeshes = instantiate(medium, capacity, mediumGroup, registerResource)
  const nearMeshes = near.map((definition) => {
    const mesh = new THREE.Mesh(definition.geometry, definition.material)
    mesh.name = `probe-near:${definition.part}`
    mesh.userData.probePart = definition.part
    mesh.matrixAutoUpdate = false
    nearGroup.add(mesh)
    return { ...definition, mesh }
  })
  nearGroup.visible = false

  const group = new THREE.Group()
  group.name = 'article-probes'
  const fillLight = new THREE.HemisphereLight(0xb9d4ff, 0x101522, 1.25)
  const keyLight = new THREE.DirectionalLight(0xffd7a0, 2.1)
  keyLight.position.set(2, 3, 4)
  group.add(fillLight, keyLight, farGroup, mediumGroup, nearGroup)
  const lodByKey = new Map(records.map((record) => [recordKey(record), 'far' as ProbeLod]))
  const baseMatrices = records.map(() => new THREE.Matrix4())
  const weights = records.map(() => ({ far: 1, medium: 0, near: 0 }))
  const farAlphas = records.map(() => 0)
  const mediumAlphas = records.map(() => 0)
  const snapshot: MutableSnapshot = {
    probeCount: records.length,
    sharedResourceCount,
    nearModelCount: 1,
    lods: { far: records.length, medium: 0, near: 0 },
    maxSimultaneousLevels: 1,
    parts: {
      far: far.map(({ part: name }) => name),
      medium: medium.map(({ part: name }) => name),
      near: near.map(({ part: name }) => name),
    },
    inspectedProbeId: null,
    highlightedPart: null,
    scanning: false,
  }
  let disposed = false
  let disposeResources: ResourceCleanup = () => undefined
  let layer: ProbeLayer

  const update = (ctx: ProbeFrame) => {
    if (disposed) return
    ctx.camera.updateMatrixWorld(true)
    const quaternion = new THREE.Quaternion()
    const tangent = new THREE.Vector3()
    const world = new THREE.Vector3()
    const view = new THREE.Vector3()
    const scale = new THREE.Vector3(1, 1, 1)
    let nearCandidate = -1
    let nearCandidatePx = -1

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      const starWorld = ctx.starWorldPositions.get(record.starId)
      const ownerOpacity = clamp01(ctx.starOpacities.get(record.starId) ?? 0) * clamp01(ctx.convergence)
      if (!starWorld || ownerOpacity <= 0) {
        baseMatrices[index].copy(HIDDEN)
        weights[index].far = 0
        weights[index].medium = 0
        weights[index].near = 0
        lodByKey.set(recordKey(record), 'far')
        continue
      }
      const angle = record.phase + ctx.elapsedMs * 0.001 * record.speed
      const cosine = Math.cos(angle)
      const sine = Math.sin(angle)
      world.set(
        starWorld.x + (record.u[0] * cosine + record.v[0] * sine) * record.radius,
        starWorld.y + (record.u[1] * cosine + record.v[1] * sine) * record.radius,
        starWorld.z + (record.u[2] * cosine + record.v[2] * sine) * record.radius,
      )
      tangent.set(
        -record.u[0] * sine + record.v[0] * cosine,
        -record.u[1] * sine + record.v[1] * cosine,
        -record.u[2] * sine + record.v[2] * cosine,
      ).normalize()
      quaternion.setFromUnitVectors(UNIT_X, tangent)
      baseMatrices[index].compose(world, quaternion, scale)
      view.copy(world).applyMatrix4(ctx.camera.matrixWorldInverse)
      const px = view.z < -0.01 ? PROBE_RADIUS * ctx.projectionScale / -view.z : 0
      const focused = record.starId === ctx.focusedStarId
      const previous = lodByKey.get(recordKey(record)) ?? 'far'
      const next = focused ? nextProbeLod(previous, px) : 'far'
      lodByKey.set(recordKey(record), next)
      if (focused) {
        setLodWeights(weights[index], next, px, ownerOpacity)
      } else {
        weights[index].far = ownerOpacity
        weights[index].medium = 0
        weights[index].near = 0
      }
      if (weights[index].near > 0) {
        const inspected = record.probeId === snapshot.inspectedProbeId
        if (nearCandidate < 0 || inspected || (records[nearCandidate].probeId !== snapshot.inspectedProbeId && px > nearCandidatePx)) {
          nearCandidate = index
          nearCandidatePx = px
        }
      }
    }

    snapshot.lods = { far: 0, medium: 0, near: 0 }
    snapshot.maxSimultaneousLevels = 0
    for (let index = 0; index < records.length; index += 1) {
      let lod = lodByKey.get(recordKey(records[index])) ?? 'far'
      if (weights[index].near > 0 && index !== nearCandidate) {
        if (lod === 'near') {
          lod = 'medium'
          lodByKey.set(recordKey(records[index]), lod)
        }
        weights[index].far = 0
        weights[index].medium = clamp01(ctx.starOpacities.get(records[index].starId) ?? 0) * clamp01(ctx.convergence)
        weights[index].near = 0
      }
      snapshot.lods[lod] += 1
      snapshot.maxSimultaneousLevels = Math.max(snapshot.maxSimultaneousLevels,
        Number(weights[index].far > 0) + Number(weights[index].medium > 0) + Number(weights[index].near > 0))
      farAlphas[index] = weights[index].far
      mediumAlphas[index] = weights[index].medium
    }
    updateInstances(farMeshes, baseMatrices, farAlphas)
    updateInstances(mediumMeshes, baseMatrices, mediumAlphas)
    updateNear(nearMeshes, nearGroup, nearCandidate, baseMatrices, weights, snapshot, ctx.elapsedMs)
  }

  layer = {
    group,
    update,
    inspect(probeId) {
      if (disposed) return
      snapshot.inspectedProbeId = probeId
    },
    setPartHighlight(partName) {
      if (disposed) return
      snapshot.highlightedPart = partName
    },
    setScanning(scanning) {
      if (disposed) return
      snapshot.scanning = scanning
    },
    dispose() {
      if (disposed) return
      disposed = true
      group.clear()
      snapshots.delete(layer)
      disposeResources()
    },
  }
  snapshots.set(layer, snapshot)
  disposeResources = scope.release()
  return layer
}

const UNIT_X = new THREE.Vector3(1, 0, 0)

function buildOrbitRecords(index: UniverseIndex, stars: readonly StarDatum[]): OrbitRecord[] {
  const records: OrbitRecord[] = []
  for (const datum of stars) {
    if (!isCurrentStar(datum.s)) continue
    const probes = probesForStar(index, datum.s)
    if (probes.length === 0) continue
    const axis = stableAxis(datum.s.id)
    const [u, v] = stableBasis(axis)
    const occupied = new Set<number>()
    for (const probe of probes) {
      const pairHash = hashText(`${datum.s.id}\u0000${probe.id}`)
      let slot = pairHash % INITIAL_SLOT_COUNT
      while (occupied.has(slot)) slot += 1
      occupied.add(slot)
      const phase = ((slot % SLOT_ANGLE_COUNT) / SLOT_ANGLE_COUNT) * Math.PI * 2
      const radius = 2.5 + Math.floor(slot / SLOT_ANGLE_COUNT) * 0.46
      const position = [
        u[0] * Math.cos(phase) * radius + v[0] * Math.sin(phase) * radius,
        u[1] * Math.cos(phase) * radius + v[1] * Math.sin(phase) * radius,
        u[2] * Math.cos(phase) * radius + v[2] * Math.sin(phase) * radius,
      ] as const
      records.push(Object.freeze({
        starId: datum.s.id,
        probeId: probe.id,
        slot,
        phase,
        radius,
        position,
        axis,
        u,
        v,
        speed: 0.16 + (pairHash % 37) * 0.0015,
      }))
    }
  }
  return records
}

function isCurrentStar(star: StarDatum['s']): star is CurrentStar {
  return 'id' in star && typeof star.id === 'string' && 'probeIds' in star
}

function instantiate(
  definitions: readonly PartDefinition[],
  capacity: number,
  group: THREE.Group,
  registerResource: <T extends { dispose(): void }>(resource: T) => T,
): InstancedPart[] {
  return definitions.map((definition) => {
    const mesh = registerResource(new THREE.InstancedMesh(definition.geometry, definition.material, capacity))
    mesh.name = `${group.name}:${definition.part}`
    mesh.userData.probePart = definition.part
    mesh.frustumCulled = false
    mesh.count = capacity
    group.add(mesh)
    return { part: definition.part, mesh, local: definition.local }
  })
}

function updateInstances(parts: readonly InstancedPart[], bases: readonly THREE.Matrix4[], alphas: readonly number[]) {
  const matrix = new THREE.Matrix4()
  for (const { mesh, local } of parts) {
    mesh.count = bases.length
    for (let index = 0; index < bases.length; index += 1) {
      const alpha = clamp01(alphas[index] ?? 0)
      if (alpha <= 0.001) {
        mesh.setMatrixAt(index, HIDDEN)
      } else {
        matrix.multiplyMatrices(bases[index], local)
        mesh.setMatrixAt(index, matrix)
      }
      WHITE.setScalar(alpha)
      mesh.setColorAt(index, WHITE)
    }
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
  }
}

function updateNear(
  parts: readonly (PartDefinition & { mesh: THREE.Mesh })[],
  group: THREE.Group,
  candidate: number,
  bases: readonly THREE.Matrix4[],
  weights: readonly Record<ProbeLod, number>[],
  snapshot: MutableSnapshot,
  elapsedMs: number,
) {
  const alpha = candidate < 0 ? 0 : weights[candidate].near
  group.visible = candidate >= 0 && alpha > 0.001
  if (!group.visible) return
  const highlightScale = new THREE.Matrix4()
  const scanRotation = new THREE.Matrix4()
  const fadeScale = new THREE.Matrix4().makeScale(alpha, alpha, alpha)
  for (const definition of parts) {
    definition.mesh.visible = true
    definition.mesh.matrix.multiplyMatrices(bases[candidate], definition.local)
    definition.mesh.matrix.multiply(fadeScale)
    if (definition.part === snapshot.highlightedPart) {
      highlightScale.makeScale(1.12, 1.12, 1.12)
      definition.mesh.matrix.multiply(highlightScale)
    }
    if (definition.part === 'scanner-lens' && snapshot.scanning) {
      scanRotation.makeRotationX(elapsedMs * 0.003)
      definition.mesh.matrix.multiply(scanRotation)
    }
    definition.mesh.matrixWorldNeedsUpdate = true
  }
}

function part(
  name: ProbePart,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  position: readonly [number, number, number] = [0, 0, 0],
  rotation: readonly [number, number, number] = [0, 0, 0],
): PartDefinition {
  const local = new THREE.Matrix4().compose(
    new THREE.Vector3(...position),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotation)),
    new THREE.Vector3(1, 1, 1),
  )
  return { part: name, geometry, material, local }
}

function fadingStandard(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ ...parameters, transparent: true, depthWrite: false })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vProbeAlpha;\nvoid main() {')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vProbeAlpha = instanceColor.r;\n#else\n  vProbeAlpha = 1.0;\n#endif')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vProbeAlpha;\nvoid main() {')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.a *= vProbeAlpha;')
  }
  material.customProgramCacheKey = () => 'mindverse-probe-instance-fade-v1'
  return material
}

function recordKey(record: Pick<ProbeOrbitDatum, 'starId' | 'probeId'>): string {
  return `${record.starId}\u0000${record.probeId}`
}

function setLodWeights(
  target: Record<ProbeLod, number>,
  lod: ProbeLod,
  projectedRadiusPx: number,
  opacity: number,
): void {
  writeLodWeights(target, lod, projectedRadiusPx)
  target.far *= opacity
  target.medium *= opacity
  target.near *= opacity
}

function stableAxis(starId: string): readonly [number, number, number] {
  const first = hashText(starId)
  const second = hashText(`${starId}:plane`)
  const raw: [number, number, number] = [
    ((first & 0xffff) / 0xffff - 0.5) * 1.4,
    0.72 + (((first >>> 16) & 0xffff) / 0xffff) * 0.56,
    ((second & 0xffff) / 0xffff - 0.5) * 1.4,
  ]
  const length = Math.hypot(...raw) || 1
  return [raw[0] / length, raw[1] / length, raw[2] / length]
}

function stableBasis(axis: readonly [number, number, number]):
  [readonly [number, number, number], readonly [number, number, number]] {
  const helper: [number, number, number] = Math.abs(axis[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: [number, number, number] = [
    axis[1] * helper[2] - axis[2] * helper[1],
    axis[2] * helper[0] - axis[0] * helper[2],
    axis[0] * helper[1] - axis[1] * helper[0],
  ]
  const length = Math.hypot(...u) || 1
  u[0] /= length; u[1] /= length; u[2] /= length
  const v: [number, number, number] = [
    axis[1] * u[2] - axis[2] * u[1],
    axis[2] * u[0] - axis[0] * u[2],
    axis[0] * u[1] - axis[1] * u[0],
  ]
  return [u, v]
}

function hashText(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function smoothstep(from: number, to: number, value: number): number {
  const x = clamp01((value - from) / Math.max(1e-9, to - from))
  return x * x * (3 - 2 * x)
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0))
}
