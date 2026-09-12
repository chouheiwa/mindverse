import type { Cluster, Wormhole } from '../../types'
import type { Vec3 } from './cubeSphere'

// 站在球上也要能回答「它和谁连着」：同恒星系的其他问题挂在天上（按真实方向），
// 有虫洞通向的星群用另一种颜色标出来。点一下飞过去。

export type SurfaceBeaconKind = 'planet' | 'wormhole'

export interface SurfaceBeacon {
  readonly kind: SurfaceBeaconKind
  readonly key: string
  readonly label: string
  /** 从行星中心指向目标的单位方向（世界坐标）。 */
  readonly direction: Vec3
  readonly questionId?: string
  readonly starId?: string
  readonly wormholeIndex?: number
}

export interface SurfaceBeaconInput {
  readonly centre: Vec3
  /** 落点方向（脚下法线）。有它才能把地平线以下的邻居抬到天上。 */
  readonly up?: Vec3
  readonly questionId: string
  readonly clusterId: number
  readonly siblings: readonly {
    readonly questionId: string
    readonly starId: string
    readonly title: string
    readonly position: Vec3
  }[]
  readonly clusters: readonly Cluster[]
  readonly wormholes: readonly Wormhole[]
}

const LABEL_MAX = 18
/** 信标至少抬到地平线上 12°：方位是真的（朝它走就对），高度是为了看得见。 */
const MIN_ELEVATION = Math.PI * 12 / 180

const direction = (from: Vec3, to: Vec3): Vec3 | null => {
  const d: Vec3 = [to[0] - from[0], to[1] - from[1], to[2] - from[2]]
  const length = Math.hypot(d[0], d[1], d[2])
  return Number.isFinite(length) && length > 1e-9 ? [d[0] / length, d[1] / length, d[2] / length] : null
}

/** 天上挂不下一整句：超长标题截断。 */
export function beaconLabel(title: string): string {
  const text = title.trim()
  return text.length > LABEL_MAX ? `${text.slice(0, LABEL_MAX)}…` : text
}

/** 抬起来的信标在 12°–24° 之间错开，不然全排在同一条线上。 */
const LIFT_SPREAD = Math.PI * 12 / 180

/** 地平线以下的方向抬到最低高度角（按序号错开），方位不变。 */
export function liftAboveHorizon(dir: Vec3, up: Vec3 | undefined, ordinal = 0): Vec3 {
  if (!up) return dir
  const upLength = Math.hypot(up[0], up[1], up[2])
  if (!(upLength > 1e-9)) return dir
  const n: Vec3 = [up[0] / upLength, up[1] / upLength, up[2] / upLength]
  const elevation = dir[0] * n[0] + dir[1] * n[1] + dir[2] * n[2]
  if (elevation >= Math.sin(MIN_ELEVATION)) return dir
  const tangent: Vec3 = [dir[0] - n[0] * elevation, dir[1] - n[1] * elevation, dir[2] - n[2] * elevation]
  const length = Math.hypot(tangent[0], tangent[1], tangent[2])
  if (!(length > 1e-9)) return n
  const lifted = MIN_ELEVATION + LIFT_SPREAD * (((Math.max(0, Math.floor(ordinal)) * 0.6180339887498949) % 1))
  const cosine = Math.cos(lifted)
  const sine = Math.sin(lifted)
  return [
    tangent[0] / length * cosine + n[0] * sine,
    tangent[1] / length * cosine + n[1] * sine,
    tangent[2] / length * cosine + n[2] * sine,
  ]
}

export function surfaceBeaconsFor(input: SurfaceBeaconInput): SurfaceBeacon[] {
  const beacons: SurfaceBeacon[] = []
  for (const sibling of input.siblings) {
    if (sibling.questionId === input.questionId) continue
    const dir = direction(input.centre, sibling.position)
    if (!dir) continue
    beacons.push({
      kind: 'planet', key: sibling.questionId, label: beaconLabel(sibling.title),
      direction: liftAboveHorizon(dir, input.up, beacons.length),
      questionId: sibling.questionId, starId: sibling.starId,
    })
  }
  input.wormholes.forEach((wormhole, index) => {
    const other = wormhole.a === input.clusterId ? wormhole.b : wormhole.b === input.clusterId ? wormhole.a : null
    if (other === null) return
    const cluster = input.clusters.find(({ g }) => g === other)
    if (!cluster) return
    const dir = direction(input.centre, cluster.c)
    if (!dir) return
    beacons.push({
      kind: 'wormhole', key: `wormhole:${index}`, label: `→ ${beaconLabel(cluster.name)}`,
      direction: liftAboveHorizon(dir, input.up, beacons.length),
      wormholeIndex: index,
    })
  })
  return beacons
}
