import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFreshLuminanceProfile, readFreshPixelStats } from './renderReadback'

afterEach(() => vi.unstubAllGlobals())

function installRenderCounts(counts: Array<number | undefined>) {
  vi.stubGlobal('__MINDVERSE_E2E__', {
    snapshot: () => ({ resources: { actualRenderCount: counts.shift() } }),
  })
}

function canvasWithPixels(): HTMLCanvasElement {
  const gl = {
    RGBA: 1,
    UNSIGNED_BYTE: 2,
    finish: vi.fn(),
    readPixels: vi.fn((_x, _y, _width, _height, _format, _type, pixels: Uint8Array) => pixels.fill(24)),
  }
  return { width: 1, height: 1, getContext: vi.fn(() => gl) } as unknown as HTMLCanvasElement
}

describe('fresh render readback gate', () => {
  test('luminance profile reports per-band contrast so a flat grey plane cannot pass as texture', async () => {
    installRenderCounts([1, 2])
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => { callback(0); return 1 }))
    const gl = {
      RGBA: 1, UNSIGNED_BYTE: 2, finish: vi.fn(),
      readPixels: vi.fn((_x, _y, width: number, height: number, _f, _t, pixels: Uint8Array) => {
        for (let y = 0; y < height; y += 1) {
          for (let x = 0; x < width; x += 1) {
            // 上半带：平灰；下半带：黑白棋盘。
            const value = y < height / 2 ? 100 : (x % 8 < 4 ? 30 : 200)
            pixels.set([value, value, value, 255], (y * width + x) * 4)
          }
        }
      }),
    }
    const canvas = { width: 64, height: 16, getContext: vi.fn(() => gl) } as unknown as HTMLCanvasElement
    const profile = await readFreshLuminanceProfile(canvas, 3, 2)
    expect(profile.bands).toHaveLength(2)
    expect(profile.contrast).toHaveLength(2)
    // readPixels 原点在左下，剖面自上而下：第 0 带是棋盘（高对比），第 1 带是平灰。
    expect(profile.contrast[0]!).toBeGreaterThan(0.2)
    expect(profile.contrast[1]!).toBeLessThan(0.001)
  })

  test('resolves only after the actual render count advances', async () => {
    installRenderCounts([7, 7, 8])
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)

    await expect(readFreshPixelStats(canvasWithPixels(), 3)).resolves.toEqual({
      nonBackground: 1,
      deepBlack: 0,
      total: 1,
    })

    expect(requestFrame).toHaveBeenCalledTimes(2)
  })

  test('rejects instead of permitting stale readback when the RAF budget is exhausted', async () => {
    installRenderCounts([7, 7, 7, 7])
    const requestFrame = vi.fn((callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestFrame)

    await expect(readFreshPixelStats(canvasWithPixels(), 3))
      .rejects.toThrow('Actual render count did not advance within 3 animation frames')
    expect(requestFrame).toHaveBeenCalledTimes(3)
  })

  test('rejects when actual render diagnostics are unavailable', async () => {
    installRenderCounts([undefined])
    const requestFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestFrame)

    await expect(readFreshPixelStats(canvasWithPixels(), 3))
      .rejects.toThrow('Actual render count is unavailable')
    expect(requestFrame).not.toHaveBeenCalled()
  })
})
