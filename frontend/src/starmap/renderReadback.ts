export interface FreshPixelStats {
  readonly nonBackground: number
  readonly deepBlack: number
  readonly total: number
}

export async function readFreshPixelStats(
  node: HTMLCanvasElement,
  attemptBudget: number,
): Promise<FreshPixelStats> {
  const initialRenderCount = window.__MINDVERSE_E2E__?.snapshot().resources.actualRenderCount
  if (typeof initialRenderCount !== 'number' || !Number.isFinite(initialRenderCount)) {
    throw new Error('Actual render count is unavailable')
  }
  return await new Promise<FreshPixelStats>((resolve, reject) => {
    let attempts = 0
    const sampleAfterRender = () => requestAnimationFrame(() => {
      attempts += 1
      const renderCount = window.__MINDVERSE_E2E__?.snapshot().resources.actualRenderCount
      if (typeof renderCount !== 'number' || !Number.isFinite(renderCount)) {
        reject(new Error('Actual render count is unavailable'))
        return
      }
      if (renderCount <= initialRenderCount) {
        if (attempts < attemptBudget) sampleAfterRender()
        else reject(new Error(`Actual render count did not advance within ${attemptBudget} animation frames`))
        return
      }
      const gl = node.getContext('webgl2') ?? node.getContext('webgl')
      if (!gl) {
        reject(new Error('WebGL context unavailable during pixel sampling'))
        return
      }
      const pixels = new Uint8Array(node.width * node.height * 4)
      gl.finish()
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let nonBackground = 0
      let deepBlack = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) nonBackground += 1
        else deepBlack += 1
      }
      resolve({ nonBackground, deepBlack, total: pixels.length / 4 })
    })
    sampleAfterRender()
  })
}

export interface FreshLuminanceProfile {
  /** 自上而下的分带平均亮度，0–1。 */
  readonly bands: readonly number[]
  readonly nonBackground: number
  readonly total: number
}

/**
 * 分带亮度剖面。
 *
 * 「有没有画东西」用总量就够；「是不是一个纵向分层的世界」必须看剖面 ——
 * 一整块同亮度和真正的地层，总量可以完全一样。
 */
export async function readFreshLuminanceProfile(
  node: HTMLCanvasElement,
  attemptBudget: number,
  bandCount = 9,
): Promise<FreshLuminanceProfile> {
  const initialRenderCount = window.__MINDVERSE_E2E__?.snapshot().resources.actualRenderCount
  if (typeof initialRenderCount !== 'number' || !Number.isFinite(initialRenderCount)) {
    throw new Error('Actual render count is unavailable')
  }
  const bands = Math.max(1, Math.floor(bandCount))
  return await new Promise<FreshLuminanceProfile>((resolve, reject) => {
    let attempts = 0
    const sampleAfterRender = () => requestAnimationFrame(() => {
      attempts += 1
      const renderCount = window.__MINDVERSE_E2E__?.snapshot().resources.actualRenderCount
      if (typeof renderCount !== 'number' || !Number.isFinite(renderCount)) {
        reject(new Error('Actual render count is unavailable'))
        return
      }
      if (renderCount <= initialRenderCount) {
        if (attempts < attemptBudget) sampleAfterRender()
        else reject(new Error(`Actual render count did not advance within ${attemptBudget} animation frames`))
        return
      }
      const gl = node.getContext('webgl2') ?? node.getContext('webgl')
      if (!gl) {
        reject(new Error('WebGL context unavailable during pixel sampling'))
        return
      }
      const width = node.width
      const height = node.height
      const pixels = new Uint8Array(width * height * 4)
      gl.finish()
      gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      const rows = Math.max(1, Math.floor(height / bands))
      const profile: number[] = []
      let nonBackground = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) nonBackground += 1
      }
      // readPixels 的原点在左下：从最后一带往前读，剖面才是「自上而下」。
      for (let band = bands - 1; band >= 0; band -= 1) {
        let sum = 0
        let samples = 0
        const stop = band === bands - 1 ? height : (band + 1) * rows
        for (let y = band * rows; y < stop; y += 2) {
          for (let x = 0; x < width; x += 4) {
            const offset = (y * width + x) * 4
            sum += (pixels[offset] * 0.2126 + pixels[offset + 1] * 0.7152 + pixels[offset + 2] * 0.0722) / 255
            samples += 1
          }
        }
        profile.push(samples > 0 ? sum / samples : 0)
      }
      resolve({ bands: profile, nonBackground, total: pixels.length / 4 })
    })
    sampleAfterRender()
  })
}
