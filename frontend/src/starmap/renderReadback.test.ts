import { afterEach, describe, expect, test, vi } from 'vitest'
import { readFreshPixelStats } from './renderReadback'

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
