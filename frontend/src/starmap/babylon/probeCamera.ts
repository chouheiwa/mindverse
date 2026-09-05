import { normalizeInspectionPose, type InspectionPose } from '../probeInspection'

// 探测器检查机位，与 Renderer.ts::applyProbeInspectionCamera 同式。
//
// 「主动旋转观察」在旧版是**相机绕着机体转**，不是机体自转 —— 两者看起来像，
// 但只有前者能让平移（pan）与拉近（distance）落在同一套约定里，也只有前者
// 能让接近过程是一段从当前机位到检查机位的插值。

/** Three PROBE_APPROACH_MS：从当前机位飞到检查机位的时长。 */
export const PROBE_APPROACH_MS = 520

export type Vec3 = readonly [number, number, number]

/** 检查视角的注视点：机体位置 + 用户平移量。 */
export function probeInspectionLookAt(probe: Vec3, pose: Readonly<InspectionPose>): Vec3 {
  const safe = normalizeInspectionPose(pose)
  return [probe[0] + safe.panX, probe[1] + safe.panY, probe[2]]
}

/**
 * 检查机位。轴序与 Three 一致：
 * `x = +sin(yaw)cos(pitch)·d`、`y = −sin(pitch)·d`、`z = +cos(yaw)cos(pitch)·d`。
 */
export function probeInspectionCamera(
  probe: Vec3,
  pose: Readonly<InspectionPose>,
): Readonly<{ position: Vec3; lookAt: Vec3 }> {
  const safe = normalizeInspectionPose(pose)
  const lookAt = probeInspectionLookAt(probe, safe)
  const cosPitch = Math.cos(safe.pitch)
  const position: Vec3 = [
    lookAt[0] + Math.sin(safe.yaw) * cosPitch * safe.distance,
    lookAt[1] - Math.sin(safe.pitch) * safe.distance,
    lookAt[2] + Math.cos(safe.yaw) * cosPitch * safe.distance,
  ]
  return Object.freeze({ position, lookAt })
}

/** 接近进度，越界与非数都收敛到 [0, 1]。 */
export function approachMix(elapsedMs: number, durationMs = PROBE_APPROACH_MS): number {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return 0
  const span = Number.isFinite(durationMs) && durationMs > 0 ? durationMs : PROBE_APPROACH_MS
  return Math.min(1, elapsedMs / span)
}
