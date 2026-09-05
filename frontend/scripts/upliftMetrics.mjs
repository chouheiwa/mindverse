// 提升批次的可量化指标。
//
// 恢复批次的门禁回答的是「Babylon 追平 Three 了吗」；提升批次要回答的是
// 另一个问题：「这一帧比上一帧**更好看**吗」。「好看」不可量化，但它的
// 几个必要条件可以：
//
// | 指标 | 问的问题 | 越大越好？ |
// |---|---|---|
// | `rmsContrast` | 画面有明暗层次，还是一整块灰？ | 是 |
// | `detailDensity` | 表面有材质信息，还是一块平色？ | 是 |
// | `clippedWhite` | 有没有为了「亮」把细节烧掉？ | **否**，越小越好 |
// | `subjectLegibility` | 主体内部读得出结构，还是一团光？ | 是 |
// | `colorSpread` | 有色彩层次，还是全屏一个色相？ | 是 |
//
// 全部只依赖已有的零依赖 PNG 解码器，不引入新依赖。

import { decodePng } from './framePixels.mjs'

/** 与 frameParity 的口径一致：低于这个亮度算背景。 */
export const BACKGROUND_LEVEL = 12 / 255
/** 三通道都达到这个值即判为过曝，与 frameParity 的 clippedWhite 同口径。 */
export const CLIPPED_LEVEL = 250

const luminance = (red, green, blue) => red * 0.2126 + green * 0.7152 + blue * 0.0722

function assertFrame(frame) {
  if (!frame || !Number.isInteger(frame.width) || !Number.isInteger(frame.height)) {
    throw new TypeError('uplift metrics need a decoded frame with integer dimensions')
  }
  if (frame.width <= 0 || frame.height <= 0) throw new RangeError('frame must not be empty')
  if (!frame.data || frame.data.length !== frame.width * frame.height * 4) {
    throw new RangeError('frame data length must be width * height * 4')
  }
  return frame
}

function cropFrame(frame, box) {
  const data = new Uint8ClampedArray(box.width * box.height * 4)
  for (let row = 0; row < box.height; row += 1) {
    const from = ((box.y + row) * frame.width + box.x) * 4
    data.set(frame.data.subarray(from, from + box.width * 4), row * box.width * 4)
  }
  return { width: box.width, height: box.height, data }
}

function normaliseRegion(frame, region) {
  if (!region) return { x: 0, y: 0, width: frame.width, height: frame.height }
  const x = Math.max(0, Math.min(frame.width - 1, Math.round(region.x)))
  const y = Math.max(0, Math.min(frame.height - 1, Math.round(region.y)))
  const width = Math.max(1, Math.min(frame.width - x, Math.round(region.width)))
  const height = Math.max(1, Math.min(frame.height - y, Math.round(region.height)))
  return { x, y, width, height }
}

/**
 * 一帧的提升指标。
 *
 * @param frame 解码后的 RGBA 帧。
 * @param region 可选的测量窗口。**所有**指标都只在这个窗口里算 ——
 *   parity 截图是整页合成帧，右侧 React 面板与左下角问题航道占了大量高对比
 *   像素且两边逐位相同，量整帧会把画布上的差别稀释掉。
 */
export function describeUplift(frame, region) {
  const source = assertFrame(frame)
  const box = normaliseRegion(source, region)
  const { width, height, data } = region ? cropFrame(source, box) : source

  const values = new Float64Array(width * height)
  let clipped = 0
  let foreground = 0
  let foregroundSum = 0
  let foregroundSquares = 0
  let chromaSum = 0

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4
    const red = data[offset]
    const green = data[offset + 1]
    const blue = data[offset + 2]
    const value = luminance(red / 255, green / 255, blue / 255)
    values[index] = value
    if (red >= CLIPPED_LEVEL && green >= CLIPPED_LEVEL && blue >= CLIPPED_LEVEL) clipped += 1
    if (value > BACKGROUND_LEVEL) {
      foreground += 1
      foregroundSum += value
      foregroundSquares += value * value
      const peak = Math.max(red, green, blue)
      const trough = Math.min(red, green, blue)
      chromaSum += peak > 0 ? (peak - trough) / peak : 0
    }
  }

  const mean = foreground > 0 ? foregroundSum / foreground : 0
  const variance = foreground > 0 ? Math.max(0, foregroundSquares / foreground - mean * mean) : 0
  const rmsContrast = mean > 1e-6 ? Math.sqrt(variance) / mean : 0

  // 材质信息密度：拉普拉斯响应的均值。它量的是「相邻像素之间有多少差别」——
  // 一块平色的响应是 0，不管它有多亮。用它而不是方差，是因为方差分不出
  // 「有纹理」和「左半边亮右半边暗」。
  let detailSum = 0
  let detailCount = 0
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const index = y * width + x
      if (values[index] <= BACKGROUND_LEVEL) continue
      const response = 4 * values[index]
        - values[index - 1] - values[index + 1] - values[index - width] - values[index + width]
      detailSum += Math.abs(response)
      detailCount += 1
    }
  }

  // 主体可辨识性：窗口里有多少像素明显偏离窗口均值。
  // 一团纯白的光，这个数是 0；一颗有斑、有米粒、有临边变暗的球，它很高。
  // 注意窗口要落在主体**内部**：同时含黑背景和白恒星的窗口天然接近 1，
  // 那个数不说明任何事。
  const boxCount = width * height
  let boxSum = 0
  for (let index = 0; index < boxCount; index += 1) boxSum += values[index]
  const boxMean = boxCount > 0 ? boxSum / boxCount : 0
  let legible = 0
  if (boxMean > 1e-6) {
    for (let index = 0; index < boxCount; index += 1) {
      if (Math.abs(values[index] - boxMean) / boxMean > 0.05) legible += 1
    }
  }

  return Object.freeze({
    rmsContrast,
    detailDensity: detailCount > 0 ? detailSum / detailCount : 0,
    clippedWhite: clipped / (width * height),
    subjectLegibility: boxCount > 0 ? legible / boxCount : 0,
    colorSpread: foreground > 0 ? chromaSum / foreground : 0,
    foregroundRatio: foreground / (width * height),
  })
}

/** 从 PNG 字节直接算指标。 */
export function describeUpliftPng(bytes, region) {
  return describeUplift(decodePng(bytes), region)
}

/** 两组指标的差，附上「这一项越大越好还是越小越好」。 */
export const UPLIFT_DIRECTIONS = Object.freeze({
  rmsContrast: 'higher',
  detailDensity: 'higher',
  clippedWhite: 'lower',
  subjectLegibility: 'higher',
  colorSpread: 'higher',
  foregroundRatio: 'neutral',
})

export function compareUplift(before, after) {
  const rows = Object.keys(UPLIFT_DIRECTIONS).map((metric) => {
    const from = Number(before[metric] ?? 0)
    const to = Number(after[metric] ?? 0)
    const direction = UPLIFT_DIRECTIONS[metric]
    const improved = direction === 'neutral'
      ? null
      : direction === 'higher' ? to > from : to < from
    return Object.freeze({
      metric,
      before: from,
      after: to,
      delta: to - from,
      ratio: Math.abs(from) > 1e-9 ? to / from : Number.POSITIVE_INFINITY,
      direction,
      improved,
    })
  })
  return Object.freeze(rows)
}
