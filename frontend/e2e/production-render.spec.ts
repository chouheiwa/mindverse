import { expect, test, type Page, type Response } from '@playwright/test'
import type { RenderSnapshot } from '../src/starmap/e2eDiagnostics'
import { readFreshPixelStats } from '../src/starmap/renderReadback'
import { installUniverseFixture, type E2EUniverseFixture } from './helpers/fixtureRoute'

type E2EQuality = 'high' | 'medium' | 'low'

declare global {
  interface Window {
    __e2eShaderMarkerClearCount?: number
  }
}

// Each case owns a real WebGL context; concurrent Chromium software renderers are unstable in CI.
test.describe.configure({ mode: 'serial' })

test.beforeEach(({ page: _page }, testInfo) => {
  if (testInfo.project.name === 'swiftshader-functional') testInfo.setTimeout(90_000)
})

async function gpuRenderer(page: Page) {
  return page.locator('canvas[aria-label="认知宇宙三维星图"]').evaluate((node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2') ?? node.getContext('webgl')
    if (!gl) return 'unavailable'
    const extension = gl.getExtension('WEBGL_debug_renderer_info')
    return extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER))
  })
}

test.afterEach(async ({ page }, testInfo) => {
  if (await page.locator('[data-testid="universe-root"][data-render-state="ready"]').count() === 0) return
  const renderer = await gpuRenderer(page)
  if (testInfo.project.name === 'swiftshader-functional') {
    expect(renderer, 'functional WebGL tests must use deterministic SwiftShader').toMatch(/SwiftShader/i)
  } else if (testInfo.project.name === 'metal-performance') {
    expect(renderer, 'performance tests require the Darwin Metal backend').toMatch(/Metal/i)
    expect(renderer).not.toMatch(/SwiftShader/i)
  }
  process.stdout.write(`[renderer] project=${testInfo.project.name} gpu=${renderer}\n`)
})

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
    if (/\/assets\/(?:Renderer|_virtual_mindverse-renderer)-[^/]+\.js(?:\?.*)?$/.test(response.url())) responses.push(response)
  })
  return responses
}

async function openProductionUniverse(page: Page, query = '') {
  await page.goto(`/universe.html${query}`)
}

async function expectRendererReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
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

  const pixels = await canvas.evaluate(readFreshPixelStats, 10)
  expect(pixels.nonBackground).toBeGreaterThanOrEqual(fixture.assertions.minNonBackgroundPixels)
  expect(pixels.deepBlack).toBeGreaterThan(pixels.total * 0.5)
  process.stdout.write(`[visual] url=${page.url()} nonBackground=${pixels.nonBackground} deepBlack=${pixels.deepBlack} total=${pixels.total}\n`)
  return pixels
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
  expect(snapshot?.scene.planetCount).toBe(512)
  expect(snapshot?.scene.probeCount).toBe(300)
  if (snapshot?.rendererKind === 'babylon') {
    expect(snapshot.resources).toMatchObject({
      materializedPlanetCount: 0,
      planetVisualConstructions: 0,
      planetShaderCompileRequests: 0,
      planetUpdatesLastFrame: 0,
    })
  }

  const mutated = await page.evaluate(() => {
    const first = window.__MINDVERSE_E2E__!.snapshot()
    first.frameTimes.push(-1)
    first.frames.dropped = -1
    first.memory.geometries = -1
    return window.__MINDVERSE_E2E__!.snapshot()
  })
  expect(mutated.frameTimes).not.toContain(-1)
  expect(mutated.frames.dropped).toBeGreaterThanOrEqual(0)
  expect(mutated.memory.geometries).toBeGreaterThan(0)
}

async function openFirstStarPanel(page: Page) {
  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  const bounds = await canvas.boundingBox()
  if (!bounds) throw new Error('render canvas has no layout bounds')
  const target = await page.evaluate(() => {
    const scene = window.__MINDVERSE_E2E__?.snapshot().scene
    return scene?.firstStarX === null || scene?.firstStarY === null
      ? null
      : { x: scene?.firstStarX, y: scene?.firstStarY }
  })
  if (!target || target.x === undefined || target.y === undefined) throw new Error('first star is not projectable')
  process.stdout.write(`[pick] firstStar=(${target.x},${target.y}) canvas=${bounds.width}x${bounds.height}\n`)
  await canvas.click({ position: { x: target.x, y: target.y }, force: true })
  await page.getByRole('button', { name: /Alpha 进入恒星系/ }).click()
  await expect(page.getByRole('heading', { name: 'Alpha', exact: true })).toBeVisible()
  return { canvas, bounds }
}

