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

export interface ProbeOrbitAllocationDiagnostics {
  allocationWork: number
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
  readonly key: string
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
  readonly nearOpacity: number
  readonly nearCandidateId: string | null
  readonly frame: Readonly<ProbeFrameMetrics>
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
  nearOpacity: number
  nearCandidateId: string | null
  frame: ProbeFrameMetrics
  parts: Record<ProbeLod, ProbePart[]>
  inspectedProbeId: string | null
  highlightedPart: ProbePart | null
  scanning: boolean
}

interface ProbeFrameMetrics {
  farInstances: number
  mediumInstances: number
  matrixWrites: number
  colorWrites: number
  dirtyBuffers: number
}

interface InstanceLevelState {
  readonly indices: Int32Array
  readonly previousIndices: Int32Array
  readonly alphas: Float32Array
  readonly previousAlphas: Float32Array
  readonly upperIntervals: Uint8Array
  readonly previousUpperIntervals: Uint8Array
  readonly matrixChanged: Uint8Array
  readonly colorChanged: Uint8Array
  count: number
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
export function probeOrbitData(
  index: UniverseIndex,
  stars: readonly StarDatum[],
  diagnostics?: ProbeOrbitAllocationDiagnostics,
): readonly ProbeOrbitDatum[] {
  if (diagnostics) diagnostics.allocationWork = 0
  return buildOrbitRecords(index, stars, diagnostics).map(({ key: _key, axis: _axis, u: _u, v: _v, speed: _speed, ...datum }) =>
    Object.freeze(datum))
}

export function writeProbeFrame(
  target: ProbeFrame,
  elapsedMs: number,
  projectionScale: number,
  focusedStarId: string | null,
  convergence: number,
): ProbeFrame {
  target.elapsedMs = elapsedMs
  target.projectionScale = projectionScale
  target.focusedStarId = focusedStarId
  target.convergence = convergence
  return target
}

export function probeLayerSnapshot(layer: ProbeLayer): ProbeLayerSnapshot {
  const state = snapshots.get(layer)
  if (!state) throw new Error('Unknown or disposed probe layer')
  return Object.freeze({
    ...state,
    frame: Object.freeze({ ...state.frame }),
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

  const hullParameters = { color: 0x536173, metalness: 0.72, roughness: 0.36 }
  const panelParameters = { color: 0x253959, metalness: 0.56, roughness: 0.28 }
  const amberParameters = { color: 0xffa43a, emissive: 0xff7818, emissiveIntensity: 1.8, roughness: 0.28 }
  const metalParameters = { color: 0x929eab, metalness: 0.84, roughness: 0.24 }
  const lightParameters = { color: 0xffb14c, emissive: 0xff7b19, emissiveIntensity: 2.1, roughness: 0.22 }
  const etchingParameters = { color: 0xc5d1dc, emissive: 0x152331, emissiveIntensity: 0.25, metalness: 0.66, roughness: 0.3, side: THREE.DoubleSide }

  const hullMaterial = registerResource(fadingStandard(hullParameters))
  const panelMaterial = registerResource(fadingStandard(panelParameters))
  const amberMaterial = registerResource(fadingStandard(amberParameters))
  const metalMaterial = registerResource(fadingStandard(metalParameters))
  const nearHullMaterial = registerResource(nearStandard(hullParameters))
  const nearPanelMaterial = registerResource(nearStandard(panelParameters))
  const nearAmberMaterial = registerResource(nearStandard(amberParameters))
  const nearMetalMaterial = registerResource(nearStandard(metalParameters))
  const nearLensMaterial = registerResource(new THREE.MeshPhysicalMaterial({
    color: 0x73bde8, emissive: 0x12334c, emissiveIntensity: 0.8,
    metalness: 0.25, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.08,
    alphaHash: true, transparent: false, depthWrite: true, opacity: 0,
  }))
  applyUpperAlphaHashInterval(nearLensMaterial)
  const nearLightMaterial = registerResource(nearStandard(lightParameters))
  const nearEtchingMaterial = registerResource(nearStandard(etchingParameters))
  const nearMaterials: THREE.Material[] = [
    nearHullMaterial, nearPanelMaterial, nearAmberMaterial, nearMetalMaterial,
    nearLensMaterial, nearLightMaterial, nearEtchingMaterial,
  ]

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
    part('seam', seamGeometry, nearMetalMaterial, [0.05, 0, 0]),
    part('scanner-lens', scannerGeometry, nearLensMaterial, [0.12, 0, 0.20]),
    part('light-strip-inner', stripGeometry, nearLightMaterial, [0.03, -0.17, 0]),
    part('etching', etchingGeometry, nearEtchingMaterial, [0.08, 0.01, -0.185], [Math.PI / 2, 0, 0]),
  ]
  const medium = [...far, ...additions]
  const nearMaterialByMedium = new Map<THREE.Material, THREE.Material>([
    [hullMaterial, nearHullMaterial],
    [panelMaterial, nearPanelMaterial],
    [amberMaterial, nearAmberMaterial],
    [metalMaterial, nearMetalMaterial],
  ])
  const near = [
    ...medium.map((definition) => ({
      ...definition,
      material: nearMaterialByMedium.get(definition.material) ?? nearMetalMaterial,
    })),
    ...nearOnly,
  ]
  const capacity = Math.max(1, records.length)
  const farGroup = new THREE.Group()
  farGroup.name = 'probe-far'
  const mediumGroup = new THREE.Group()
  mediumGroup.name = 'probe-medium'
  const nearGroup = new THREE.Group()
  nearGroup.name = 'probe-near-singleton'
  const farMeshes = instantiate(far, capacity, farGroup, 10, registerResource)
  const mediumMeshes = instantiate(medium, capacity, mediumGroup, 20, registerResource)
  const nearMeshes = near.map((definition) => {
    const mesh = new THREE.Mesh(definition.geometry, definition.material)
    mesh.name = `probe-near:${definition.part}`
    mesh.userData.probePart = definition.part
    mesh.matrixAutoUpdate = false
    mesh.renderOrder = 30
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
  const lodByKey = new Map(records.map((record) => [record.key, 'far' as ProbeLod]))
  const baseMatrices = records.map(() => new THREE.Matrix4())
  const baseChanged = new Uint8Array(records.length)
  const weights = records.map(() => ({ far: 1, medium: 0, near: 0 }))
  const farState = instanceLevelState(records.length)
  const mediumState = instanceLevelState(records.length)
  const quaternion = new THREE.Quaternion()
  const tangent = new THREE.Vector3()
  const world = new THREE.Vector3()
  const view = new THREE.Vector3()
  const unitScale = new THREE.Vector3(1, 1, 1)
  const baseScratch = new THREE.Matrix4()
  const instanceScratch = new THREE.Matrix4()
  const highlightScratch = new THREE.Matrix4()
  const scanScratch = new THREE.Matrix4()
  const snapshot: MutableSnapshot = {
    probeCount: records.length,
    sharedResourceCount,
    nearModelCount: 1,
    lods: { far: records.length, medium: 0, near: 0 },
    maxSimultaneousLevels: 1,
    nearOpacity: 0,
    nearCandidateId: null,
    frame: {
      farInstances: 0, mediumInstances: 0, matrixWrites: 0,
      colorWrites: 0, dirtyBuffers: 0,
    },
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
  let nearCandidate = -1
  let disposeResources: ResourceCleanup = () => undefined
  let layer: ProbeLayer

  const update = (ctx: ProbeFrame) => {
    if (disposed) return
    ctx.camera.updateMatrixWorld(true)
    resetFrameMetrics(snapshot.frame)
    farState.count = 0
    mediumState.count = 0
    let bestCandidate = -1
    let bestCandidatePx = -1
    let retainedCandidateEligible = false
    let inspectedCandidate = -1

    for (let index = 0; index < records.length; index += 1) {
      const record = records[index]
      const starWorld = ctx.starWorldPositions.get(record.starId)
      const ownerOpacity = clamp01(ctx.starOpacities.get(record.starId) ?? 0) * clamp01(ctx.convergence)
      if (!starWorld || ownerOpacity <= 0) {
        baseChanged[index] = Number(!baseMatrices[index].equals(HIDDEN))
        baseMatrices[index].copy(HIDDEN)
        weights[index].far = 0
        weights[index].medium = 0
        weights[index].near = 0
        lodByKey.set(record.key, 'far')
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
      baseScratch.compose(world, quaternion, unitScale)
      baseChanged[index] = Number(!baseMatrices[index].equals(baseScratch))
      baseMatrices[index].copy(baseScratch)
      view.copy(world).applyMatrix4(ctx.camera.matrixWorldInverse)
      const px = view.z < -0.01 ? PROBE_RADIUS * ctx.projectionScale / -view.z : 0
      const focused = record.starId === ctx.focusedStarId
      const previous = lodByKey.get(record.key) ?? 'far'
      const next = focused ? nextProbeLod(previous, px) : 'far'
      lodByKey.set(record.key, next)
      if (focused) {
        setLodWeights(weights[index], next, px, ownerOpacity)
      } else {
        weights[index].far = ownerOpacity
        weights[index].medium = 0
        weights[index].near = 0
      }
      if (weights[index].near > 0) {
        if (index === nearCandidate) retainedCandidateEligible = true
        if (record.probeId === snapshot.inspectedProbeId) inspectedCandidate = index
        if (bestCandidate < 0 || px > bestCandidatePx) {
          bestCandidate = index
          bestCandidatePx = px
        }
      }
    }

    nearCandidate = inspectedCandidate >= 0
      ? inspectedCandidate
      : retainedCandidateEligible ? nearCandidate : bestCandidate
    snapshot.nearCandidateId = nearCandidate < 0 ? null : records[nearCandidate].probeId

    snapshot.lods.far = 0
    snapshot.lods.medium = 0
    snapshot.lods.near = 0
    snapshot.maxSimultaneousLevels = 0
    for (let index = 0; index < records.length; index += 1) {
      let lod = lodByKey.get(records[index].key) ?? 'far'
      if (weights[index].near > 0 && index !== nearCandidate) {
        if (lod === 'near') {
          lod = 'medium'
          lodByKey.set(records[index].key, lod)
        }
        weights[index].far = 0
        weights[index].medium = clamp01(ctx.starOpacities.get(records[index].starId) ?? 0) * clamp01(ctx.convergence)
        weights[index].near = 0
      }
      snapshot.lods[lod] += 1
      snapshot.maxSimultaneousLevels = Math.max(snapshot.maxSimultaneousLevels,
        Number(weights[index].far > 0) + Number(weights[index].medium > 0) + Number(weights[index].near > 0))
      if (weights[index].far > 0.001) appendInstance(farState, index, weights[index].far, false)
      if (weights[index].medium > 0.001) {
        appendInstance(mediumState, index, weights[index].medium, weights[index].far > 0.001)
      }
    }
    snapshot.frame.farInstances = farState.count
    snapshot.frame.mediumInstances = mediumState.count
    updateInstances(farMeshes, baseMatrices, baseChanged, farState, instanceScratch, snapshot.frame)
    updateInstances(mediumMeshes, baseMatrices, baseChanged, mediumState, instanceScratch, snapshot.frame)
    updateNear(
      nearMeshes, nearMaterials, nearGroup, nearCandidate, baseMatrices, weights, snapshot, ctx.elapsedMs,
      highlightScratch, scanScratch,
    )
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

function buildOrbitRecords(
  index: UniverseIndex,
  stars: readonly StarDatum[],
  diagnostics?: ProbeOrbitAllocationDiagnostics,
): OrbitRecord[] {
  const records: OrbitRecord[] = []
  for (const datum of stars) {
    if (!isCurrentStar(datum.s)) continue
    const probes = probesForStar(index, datum.s)
    if (probes.length === 0) continue
    const axis = stableAxis(datum.s.id)
    const [u, v] = stableBasis(axis)
    const nextOccupied = new Map<number, number>()
    for (const probe of probes) {
      const pairHash = hashText(`${datum.s.id}\u0000${probe.id}`)
      const preferredSlot = pairHash % INITIAL_SLOT_COUNT
      const slot = nextAvailableSlot(nextOccupied, preferredSlot, diagnostics)
      nextOccupied.set(slot, nextAvailableSlot(nextOccupied, slot + 1, diagnostics))
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
        key: `${datum.s.id}\u0000${probe.id}`,
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

function nextAvailableSlot(
  occupied: Map<number, number>,
  initial: number,
  diagnostics?: ProbeOrbitAllocationDiagnostics,
): number {
  let slot = initial
  const path: number[] = []
  while (true) {
    if (diagnostics) diagnostics.allocationWork += 1
    if (!occupied.has(slot)) break
    path.push(slot)
    slot = occupied.get(slot) ?? slot + 1
  }
  for (const visited of path) occupied.set(visited, slot)
  return slot
}

function isCurrentStar(star: StarDatum['s']): star is CurrentStar {
  return 'id' in star && typeof star.id === 'string' && 'probeIds' in star
}

function instantiate(
  definitions: readonly PartDefinition[],
  capacity: number,
  group: THREE.Group,
  renderOrder: number,
  registerResource: <T extends { dispose(): void }>(resource: T) => T,
): InstancedPart[] {
  return definitions.map((definition) => {
    const mesh = registerResource(new THREE.InstancedMesh(definition.geometry, definition.material, capacity))
    mesh.name = `${group.name}:${definition.part}`
    mesh.userData.probePart = definition.part
    mesh.frustumCulled = false
    mesh.renderOrder = renderOrder
    mesh.count = capacity
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3), 3)
    group.add(mesh)
    return { part: definition.part, mesh, local: definition.local }
  })
}

function instanceLevelState(capacity: number): InstanceLevelState {
  const previousIndices = new Int32Array(capacity)
  previousIndices.fill(-1)
  const previousAlphas = new Float32Array(capacity)
  previousAlphas.fill(Number.NaN)
  return {
    indices: new Int32Array(capacity),
    previousIndices,
    alphas: new Float32Array(capacity),
    previousAlphas,
    upperIntervals: new Uint8Array(capacity),
    previousUpperIntervals: new Uint8Array(capacity),
    matrixChanged: new Uint8Array(capacity),
    colorChanged: new Uint8Array(capacity),
    count: 0,
  }
}

function appendInstance(
  state: InstanceLevelState,
  recordIndex: number,
  alpha: number,
  upperInterval: boolean,
): void {
  state.indices[state.count] = recordIndex
  state.alphas[state.count] = alpha
  state.upperIntervals[state.count] = Number(upperInterval)
  state.count += 1
}

function resetFrameMetrics(metrics: ProbeFrameMetrics): void {
  metrics.farInstances = 0
  metrics.mediumInstances = 0
  metrics.matrixWrites = 0
  metrics.colorWrites = 0
  metrics.dirtyBuffers = 0
}

function updateInstances(
  parts: readonly InstancedPart[],
  bases: readonly THREE.Matrix4[],
  baseChanged: Uint8Array,
  state: InstanceLevelState,
  matrix: THREE.Matrix4,
  metrics: ProbeFrameMetrics,
): void {
  for (let slot = 0; slot < state.count; slot += 1) {
    const recordIndex = state.indices[slot]
    state.matrixChanged[slot] = Number(state.previousIndices[slot] !== recordIndex || baseChanged[recordIndex] === 1)
    state.colorChanged[slot] = Number(
      state.previousIndices[slot] !== recordIndex
      || state.previousAlphas[slot] !== state.alphas[slot]
      || state.previousUpperIntervals[slot] !== state.upperIntervals[slot],
    )
  }
  for (const { mesh, local } of parts) {
    mesh.count = state.count
    let matrixDirty = false
    let colorDirty = false
    for (let slot = 0; slot < state.count; slot += 1) {
      if (state.matrixChanged[slot] === 1) {
        matrix.multiplyMatrices(bases[state.indices[slot]], local)
        mesh.setMatrixAt(slot, matrix)
        metrics.matrixWrites += 1
        matrixDirty = true
      }
      if (state.colorChanged[slot] === 1) {
        WHITE.setRGB(state.alphas[slot], state.upperIntervals[slot], 1)
        mesh.setColorAt(slot, WHITE)
        metrics.colorWrites += 1
        colorDirty = true
      }
    }
    if (matrixDirty) {
      mesh.instanceMatrix.needsUpdate = true
      metrics.dirtyBuffers += 1
    }
    if (colorDirty && mesh.instanceColor) {
      mesh.instanceColor.needsUpdate = true
      metrics.dirtyBuffers += 1
    }
  }
  for (let slot = 0; slot < state.count; slot += 1) {
    state.previousIndices[slot] = state.indices[slot]
    state.previousAlphas[slot] = state.alphas[slot]
    state.previousUpperIntervals[slot] = state.upperIntervals[slot]
  }
}

function updateNear(
  parts: readonly (PartDefinition & { mesh: THREE.Mesh })[],
  materials: readonly THREE.Material[],
  group: THREE.Group,
  candidate: number,
  bases: readonly THREE.Matrix4[],
  weights: readonly Record<ProbeLod, number>[],
  snapshot: MutableSnapshot,
  elapsedMs: number,
  highlightScale: THREE.Matrix4,
  scanRotation: THREE.Matrix4,
): void {
  const alpha = candidate < 0 ? 0 : weights[candidate].near
  snapshot.nearOpacity = alpha
  for (const material of materials) {
    if (material.opacity !== alpha) material.opacity = alpha
  }
  group.visible = candidate >= 0 && alpha > 0.001
  if (!group.visible) return
  for (const definition of parts) {
    definition.mesh.visible = true
    definition.mesh.matrix.multiplyMatrices(bases[candidate], definition.local)
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
  const material = new THREE.MeshStandardMaterial({
    ...parameters, alphaHash: true, transparent: false, depthWrite: true,
  })
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('void main() {', 'varying float vProbeAlpha;\nvarying float vProbeUpper;\nvoid main() {')
      .replace('#include <color_vertex>', '#include <color_vertex>\n#ifdef USE_INSTANCING_COLOR\n  vProbeAlpha = instanceColor.r;\n  vProbeUpper = instanceColor.g;\n  vColor.rgb = vec3(1.0);\n#else\n  vProbeAlpha = 1.0;\n  vProbeUpper = 0.0;\n#endif')
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vProbeAlpha;\nvarying float vProbeUpper;\nvoid main() {')
      .replace('#include <alphahash_fragment>', probeAlphaHashFragment('vProbeAlpha', 'vProbeUpper'))
  }
  material.customProgramCacheKey = () => 'mindverse-probe-partition-fade-v3'
  return material
}

function nearStandard(parameters: THREE.MeshStandardMaterialParameters): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    ...parameters,
    alphaHash: true,
    transparent: false,
    depthWrite: true,
    opacity: 0,
  })
  applyUpperAlphaHashInterval(material)
  return material
}

function applyUpperAlphaHashInterval(material: THREE.Material): void {
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <alphahash_fragment>',
      probeAlphaHashFragment('diffuseColor.a', '1.0'),
    )
  }
  material.customProgramCacheKey = () => 'mindverse-probe-upper-alpha-hash-v1'
}

function probeAlphaHashFragment(alpha: string, upper: string): string {
  return `
#ifdef USE_ALPHAHASH
  float probeAlpha = clamp(${alpha}, 0.0, 1.0);
  if (probeAlpha <= 0.0) discard;
  if (probeAlpha < 1.0) {
    float probeThreshold = getAlphaHashThreshold( vPosition );
    if (${upper} > 0.5) {
      if (probeThreshold < 1.0 - probeAlpha) discard;
    } else if (probeThreshold >= probeAlpha) discard;
  }
  diffuseColor.a = 1.0;
#endif
`
}

export function probeDitherVisible(alpha: number, upperInterval: boolean, threshold: number): boolean {
  const weight = clamp01(alpha)
  if (weight <= 0) return false
  if (weight >= 1) return true
  const sample = clamp01(threshold)
  return upperInterval ? sample >= 1 - weight : sample < weight
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
