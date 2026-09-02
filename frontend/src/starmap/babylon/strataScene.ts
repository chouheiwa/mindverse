import type { AnswerSpecimen, StrataSceneModel } from '../../domain/strata'
import type { StrataMoveIntent, StrataPose } from '../rendererContract'

export interface CaveBounds {
  readonly minDepth: number
  readonly maxDepth: number
  readonly radius: number
}

export interface CaveLayerPlacement {
  readonly id: string
  readonly centerDepth: number
  readonly thickness: number
  readonly colorIndex: number
}

export interface CaveSpecimenPlacement {
  readonly answerId: string
  readonly depth: number
  readonly x: number
  readonly z: number
  readonly scale: number
  readonly room: 'main' | 'undated' | 'surface'
  readonly relations: AnswerSpecimen['relations']
}

export interface CaveLayout {
  readonly evidenceLevel: StrataSceneModel['evidenceLevel']
  readonly entryPose: StrataPose
  readonly bounds: CaveBounds
  readonly layers: readonly CaveLayerPlacement[]
  readonly specimens: readonly CaveSpecimenPlacement[]
  readonly undatedRoom: Readonly<{ centerDepth: number; angle: number; x: number; z: number; radius: number }> | null
  readonly blockedDepth: boolean
}

export interface SpecimenFocus {
  readonly answerId: string
  readonly savedPose: StrataPose
  readonly pose: StrataPose
}

const SURFACE_ROOM_DEPTH = 5
const CAVE_RADIUS = 4.8
const SNAP_ENTER_RADIUS = 0.9
const SNAP_EXIT_RADIUS = 1.8
const PITCH_LIMIT = 1.15
export const CAVE_CYLINDER_CAP = 'none' as const

export function buildCaveLayout(scene: StrataSceneModel, entryPose: StrataPose): CaveLayout {
  const entry = copyPose(entryPose)
  if (scene.evidenceLevel === 'surface-only') {
    return Object.freeze({
      evidenceLevel: scene.evidenceLevel,
      entryPose: entry,
      bounds: Object.freeze({ minDepth: 0, maxDepth: SURFACE_ROOM_DEPTH, radius: CAVE_RADIUS }),
      layers: Object.freeze([]),
      specimens: Object.freeze(scene.surfaceSpecimens.map((item, index) =>
        specimenPlacement(item, index, scene.surfaceSpecimens.length, 2.35, 'surface'))),
      undatedRoom: null,
      blockedDepth: true,
    })
  }

  const layers = scene.strata.map((layer, index): CaveLayerPlacement => Object.freeze({
    id: layer.id,
    centerDepth: layer.centerDepth,
    thickness: layer.thickness,
    colorIndex: index % 4,
  }))
  const dated = scene.strata.flatMap((layer) => layer.specimens.map((item, index) =>
    specimenPlacement(item, index, layer.specimens.length, chronologicalDepth(item, layer), 'main')))
  const sideRoomDepth = Math.max(2.4, Math.min(scene.bounds.bottom - 1, scene.bounds.bottom * 0.58))
  const sideRoomAngle = Math.PI * 0.38
  const sideRoomDistance = CAVE_RADIUS + 2.15
  const undatedRoom = scene.undated.length > 0 ? Object.freeze({
    centerDepth: sideRoomDepth,
    angle: sideRoomAngle,
    x: round(Math.sin(sideRoomAngle) * sideRoomDistance),
    z: round(Math.cos(sideRoomAngle) * sideRoomDistance),
    radius: 2.2,
  }) : null
  const undated = scene.undated.map((item, index) =>
    specimenPlacement(item, index, scene.undated.length, sideRoomDepth, 'undated', undatedRoom))

  return Object.freeze({
    evidenceLevel: scene.evidenceLevel,
    entryPose: entry,
    bounds: Object.freeze({ minDepth: scene.bounds.top, maxDepth: scene.bounds.bottom, radius: CAVE_RADIUS }),
    layers: Object.freeze(layers),
    specimens: Object.freeze([...dated, ...undated]),
    undatedRoom,
    blockedDepth: false,
  })
}

export function advanceStrataPose(
  pose: StrataPose,
  intent: StrataMoveIntent,
  deltaSeconds: number,
  layout: CaveLayout,
): StrataPose {
  const elapsed = clamp(deltaSeconds, 0, 0.1)
  const forward = clamp(intent.forward, -1, 1)
  const yaw = clamp(intent.yaw, -1, 1)
  const pitch = clamp(intent.pitch, -1, 1)
  const speed = pose.snapId ? 7 : 11
  return snapStrataPose({
    depth: clamp(pose.depth + forward * speed * elapsed, layout.bounds.minDepth, layout.bounds.maxDepth),
    yaw: wrapAngle(pose.yaw + yaw * 1.8 * elapsed),
    pitch: clamp(pose.pitch + pitch * 1.4 * elapsed, -PITCH_LIMIT, PITCH_LIMIT),
    snapId: pose.snapId,
  }, layout)
}