async function expectWheelZoomHasNoWebGLError(page: Page) {
  const skip = page.getByRole('button', { name: '跳过 →' })
  if (await skip.isVisible()) await skip.click()
  const { canvas } = await openFirstStarPanel(page)
  const before = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().scene)
  const wheelResult = await canvas.evaluate(async (node: HTMLCanvasElement, beforeDistance: number) => {
    const rect = node.getBoundingClientRect()
    let prevented = 0
    for (let index = 0; index < 12; index += 1) {
      const accepted = node.dispatchEvent(new WheelEvent('wheel', {
        bubbles: true,
        cancelable: true,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        deltaY: -100,
        deltaMode: WheelEvent.DOM_DELTA_PIXEL,
      }))
      if (!accepted) prevented += 1
    }
    const cameraDistance = await new Promise<number>((resolve, reject) => {
      const deadline = performance.now() + 15_000
      const check = () => {
        const distance = window.__MINDVERSE_E2E__?.snapshot().scene.cameraDistance ?? beforeDistance
        if (distance < beforeDistance - 0.01) resolve(distance)
        else if (performance.now() >= deadline) reject(new Error('wheel events did not move the camera'))
        else requestAnimationFrame(check)
      }
      requestAnimationFrame(check)
    })
    return {
      prevented,
      cameraDistance,
      targetDistance: window.__MINDVERSE_E2E__!.snapshot().scene.targetDistance,
    }
  }, before.cameraDistance)
  expect(wheelResult.prevented).toBe(12)
  expect(wheelResult.targetDistance).toBeLessThan(before.targetDistance)
  expect(wheelResult.cameraDistance).toBeLessThan(before.cameraDistance)

  const result = await canvas.evaluate(async (node: HTMLCanvasElement) => {
    const gl = node.getContext('webgl2') ?? node.getContext('webgl')
    if (!gl) throw new Error('WebGL context unavailable during probe transition')
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    const transitionError = gl.getError()
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
    return { transitionError, settledError: gl.getError(), noError: gl.NO_ERROR }
  })
  expect(result.transitionError).toBe(result.noError)
  expect(result.settledError).toBe(result.noError)
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
  await expectWheelZoomHasNoWebGLError(page)
  expect(errors).toEqual([])
})

