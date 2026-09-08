// 星群结构环的缩放可见性。
//
// 环画在恒星绕星群质心的**真实公转半径**上，是「这是个星系」在全景下最强的
// 结构信号。但它是**全景尺度**的东西：一旦相机推进到单个恒星系，它就退化成
// 横在画面上的几条大弧线 —— 信息量归零，只剩遮挡。
//
// 规则放在这里而不是某个渲染器里，是因为 Three 与 Babylon 都还在出包，两边
// 必须画出同一套环；口径分叉会让同一份语料在两个构建里长得不一样。

/**
 * 开始变淡的相机距离，单位是全景机位距离的倍数。
 * 取 1.0 —— 全景机位本身就是上界，往里推一点就开始退场。
 */
export const CLUSTER_RING_FADE_START = 1

/**
 * 完全消失的相机距离，单位是全景机位距离的倍数。
 *
 * 取 0.6 而不是更小：聚焦恒星时相机半径最多是全景的 0.72 倍
 * （`framing` 的上限钳位），淡出必须在**够到那个上限之前**基本走完，
 * 否则最大的那种恒星系里环会一直挂着。
 */
export const CLUSTER_RING_FADE_END = 0.6

const usable = (value: number): boolean => Number.isFinite(value) && value > 0

/**
 * @param cameraDistance 相机到注视点的距离。
 * @param panoramaDistance 全景机位距离（两个渲染器同为 sceneRadius × 1.62）。
 * @returns [0,1] 的可见度系数，乘到环的 uGain 上。
 */
export function clusterRingOpacity(cameraDistance: number, panoramaDistance: number): number {
  // 全景距离尚未配置时不能把环误伤成不可见 —— 那会让全景第一帧丢一层。
  if (!usable(panoramaDistance)) return 1
  if (!Number.isFinite(cameraDistance)) return cameraDistance > 0 ? 1 : 0
  const factor = cameraDistance / panoramaDistance
  if (factor <= CLUSTER_RING_FADE_END) return 0
  if (factor >= CLUSTER_RING_FADE_START) return 1
  const t = (factor - CLUSTER_RING_FADE_END) / (CLUSTER_RING_FADE_START - CLUSTER_RING_FADE_END)
  return t * t * (3 - 2 * t)
}
