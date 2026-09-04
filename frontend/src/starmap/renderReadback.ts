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
