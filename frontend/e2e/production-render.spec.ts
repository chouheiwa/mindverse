import { expect, test, type Page, type Response } from '@playwright/test'
import { installUniverseFixture, type E2EUniverseFixture } from './helpers/fixtureRoute'

type E2EQuality = 'high' | 'medium' | 'low'
interface RenderSnapshot {
  renderReady: boolean
  frameTimes: number[]
  memory: { geometries: number, textures: number }
  quality: E2EQuality
  probeTransitionFrames: number
}

declare global {
  interface Window {
    __MINDVERSE_E2E__?: { snapshot(): RenderSnapshot }
    __e2eShaderMarkerClearCount?: number
  }
}

// Each case owns a real WebGL context; concurrent Chromium software renderers are unstable in CI.
test.describe.configure({ mode: 'serial' })

function collectRuntimeErrors(page: Page) {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console.error: ${message.text()}`)
  })
  return errors
}

function collectRendererResponses(page: Page) {
  const responses: Response[] = []
  page.on('response', (response) => {
    if (/\/assets\/Renderer-[^/]+\.js(?:\?.*)?$/.test(response.url())) responses.push(response)
  })
  return responses
}

async function openProductionUniverse(page: Page, query = '') {
  await page.goto(`/universe.html${query}`)
}

async function expectRendererReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 15_000 })
}

async function expectCanvasContract(page: Page, fixture: E2EUniverseFixture) {
  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  await expect(canvas).toBeVisible()
  const sizing = await canvas.evaluate((node: HTMLCanvasElement) => {
    const rect = node.getBoundingClientRect()
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      backingWidth: node.width,
      backingHeight: node.height,
      dpr: Math.min(window.devicePixelRatio || 1, 2),
    }
  })
  expect(sizing.cssWidth).toBeGreaterThan(300)
  expect(sizing.cssHeight).toBeGreaterThan(150)
  expect(Math.abs(sizing.backingWidth - sizing.cssWidth * sizing.dpr)).toBeLessThanOrEqual(1)
  expect(Math.abs(sizing.backingHeight - sizing.cssHeight * sizing.dpr)).toBeLessThanOrEqual(1)

  const webglLimits = await canvas.evaluate(async (node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2') ?? node.getContext('webgl')
    if (!gl) throw new Error('WebGL context unavailable during capability check')
    const readyError = gl.getError()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return {
      maxVertexAttributes: gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number,
      readyError,
      observedFrameError: gl.getError(),
      noError: gl.NO_ERROR,
    }
  })
  expect(webglLimits.maxVertexAttributes).toBeGreaterThanOrEqual(16)
  expect(webglLimits.readyError).toBe(webglLimits.noError)
  expect(webglLimits.observedFrameError).toBe(webglLimits.noError)

  const nonBackgroundPixels = await canvas.evaluate(async (node: HTMLCanvasElement) => {
    return await new Promise<number>((resolve, reject) => requestAnimationFrame(() => {
      const gl = node.getContext('webgl2') ?? node.getContext('webgl')
      if (!gl) {
        reject(new Error('WebGL context unavailable during pixel sampling'))
        return
      }
      const pixels = new Uint8Array(node.width * node.height * 4)
      gl.finish()
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let count = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) count += 1
      }
      resolve(count)
    }))
  })
  expect(nonBackgroundPixels).toBeGreaterThanOrEqual(fixture.assertions.minNonBackgroundPixels)
}

async function expectSnapshot(page: Page, quality?: E2EQuality) {
  const snapshot = await page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot())
  expect(snapshot).toBeDefined()
  expect(snapshot?.renderReady).toBe(true)
  if (quality) expect(snapshot?.quality).toBe(quality)
  else expect(snapshot?.quality).toMatch(/^(high|medium|low)$/)
  expect(snapshot?.frameTimes.length).toBeGreaterThanOrEqual(2)
  expect(snapshot?.frameTimes.every((duration) => Number.isFinite(duration) && duration >= 0)).toBe(true)
  expect(snapshot?.memory.geometries).toBeGreaterThan(0)
  expect(snapshot?.memory.textures).toBeGreaterThanOrEqual(0)

  const mutated = await page.evaluate(() => {
    const first = window.__MINDVERSE_E2E__!.snapshot()
    first.frameTimes.push(-1)
    first.memory.geometries = -1
    return window.__MINDVERSE_E2E__!.snapshot()
  })
  expect(mutated.frameTimes).not.toContain(-1)
  expect(mutated.memory.geometries).toBeGreaterThan(0)
}

async function expectProbeNearTransitionHasNoWebGLError(page: Page) {
  const skip = page.getByRole('button', { name: '跳过 →' })
  if (await skip.isVisible()) await skip.click()
  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('render canvas has no layout bounds')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible()
  await canvas.hover()
  for (let index = 0; index < 12; index += 1) await page.mouse.wheel(0, -100)

  const result = await canvas.evaluate(async (node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2') ?? node.getContext('webgl')
    if (!gl) throw new Error('WebGL context unavailable during probe transition')
    await new Promise<void>((resolve) => {
      let frames = 0
      const next = () => {
        frames += 1
        if (frames >= 90) resolve()
        else requestAnimationFrame(next)
      }
      requestAnimationFrame(next)
    })
    const transitionError = gl.getError()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { transitionError, settledError: gl.getError(), noError: gl.NO_ERROR }
  })
  expect(result.transitionError).toBe(result.noError)
  expect(result.settledError).toBe(result.noError)
  const snapshot = await page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot())
  expect(snapshot?.probeTransitionFrames).toBeGreaterThan(0)
}

test('production universe satisfies the first-frame render contract', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const responses = collectRendererResponses(page)
  const fixture = await installUniverseFixture(page)

  await openProductionUniverse(page)
  await expectRendererReady(page)

  expect(responses.map((response) => response.status())).toEqual([200])
  await expectCanvasContract(page, fixture)
  await expectSnapshot(page)
  await expectProbeNearTransitionHasNoWebGLError(page)
  expect(errors).toEqual([])
})

test('an article probe can be approached, controlled, scanned and closed accessibly', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const fixture = await installUniverseFixture(page)
  await openProductionUniverse(page)
  await expectRendererReady(page)
  const skip = page.getByRole('button', { name: '跳过 →' })
  if (await skip.isVisible()) await skip.click()
  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('render canvas has no layout bounds')
  await page.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible()

  const trigger = page.getByRole('button', { name: '检查探测器' }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: /检查探测器：/ })
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.uv-bar')).toHaveAttribute('inert', '')
  const inspectionTitle = page.getByRole('heading', { name: /检查探测器：/ })
  await expect(inspectionTitle).toBeFocused({ timeout: 5_000 })
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭探测器检查' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '开始扫描' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭探测器检查' })).toBeFocused()
  await page.getByRole('button', { name: '向左旋转' }).click()
  await page.getByRole('button', { name: '聚焦部件：天线' }).click()
  await page.getByRole('button', { name: '开始扫描' }).click()
  const article = page.getByRole('link', { name: '查看原文章' })
  await expect(article).toBeVisible({ timeout: 5_000 })
  const expectedUrl = fixture.generation.universe?.probes?.[0]?.url
  expect(expectedUrl).toBeTruthy()
  await expect(article).toHaveAttribute('href', expectedUrl!)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  const glError = await canvas.evaluate((node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2') ?? node.getContext('webgl')
    return gl ? { actual: gl.getError(), expected: gl.NO_ERROR } : null
  })
  expect(glError?.actual).toBe(glError?.expected)
  expect(errors).toEqual([])
})

test('a failed Renderer chunk records 503 and reload recovery reaches a 2xx ready render', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const fixture = await installUniverseFixture(page)
  const responses = collectRendererResponses(page)
  let rendererRequests = 0
  await page.route(/\/assets\/Renderer-[^/]+\.js$/, async (route) => {
    rendererRequests += 1
    if (rendererRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
    } else {
      await route.continue()
    }
  })

  await openProductionUniverse(page)
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)

  expect(responses.map((response) => response.status())).toEqual([503, 200])
  await expectCanvasContract(page, fixture)
  await expectSnapshot(page)
  expect(errors.filter((error) => !error.includes('503'))).toEqual([])
})

test('WebGL context creation failure remounts the renderer on the same page', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const fixture = await installUniverseFixture(page)
  const responses = collectRendererResponses(page)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    ;(window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail = true
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if ((type === 'webgl' || type === 'webgl2')
        && (window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail) return null
      return original.call(this, type, ...args as [])
    } as typeof HTMLCanvasElement.prototype.getContext
  })

  await openProductionUniverse(page)
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  await page.evaluate(() => { (window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail = false })
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)

  expect(responses.map((response) => response.status())).toEqual([200])
  await expectCanvasContract(page, fixture)
  await expectSnapshot(page)
  await expect(page).toHaveURL(/\/universe\.html$/)
  expect(errors.filter((error) => !error.includes('Error creating WebGL context'))).toEqual([])
})

test('one-shot shader failure remounts on the same page and becomes ready', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const fixture = await installUniverseFixture(page)
  const responses = collectRendererResponses(page)
  await page.addInitScript(() => {
    const original = Storage.prototype.removeItem
    window.__e2eShaderMarkerClearCount = 0
    Storage.prototype.removeItem = function (key: string) {
      if (key === 'mindverse:e2e-shader-failed') window.__e2eShaderMarkerClearCount! += 1
      return original.call(this, key)
    }
  })

  await openProductionUniverse(page, '?e2eShaderFail=once')
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  expect(await page.evaluate(() => sessionStorage.getItem('mindverse:e2e-shader-failed'))).toBe('1')
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)
  expect(await page.evaluate(() => sessionStorage.getItem('mindverse:e2e-shader-failed'))).toBeNull()
  expect(await page.evaluate(() => window.__e2eShaderMarkerClearCount)).toBe(1)

  expect(responses.map((response) => response.status())).toEqual([200])
  await expectCanvasContract(page, fixture)
  await expectSnapshot(page)
  await expect(page).toHaveURL(/e2eShaderFail=once/)
  expect(errors).toEqual([])
})

for (const quality of ['medium', 'low'] as const) {
  test(`diagnostic quality override reports ${quality} without exposing state mutation`, async ({ page }) => {
    const fixture = await installUniverseFixture(page)
    await openProductionUniverse(page, `?e2eQuality=${quality}`)
    await expectRendererReady(page)
    await expectCanvasContract(page, fixture)
    await expectSnapshot(page, quality)
    const apiShape = await page.evaluate(() => Object.keys(window.__MINDVERSE_E2E__ ?? {}))
    expect(apiShape).toEqual(['snapshot'])
  })
}