export function snapStrataPose(pose: StrataPose, layout: CaveLayout): StrataPose {
  if (layout.evidenceLevel !== 'retrospective' || layout.layers.length === 0) return copyPose({ ...pose, snapId: null })
  if (pose.snapId) {
    const active = layout.layers.find(({ id }) => id === pose.snapId)
    if (active && Math.abs(pose.depth - active.centerDepth) <= SNAP_EXIT_RADIUS) {
      return copyPose({ ...pose, snapId: active.id })
    }
  }
  const nearest = layout.layers.reduce<CaveLayerPlacement | null>((winner, layer) => {
    if (!winner) return layer
    return Math.abs(layer.centerDepth - pose.depth) < Math.abs(winner.centerDepth - pose.depth) ? layer : winner
  }, null)
  return nearest && Math.abs(nearest.centerDepth - pose.depth) <= SNAP_ENTER_RADIUS
    ? copyPose({ ...pose, depth: nearest.centerDepth, snapId: nearest.id })
    : copyPose({ ...pose, snapId: null })
}

export function focusSpecimen(pose: StrataPose, specimen: CaveSpecimenPlacement): SpecimenFocus {
  return Object.freeze({
    answerId: specimen.answerId,
    savedPose: copyPose(pose),
    pose: copyPose({
      depth: specimen.depth,
      yaw: wrapAngle(Math.atan2(specimen.x, specimen.z) - 0.28),
      pitch: clamp((specimen.depth - pose.depth) * 0.045, -0.35, 0.35),
      snapId: pose.snapId,
    }),
  })
}

export function closeSpecimenFocus(focus: SpecimenFocus | null): StrataPose | null {
  return focus ? copyPose(focus.savedPose) : null
}

function specimenPlacement(
  specimen: AnswerSpecimen,
  index: number,
  count: number,
  depth: number,
  room: CaveSpecimenPlacement['room'],
  undatedRoom: CaveLayout['undatedRoom'] = null,
): CaveSpecimenPlacement {
  const seed = stableHash(specimen.answerId)
  const baseAngle = count <= 1 ? 0 : index / count * Math.PI * 2
  const roomOffset = room === 'undated' ? Math.PI * 0.38 : 0
  const angle = baseAngle + roomOffset + ((seed & 255) / 255 - 0.5) * 0.26
  const radius = room === 'undated' ? 0.85 : 3.85 + ((seed >>> 8 & 255) / 255) * 0.4
  const centerX = room === 'undated' ? undatedRoom?.x ?? 0 : 0
  const centerZ = room === 'undated' ? undatedRoom?.z ?? 0 : 0
  return Object.freeze({
    answerId: specimen.answerId,
    depth: round(depth + ((seed >>> 16 & 255) / 255 - 0.5) * 0.72),
    x: round(centerX + Math.sin(angle) * radius),
    z: round(centerZ + Math.cos(angle) * radius),
    scale: round(0.22 + ((seed >>> 24 & 255) / 255) * 0.18),
    room,
    relations: specimen.relations,
  })
}

function chronologicalDepth(specimen: AnswerSpecimen, layer: Readonly<{
  startPublishedAt: number
  endPublishedAt: number
  centerDepth: number
  thickness: number
}>): number {
  const span = Math.max(1, layer.endPublishedAt - layer.startPublishedAt)
  const publishedAt = specimen.publishedAt ?? layer.startPublishedAt
  const chronology = clamp((publishedAt - layer.startPublishedAt) / span, 0, 1)
  const margin = Math.min(0.6, layer.thickness * 0.12)
  const usable = Math.max(0.5, layer.thickness - margin * 2)
  return round(layer.centerDepth + usable / 2 - chronology * usable)
}

export function movementDeltaSeconds(previousMs: number | null, currentMs: number): number {
  if (previousMs === null || !Number.isFinite(previousMs) || !Number.isFinite(currentMs)) return 1 / 60
  return clamp((currentMs - previousMs) / 1000, 1 / 240, 0.1)
}

const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : 0))

const round = (value: number): number => Math.round(value * 1_000_000) / 1_000_000

function wrapAngle(value: number): number {
  const wrapped = (value + Math.PI) % (Math.PI * 2)
  return (wrapped < 0 ? wrapped + Math.PI * 2 : wrapped) - Math.PI
}

function copyPose(pose: StrataPose): StrataPose {
  return Object.freeze({ depth: pose.depth, yaw: pose.yaw, pitch: pose.pitch, snapId: pose.snapId })
}

function stableHash(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}