test('an article probe can be approached, controlled, scanned and closed accessibly', async ({ page }) => {
  const errors = collectRuntimeErrors(page)
  const fixture = await installUniverseFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openProductionUniverse(page)
  await expectRendererReady(page)
  const skip = page.getByRole('button', { name: '跳过 →' })
  if (await skip.isVisible()) await skip.click()
  const { canvas } = await openFirstStarPanel(page)

  const trigger = page.getByRole('button', { name: '检查探测器' }).first()
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: /检查探测器：/ })
  await expect(dialog).toHaveAttribute('aria-modal', 'true')
  await expect(page.locator('.uv-bar')).toHaveAttribute('inert', '')
  const inspectionTitle = page.getByRole('heading', { name: /检查探测器：/ })
  await expect(inspectionTitle).toBeFocused({ timeout: 5_000 })
  await expect(dialog).not.toContainText(/问题|回答|关联/)
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭探测器检查' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(dialog.getByRole('button', { name: '开始扫描' })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: '关闭探测器检查' })).toBeFocused()
  const inspectionBounds = await canvas.boundingBox()
  if (!inspectionBounds) throw new Error('inspection canvas has no layout bounds')
  await page.mouse.move(inspectionBounds.x + inspectionBounds.width * 0.25, inspectionBounds.y + inspectionBounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(inspectionBounds.x + inspectionBounds.width * 0.34, inspectionBounds.y + inspectionBounds.height * 0.42, { steps: 4 })
  await page.mouse.up()
  await page.getByRole('button', { name: '放大' }).click()
  await page.getByRole('button', { name: '向右平移' }).click()
  await page.getByRole('button', { name: '聚焦部件：天线' }).click()
  await expect.poll(async () => (await page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot().scene.probeNearVisible)) ?? false)
    .toBe(true)
  await page.getByRole('button', { name: '开始扫描' }).click()
  const article = page.getByRole('link', { name: '查看原文章' })
  await expect(article).toBeVisible({ timeout: 5_000 })
  const expectedUrl = fixture.generation.universe?.probes?.[0]?.url
  expect(expectedUrl).toBeTruthy()
  await expect(article).toHaveAttribute('href', expectedUrl!)
  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()

  const exitMemory: RenderSnapshot['memory'][] = [await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().memory)]
  for (let cycle = 1; cycle < 3; cycle += 1) {
    await trigger.click()
    await expect(dialog).toBeVisible()
    await expect.poll(async () => (await page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot().scene.probeNearVisible)) ?? false)
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    exitMemory.push(await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().memory))
  }
  expect(exitMemory[2].geometries).toBeLessThanOrEqual(exitMemory[0].geometries)
  expect(exitMemory[2].textures).toBeLessThanOrEqual(exitMemory[0].textures)
  expect(exitMemory.every((sample, index) => index === 0
    || (sample.geometries <= exitMemory[index - 1].geometries && sample.textures <= exitMemory[index - 1].textures))).toBe(true)
  process.stdout.write(`[memory] inspection exits ${JSON.stringify(exitMemory)}\n`)

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
  await page.route(/\/assets\/(?:Renderer|_virtual_mindverse-renderer)-[^/]+\.js$/, async (route) => {
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

for (const quality of ['high', 'low'] as const) {
  test(`diagnostic quality override reports ${quality} without exposing state mutation`, async ({ page }) => {
    const fixture = await installUniverseFixture(page)
    await openProductionUniverse(page, `?e2eQuality=${quality}`)
    await expectRendererReady(page)
    await expectCanvasContract(page, fixture)
    await expectSnapshot(page, quality)
    const apiShape = await page.evaluate(() => Object.keys(window.__MINDVERSE_E2E__ ?? {}))
    const rendererKind = await page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot().rendererKind)
    expect(apiShape).toEqual(rendererKind === 'babylon'
      ? ['preparePlanetCapture', 'flipFarPlanetCapture', 'setApproachProgress', 'snapshot']
      : ['snapshot'])
  })
}

function percentile95(samples: readonly number[]): number {
  if (samples.length === 0) throw new Error('performance sample is empty')
  const ordered = [...samples].sort((a, b) => a - b)
  return ordered[Math.ceil(ordered.length * 0.95) - 1]
}

for (const [quality, limit] of [['medium', 20], ['low', 33.3]] as const) {
  test(`${quality} keeps the fixed 512-planet/300-probe panorama lazy within its 30-second budget @metal-performance`, async ({ page }) => {
    test.skip(process.platform !== 'darwin', 'production performance budgets require Chromium ANGLE Metal on Darwin hardware')
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 1920, height: 1080 })
    const fixture = await installUniverseFixture(page)
    expect(fixture.assertions).toMatchObject({ questionCount: 512, probeCount: 300 })
    await openProductionUniverse(page, `?e2eQuality=${quality}`)
    await expectRendererReady(page)
    expect(await page.evaluate(() => window.devicePixelRatio)).toBe(1)
    await page.waitForTimeout(5_000)
    const warm = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())
    expect(warm.frames.lastTimestampMs).not.toBeNull()
    await expect.poll(async () => {
      const current = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().frames.lastTimestampMs)
      return current === null || warm.frames.lastTimestampMs === null ? 0 : current - warm.frames.lastTimestampMs
    }, { timeout: 35_000, intervals: [1_000] }).toBeGreaterThanOrEqual(30_000)
    const snapshot = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())
    expect(snapshot.quality).toBe(quality)
    expect(snapshot.scene).toMatchObject({ planetCount: 512, probeCount: 300 })
    expect(snapshot.resources).toMatchObject({
      materializedPlanetCount: 0,
      planetVisualConstructions: 0,
      planetShaderCompileRequests: 0,
      planetUpdatesLastFrame: 0,
    })
    expect(snapshot.frames.nextSequence).toBeGreaterThan(warm.frames.nextSequence)
    expect(snapshot.frames.firstSequence).toBeLessThanOrEqual(warm.frames.nextSequence)
    const windowDropped = Math.max(0, snapshot.frames.firstSequence - warm.frames.nextSequence)
    expect(windowDropped).toBe(0)
    const offset = warm.frames.nextSequence - snapshot.frames.firstSequence
    expect(offset).toBeGreaterThanOrEqual(0)
    const samples = snapshot.frameTimes.slice(offset)
    expect(samples).toHaveLength(snapshot.frames.nextSequence - warm.frames.nextSequence)
    expect(samples.length).toBeGreaterThan(30)
    expect(samples.length).toBeLessThanOrEqual(1_050)
    const coveredMs = snapshot.frames.lastTimestampMs! - warm.frames.lastTimestampMs!
    expect(coveredMs).toBeGreaterThanOrEqual(30_000)
    const p95 = percentile95(samples)
    const gpu = await gpuRenderer(page)
    process.stdout.write(`[performance] quality=${quality} samples=${samples.length} covered=${coveredMs.toFixed(1)}ms windowDropped=${windowDropped} totalDropped=${snapshot.frames.dropped} p95=${p95.toFixed(2)}ms limit=${limit}ms gpu=${gpu}\n`)
    expect(p95).toBeLessThanOrEqual(limit)
  })
}
