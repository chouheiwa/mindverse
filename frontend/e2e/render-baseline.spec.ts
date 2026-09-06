import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { classifyWebGlBackend } from '../src/starmap/e2eDiagnostics'
import { parseUniverse } from '../src/domain/universe'
import { planetWorldRadius } from '../src/starmap/gl/planetMaterials'
import { orbitRadiusFor } from '../src/starmap/orbitGeometry'
import { planetFocusDistance, THREE_VERTICAL_FOV } from '../src/starmap/babylon/framing'
import { projectedSphereDiameterPixels } from '../src/starmap/babylon/planetLod'
import { findRelativeBudgetViolations, type RenderCostByTier } from '../src/starmap/renderBudget'
import { createStrataUniverseFixture, installStrataFixture, strataUniverseFixture } from './helpers/strataFixtureRoute'
import {
  createPlanetRenderFixture,
  installPlanetRenderFixture,
  PLANET_FIXTURE_VERSION,
  PLANET_RENDER_CASES,
} from './helpers/planetFixtureRoute'

// 渲染开销是这个文件的被测量本身，不能和别的 Chromium 一起抢 GPU：并行 5 worker 时
// low 档实测在 11.8~12.4ms 之间跳，撞穿 11.64ms 的相对预算，红的是并发不是代码。
// （`capture:planet-candidate` 早就靠 `--workers=1` 表达了同一意图，这里把它落到配置里。）
test.describe.configure({ mode: 'serial' })

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 } as const
const STATE_NAMES = ['panorama', 'approach-midpoint', 'focused-star', 'planet-focus'] as const
/** 当前权威的 Babylon 恒星基线；capture:stellar-baseline 写的就是它。 */
const COMMITTED_STELLAR_BASELINE = 'testdata/render-baselines/babylon-stellar-v2.json'
type StateName = typeof STATE_NAMES[number]
type PlanetThermal = typeof PLANET_RENDER_CASES[number]['thermal']

test.use({ viewport: VIEWPORT, deviceScaleFactor: 1 })
test.setTimeout(120_000)

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())

test('dense fixture is a repeatable versioned 500-star universe without content payloads', () => {
  const first = createStrataUniverseFixture({ denseStars: true })
  const second = createStrataUniverseFixture({ denseStars: true })
  const universe = first.generation.universe
  if (!universe || universe.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
  expect(first.fixtureVersion).toBe('strata-universe.dense-500.v1')
  expect(first).toEqual(second)
  expect(universe.stars).toHaveLength(500)
  expect(new Set(universe.stars?.map(({ id }) => id)).size).toBe(500)
  expect(universe.stars?.every((star) => star.questionIds?.length === 0
    && star.probeIds?.length === 0
    && Number.isFinite(star.pe)
    && Number.isFinite(star.bu)
    && star.p.every(Number.isFinite))).toBe(true)
  expect(universe.questions).toEqual([])
  expect(universe.answers).toEqual([])
  expect(universe.probes).toEqual([])
  expect(() => parseUniverse(universe)).not.toThrow()
})

test('planet baseline output accepts a versioned baseline as well as a candidate', () => {
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  expect(resolvePlanetBaselineOutput(undefined)).toBeNull()
  // The npm script compares against babylon-planets-v1.json, so the capture must
  // be able to produce that file — refusing every non-candidate stem made the
  // referenced baseline impossible to create.
  for (const stem of ['babylon-planets-v1', 'babylon-planets-candidate']) {
    const output = resolvePlanetBaselineOutput(`testdata/render-baselines/${stem}.json`)
    if (!output) throw new Error('expected an explicit planet baseline output')
    expect(basename(output.images.magma)).toBe(`${stem}-magma.png`)
    expect(basename(output.images['far-flip'])).toBe(`${stem}-far-flip.png`)
    for (const path of Object.values(output.images)) {
      expect(relative(root, path).startsWith('..')).toBe(false)
    }
  }
  for (const invalid of ['../escape.json', 'testdata/render-baselines/no-extension', 'testdata/render-baselines/.json']) {
    expect(() => resolvePlanetBaselineOutput(invalid)).toThrow(/MINDVERSE_PLANET_BASELINE_OUT/)
  }
})

test('planet gate fixture deterministically pins five thermal cases without user snapshots', () => {
  const first = createPlanetRenderFixture()
  const second = createPlanetRenderFixture()
  const universe = first.generation.universe
  if (!universe || universe.schemaVersion !== 'universe.v1') throw new Error('expected current universe')
  expect(first.fixtureVersion).toBe(PLANET_FIXTURE_VERSION)
  expect(first).toEqual(second)
  expect(universe.meta.source).toBe('e2e-planet-render-gate-v1')
  expect(universe.stars?.[0]?.questionIds).toHaveLength(8)
  expect(PLANET_RENDER_CASES.map(({ thermal }) => thermal)).toEqual(['magma', 'desert', 'rock', 'tundra', 'ice'])
})

test('baseline and candidate outputs derive disjoint PNG paths from their JSON stems', () => {
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const baseline = resolveBaselineOutput(COMMITTED_STELLAR_BASELINE)
  const candidate = resolveBaselineOutput('testdata/render-baselines/babylon-stellar-candidate.json')
  if (!baseline || !candidate) throw new Error('expected explicit baseline outputs')
  const baselineImages = Object.values(baseline.images)
  const candidateImages = Object.values(candidate.images)

  expect(baselineImages.map((path) => basename(path))).toEqual(STATE_NAMES.map((name) => `babylon-stellar-v2-${name}.png`))
  expect(candidateImages.map((path) => basename(path))).toEqual(STATE_NAMES.map((name) => `babylon-stellar-candidate-${name}.png`))
  expect(baselineImages.some((path) => candidateImages.includes(path))).toBe(false)
  for (const path of [...baselineImages, ...candidateImages]) {
    expect(relative(root, path).startsWith('..')).toBe(false)
  }
})

async function expectReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page)).renderReady).toBe(true)
}

async function settleFrame(page: Page) {
  const before = (await snapshot(page)).resources.actualRenderCount
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => {
    requestAnimationFrame(() => resolveFrame())
  })))
  if (typeof before !== 'number') return
  // The Babylon runtime throttles idle frames to 30fps, so two animation frames
  // are not guaranteed to contain a scene render — and the diagnostics project
  // through a view matrix that only a render refreshes. Waiting on animation
  // frames alone let a camera change be measured against the previous pose.
  await expect.poll(
    async () => (await snapshot(page)).resources.actualRenderCount ?? Number.POSITIVE_INFINITY,
    { timeout: 10_000, intervals: [16] },
  ).toBeGreaterThanOrEqual(before + 2)
}

async function isolateCanvasCapture(page: Page) {
  await canvas(page).evaluate((target) => {
    const root = target.parentElement
    if (!root) throw new Error('render canvas has no capture root')
    for (const sibling of [...root.children]) {
      if (sibling !== target) sibling.remove()
    }
  })
  await settleFrame(page)
}

async function readPngPixelMetrics(page: Page, png: Buffer) {
  return page.evaluate(async (base64): Promise<{
    nonBackgroundRatio: number
    luminanceVariance: number
    clippedWhiteRatio: number
  }> => {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const decoded = document.createElement('canvas')
    decoded.width = bitmap.width
    decoded.height = bitmap.height
    const context = decoded.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('PNG metric decoder unavailable')
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = context.getImageData(0, 0, decoded.width, decoded.height).data
    let nonBackground = 0
    let clippedWhite = 0
    let luminanceSum = 0
    let luminanceSquaredSum = 0
    const pixelCount = pixels.length / 4
    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]! / 255
      const green = pixels[index + 1]! / 255
      const blue = pixels[index + 2]! / 255
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
      if (Math.max(red, green, blue) > 12 / 255) nonBackground += 1
      if (red >= 250 / 255 && green >= 250 / 255 && blue >= 250 / 255) clippedWhite += 1
      luminanceSum += luminance
      luminanceSquaredSum += luminance * luminance
    }
    const mean = luminanceSum / pixelCount
    return {
      nonBackgroundRatio: nonBackground / pixelCount,
      luminanceVariance: Math.max(0, luminanceSquaredSum / pixelCount - mean * mean),
      clippedWhiteRatio: clippedWhite / pixelCount,
    }
  }, png.toString('base64'))
}

async function readPlanetPixelMetrics(
  page: Page,
  png: Buffer,
  bounds: { x: number; y: number; width: number; height: number },
  lightPoint: { x: number; y: number },
) {
  return page.evaluate(async ({ base64, bounds, lightPoint }) => {
    const binary = atob(base64)
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }))
    const decoded = document.createElement('canvas')
    decoded.width = bitmap.width
    decoded.height = bitmap.height
    const context = decoded.getContext('2d', { willReadFrequently: true })!
    context.drawImage(bitmap, 0, 0)
    bitmap.close()
    const pixels = context.getImageData(0, 0, decoded.width, decoded.height).data
    const centerX = bounds.x + bounds.width / 2
    const centerY = bounds.y + bounds.height / 2
    const radius = Math.max(1, Math.min(bounds.width, bounds.height) / 2)
    const lightLength = Math.max(1e-6, Math.hypot(lightPoint.x - centerX, lightPoint.y - centerY))
    const lightX = (lightPoint.x - centerX) / lightLength
    const lightY = (lightPoint.y - centerY) / lightLength
    let day = 0; let dayCount = 0; let night = 0; let nightCount = 0
    let edgeLuminance = 0; let edgeCount = 0; let outerLuminance = 0; let outerCount = 0; let bloom = 0; let bodyCount = 0
    let redSum = 0; let greenSum = 0; let blueSum = 0; let colorSquareSum = 0; let gradient = 0
    const startX = Math.max(1, Math.floor(centerX - radius * 1.2))
    const endX = Math.min(decoded.width - 2, Math.ceil(centerX + radius * 1.2))
    const startY = Math.max(1, Math.floor(centerY - radius * 1.2))
    const endY = Math.min(decoded.height - 2, Math.ceil(centerY + radius * 1.2))
    for (let y = startY; y <= endY; y += 1) for (let x = startX; x <= endX; x += 1) {
      const dx = (x - centerX) / radius
      const dy = (y - centerY) / radius
      const radial = Math.hypot(dx, dy)
      const index = (y * decoded.width + x) * 4
      const red = pixels[index]! / 255
      const green = pixels[index + 1]! / 255
      const blue = pixels[index + 2]! / 255
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722
      if (radial <= 0.92) {
        bodyCount += 1
        if (dx * lightX + dy * lightY >= 0) { day += luminance; dayCount += 1 } else { night += luminance; nightCount += 1 }
        if (Math.max(red, green, blue) >= 0.92) bloom += 1
        redSum += red; greenSum += green; blueSum += blue
        colorSquareSum += (red * red + green * green + blue * blue) / 3
        const next = index + 4
        const nextLum = pixels[next]! / 255 * 0.2126 + pixels[next + 1]! / 255 * 0.7152 + pixels[next + 2]! / 255 * 0.0722
        gradient += Math.abs(nextLum - luminance)
      } else if (radial >= 1 && radial <= 1.14) {
        edgeCount += 1
        edgeLuminance += luminance
      } else if (radial >= 1.16 && radial <= 1.2) {
        outerCount += 1
        outerLuminance += luminance
      }
    }
    const meanColor = [redSum / bodyCount, greenSum / bodyCount, blueSum / bodyCount]
    const colorMean = (meanColor[0] + meanColor[1] + meanColor[2]) / 3
    return {
      bodyDiameter: Math.min(bounds.width, bounds.height),
      dayNightContrast: Math.abs(day / dayCount - night / nightCount),
      lightAlignment: day / dayCount - night / nightCount,
      atmosphereEdgeRatio: Math.min(1, Math.abs(edgeLuminance / edgeCount - outerLuminance / outerCount) * 2),
      bloomHighlightRatio: bloom / bodyCount,
      colorVariance: Math.max(0, colorSquareSum / bodyCount - colorMean * colorMean),
      meanColor,
      roughnessContrast: gradient / bodyCount,
    }
  }, { base64: png.toString('base64'), bounds, lightPoint })
}

async function captureState(page: Page, name: StateName) {
  await settleFrame(page)
  const state = await snapshot(page)
  const projected = state.stellar.projectedStars.find(({ starKey }) => starKey === state.stellar.focusedStarKey)
    ?? state.stellar.projectedStars[0]
  if (!projected) throw new Error(`${name}: no projected stellar bounds`)
  const png = await canvas(page).screenshot()
  return {
    metrics: {
      corePixelDiameter: Math.max(projected.core.width, projected.core.height),
      haloPixelDiameter: Math.max(projected.halo.width, projected.halo.height),
      ...await readPngPixelMetrics(page, png),
      camera: {
        distance: state.scene.cameraDistance,
        alpha: state.scene.cameraAlpha,
        beta: state.scene.cameraBeta,
        target: [state.scene.cameraTargetX, state.scene.cameraTargetY, state.scene.cameraTargetZ],
      },
      presentation: {
        focusedStarKey: state.stellar.focusedStarKey,
        approachProgress: state.stellar.approachProgress,
        systemReveal: state.stellar.systemReveal,
        visibleQuestionOrbits: state.stellar.visibleQuestionOrbits,
        visibleQuestionPlanets: state.stellar.visibleQuestionPlanets,
        shaderFallback: state.stellar.shaderFallback,
      },
    },
    png,
  }
}

async function hardwareMetadata(page: Page) {
  const raw = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      platform: navigator.platform,
      userAgent: navigator.userAgent,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null,
      gpuVendor: gl && extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
      gpuRenderer: gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
    }
  })
  return { ...raw, graphicsBackend: classifyWebGlBackend(raw.gpuRenderer, raw.gpuVendor) }
}

async function measureDensePerformance(page: Page, quality: 'medium' | 'low', enforceAbsoluteBudgets: boolean) {
  await page.unroute('**/api/universe')
  const fixture = await installStrataFixture(page, { denseStars: true })
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await page.goto(`/universe.html?e2eQuality=${quality}`)
  await expectReady(page)
  await expect.poll(async () => (await snapshot(page)).quality).toBe(quality)
  await page.waitForTimeout(3_000) // Required fixed performance warm-up window.
  const warm = await snapshot(page)
  await page.waitForTimeout(10_000) // Required fixed performance sampling window.
  const final = await snapshot(page)
  const offset = Math.max(0, warm.frames.nextSequence - final.frames.firstSequence)
  const samples = final.frameTimes.slice(offset)
  const sorted = [...samples].sort((left, right) => left - right)
  const p95FrameTime = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? Number.POSITIVE_INFINITY
  const absoluteBudgetMs = quality === 'medium' ? 20 : 33.3
  expect(samples.length).toBeGreaterThan(0)
  const hardware = await hardwareMetadata(page)
  if (enforceAbsoluteBudgets && hardware.graphicsBackend !== 'metal') {
    throw new Error(`reference device requires measured Metal; got ${hardware.graphicsBackend}`)
  }
  const renderCostMs = final.resources.renderCostMs ?? null
  const maxRenderCostMs = final.resources.maxRenderCostMs ?? null
  // 绝对预算约束的是渲染开销，不是调度间隔。p95FrameTime 被 30fps 空闲节流
  // 钉在 33–43ms，与这一屏画了多少东西无关 —— 拿它比 20ms 的 medium 预算，
  // 门禁在任何机器上都必红，等于从来没有被执行过。
  if (enforceAbsoluteBudgets) {
    expect(maxRenderCostMs, 'reference device must report a measured render cost').not.toBeNull()
    expect(maxRenderCostMs!).toBeLessThanOrEqual(absoluteBudgetMs)
  }
  return {
    fixtureVersion: fixture.fixtureVersion,
    starCount: final.stellar.starCount,
    p95FrameTime,
    // p95FrameTime is the scheduling interval, which the deliberate 30fps idle
    // throttle pins near 33ms whatever the scene costs. This is the work itself.
    renderCostMs,
    maxRenderCostMs,
    absoluteBudgetMs,
    sampleCount: samples.length,
    warmupMs: 3_000,
    sampleWindowMs: 10_000,
    hardware,
  }
}

test('captures four deterministic stellar states and gates dense performance @metal-performance', async ({ page }, testInfo) => {
  const referenceRequested = process.env.MINDVERSE_REFERENCE_DEVICE === '1'
  if (referenceRequested && (process.platform !== 'darwin' || testInfo.project.name !== 'metal-performance')) {
    throw new Error('MINDVERSE_REFERENCE_DEVICE=1 requires the macOS metal-performance project')
  }
  await installStrataFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/universe.html?e2eQuality=medium')
  await expectReady(page)
  const measuredHardware = await hardwareMetadata(page)
  if (referenceRequested && measuredHardware.graphicsBackend !== 'metal') {
    throw new Error(`MINDVERSE_REFERENCE_DEVICE=1 requires measured Metal; got ${measuredHardware.graphicsBackend}`)
  }
  const referenceDevice = {
    enforceAbsoluteBudgets: referenceRequested,
    platform: process.platform,
    graphicsBackend: measuredHardware.graphicsBackend,
  }

  const states = {} as Record<StateName, Awaited<ReturnType<typeof captureState>>>
  states.panorama = await captureState(page, 'panorama')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  await expect.poll(async () => {
    const state = await snapshot(page)
    if (state.stellar.focusedStarKey) return true
    const target = state.stellar.projectedStars[0]
    if (!target) return false
    await canvas(page).click({
      position: { x: target.halo.x + target.halo.width / 2, y: target.halo.y + target.halo.height / 2 },
      force: true,
    })
    return (await snapshot(page)).stellar.focusedStarKey !== null
  }).toBe(true)
  await expect.poll(async () => page.evaluate(() => window.__MINDVERSE_E2E__!.setApproachProgress(0.65)))
    .toBe(true)
  const frozenBefore = await snapshot(page)
  expect(frozenBefore.stellar.approachProgress).toBeCloseTo(0.65, 8)
  states['approach-midpoint'] = await captureState(page, 'approach-midpoint')
  const frozenAfter = await snapshot(page)
  expect(frozenAfter.stellar.approachProgress).toBeCloseTo(0.65, 8)
  expect(frozenAfter.scene.cameraDistance).toBeCloseTo(frozenBefore.scene.cameraDistance, 8)
  expect(frozenAfter.scene.cameraTargetX).toBeCloseTo(frozenBefore.scene.cameraTargetX!, 8)
  expect(frozenAfter.scene.cameraTargetY).toBeCloseTo(frozenBefore.scene.cameraTargetY!, 8)
  expect(frozenAfter.scene.cameraTargetZ).toBeCloseTo(frozenBefore.scene.cameraTargetZ!, 8)
  expect(await page.evaluate(() => window.__MINDVERSE_E2E__!.setApproachProgress(null))).toBe(true)
  await expect.poll(async () => (await snapshot(page)).stellar.approachProgress).toBe(1)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  states['focused-star'] = await captureState(page, 'focused-star')
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await snapshot(page)).projectedBounds.selectedPlanet).not.toBeNull()
  states['planet-focus'] = await captureState(page, 'planet-focus')

  const performance = {
    medium: await measureDensePerformance(page, 'medium', referenceDevice.enforceAbsoluteBudgets),
    low: await measureDensePerformance(page, 'low', referenceDevice.enforceAbsoluteBudgets),
  }
  expect(performance.medium.starCount).toBe(500)
  expect(performance.low.starCount).toBe(500)

  const metrics = {
    schemaVersion: 'babylon-stellar-baseline.v1',
    fixtureVersion: strataUniverseFixture.fixtureVersion,
    rendererKind: 'babylon',
    viewport: VIEWPORT,
    referenceDevice,
    states: Object.fromEntries(STATE_NAMES.map((name) => [name, states[name].metrics])),
    performance,
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  }
  await assertRelativePerformance(metrics)
  await writeOrAttachBaseline(metrics, states, testInfo)
})

test('captures five deterministic thermal planets and a stable far LOD candidate @metal-performance', async ({ page }, testInfo) => {
  await installPlanetRenderFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const captures = {} as Record<PlanetThermal, { metrics: Awaited<ReturnType<typeof readPlanetPixelMetrics>>; png: Buffer }>

  for (const renderCase of PLANET_RENDER_CASES) {
    await page.goto('/universe.html?e2eQuality=high')
    await expectReady(page)
    await focusFirstStar(page)
    await page.getByRole('button', { name: new RegExp(renderCase.title) }).click()
    await expect.poll(async () => (await snapshot(page)).planet.selectedQuestionId).toBe(renderCase.questionId)
    await expect.poll(async () => (await snapshot(page)).planet.surfaceLevel).toBe('high')
    await expect.poll(async () => (await snapshot(page)).planet.highFrequencyDetail).toBe(true)
    expect(await page.evaluate(() => window.__MINDVERSE_E2E__!.preparePlanetCapture())).toBe(true)
    await settleFrame(page)
    const state = await snapshot(page)
    expect(state.planet.thermalDominant).toBe(renderCase.thermal)
    expect(state.planet.atmosphereFallback).toBe(false)
    const bounds = state.projectedBounds.selectedPlanet
    const star = state.stellar.projectedStars.find(({ starKey }) => starKey === state.stellar.focusedStarKey)
    if (!bounds || !star) throw new Error(`${renderCase.thermal}: missing projected planet or star`)
    await isolateCanvasCapture(page)
    const png = await canvas(page).screenshot()
    const metrics = await readPlanetPixelMetrics(page, png, bounds, {
      x: star.core.x + star.core.width / 2,
      y: star.core.y + star.core.height / 2,
    })
    // 门禁不再是一个「够大就行」的地板，而是投影数学算出的预期值。
    //
    //   r = planetWorldRadius(answerDensity)，本 fixture 每颗行星 0 个回答 → 0.085
    //   d = planetFocusDistance(orbitRadiusFor(orbitIndex - 1))
    //   直径像素 = tan(asin(r/d)) · H / tan(fov/2)
    //
    // 校准：把 Three 的 planet-focus 参数（r = 0.1734、d = 2.8、H = 720）代进去
    // 得 77.2 px，与 three-parity-v1 实拍主体宽度 77 px 吻合 —— 这条式子是对的。
    // 于是本门禁改成「实测直径落在预期的 [0.85, 1.4] 倍之内」：既抓得住取景回归，
    // 也抓得住行星半径被改大改小，比任何一个固定像素地板都严。
    // 上界留到 1.4 是因为 bodyDiameter 量的是含大气壳（半径 ×1.095 起）的包围盒。
    const expectedDiameter = projectedSphereDiameterPixels(
      planetWorldRadius(0),
      planetFocusDistance(orbitRadiusFor(renderCase.orbitIndex - 1)),
      THREE_VERTICAL_FOV,
      VIEWPORT.width,
      VIEWPORT.height,
    )
    expect(
      metrics.bodyDiameter,
      `${renderCase.thermal}: expected ~${expectedDiameter.toFixed(1)}px, measured ${metrics.bodyDiameter}px`,
    ).toBeGreaterThanOrEqual(expectedDiameter * 0.85)
    expect(metrics.bodyDiameter).toBeLessThanOrEqual(expectedDiameter * 1.4)
    expect(metrics.dayNightContrast).toBeGreaterThanOrEqual(0.06)
    expect(metrics.atmosphereEdgeRatio, `${renderCase.thermal} bounds=${JSON.stringify(bounds)} metrics=${JSON.stringify(metrics)}`)
      .toBeGreaterThanOrEqual(0.005)
    expect(metrics.atmosphereEdgeRatio).toBeLessThanOrEqual(0.35)
    expect(metrics.bloomHighlightRatio).toBeLessThanOrEqual(renderCase.thermal === 'magma' ? 0.12 : 0.04)
    expect(metrics.colorVariance).toBeGreaterThanOrEqual(0.001)
    captures[renderCase.thermal] = { metrics, png }
  }

  const materials = PLANET_RENDER_CASES.map(({ thermal }) => captures[thermal].metrics)
  for (let left = 0; left < materials.length; left += 1) for (let right = left + 1; right < materials.length; right += 1) {
    const colorDistance = Math.hypot(...materials[left].meanColor.map((value, index) => value - materials[right].meanColor[index]!))
    expect(colorDistance,
      `${PLANET_RENDER_CASES[left].thermal}/${PLANET_RENDER_CASES[right].thermal} mean colors ${materials[left].meanColor.join(',')} / ${materials[right].meanColor.join(',')}`,
    ).toBeGreaterThan(0.015)
  }

  await page.goto('/universe.html?e2eQuality=low')
  await expectReady(page)
  await focusFirstStar(page)
  const farAState = await snapshot(page)
  const farVisual = farAState.planet.visible.find(({ questionId }) => questionId === 'question:103')
  const star = farAState.stellar.projectedStars.find(({ starKey }) => starKey === farAState.stellar.focusedStarKey)
  if (!farVisual?.bounds || !star) throw new Error('far ice sample is not projected')
  await isolateCanvasCapture(page)
  const farA = await canvas(page).screenshot()
  const farAMetrics = await readPlanetPixelMetrics(page, farA, farVisual.bounds, {
    x: star.core.x + star.core.width / 2,
    y: star.core.y + star.core.height / 2,
  })
  await settleFrame(page)
  const farBState = await snapshot(page)
  const farBVisual = farBState.planet.visible.find(({ questionId }) => questionId === 'question:103')
  if (!farBVisual?.bounds) throw new Error('second far ice sample is not projected')
  const farB = await canvas(page).screenshot()
  const silhouetteDrift = Math.max(
    Math.abs(farVisual.bounds.width - farBVisual.bounds.width), Math.abs(farVisual.bounds.height - farBVisual.bounds.height),
  ) / Math.max(1, farVisual.bounds.width, farVisual.bounds.height)
  expect(await page.evaluate(() => window.__MINDVERSE_E2E__!.flipFarPlanetCapture())).toBe(true)
  await settleFrame(page)
  const farFlipState = await snapshot(page)
  const farFlipVisual = farFlipState.planet.visible.find(({ questionId }) => questionId === 'question:103')
  const farFlipStar = farFlipState.stellar.projectedStars.find(({ starKey }) => starKey === farFlipState.stellar.focusedStarKey)
  if (!farFlipVisual?.bounds || !farFlipStar) throw new Error('flipped far ice sample is not projected')
  const farFlip = await canvas(page).screenshot()
  const farFlipMetrics = await readPlanetPixelMetrics(page, farFlip, farFlipVisual.bounds, {
    x: farFlipStar.core.x + farFlipStar.core.width / 2,
    y: farFlipStar.core.y + farFlipStar.core.height / 2,
  })
  const lightA = projectedDirection(star.core, farVisual.bounds)
  const lightFlip = projectedDirection(farFlipStar.core, farFlipVisual.bounds)
  const lightDirectionFlip = lightA.x * lightFlip.x + lightA.y * lightFlip.y
  expect(farVisual.surfaceLevel).toBe('low')
  expect(farVisual.thermalDominant).toBe('rock')
  expect(farVisual.highFrequencyDetail).toBe(false)
  expect(farAState.resources.highPlanetCount).toBe(0)
  expect(silhouetteDrift).toBeLessThanOrEqual(0.02)
  expect(farAMetrics.lightAlignment).toBeGreaterThan(0.01)
  expect(farFlipMetrics.lightAlignment).toBeGreaterThan(0.01)
  expect(lightDirectionFlip).toBeLessThan(-0.5)

  const metrics = {
    schemaVersion: 'babylon-planets-baseline.v1',
    fixtureVersion: PLANET_FIXTURE_VERSION,
    rendererKind: 'babylon',
    viewport: VIEWPORT,
    samples: Object.fromEntries(PLANET_RENDER_CASES.map(({ thermal }) => [thermal, { thermal, ...captures[thermal].metrics }])),
    far: {
      thermal: farVisual.thermalDominant,
      surfaceLevel: farVisual.surfaceLevel,
      highPlanetCount: farAState.resources.highPlanetCount,
      highFrequencyDetail: farVisual.highFrequencyDetail,
      silhouetteDrift,
      lightAlignment: Math.min(farAMetrics.lightAlignment, farFlipMetrics.lightAlignment),
      lightDirectionFlip,
    },
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  }
  await writeOrAttachPlanetCandidate(metrics, captures, { farA, farB, farFlip }, testInfo)
})

async function focusFirstStar(page: Page) {
  await expect.poll(async () => (await snapshot(page)).stellar.projectedStars[0] ?? null).not.toBeNull()
  const target = (await snapshot(page)).stellar.projectedStars[0]!
  await canvas(page).click({
    position: { x: target.halo.x + target.halo.width / 2, y: target.halo.y + target.halo.height / 2 },
    force: true,
  })
  await expect.poll(async () => (await snapshot(page)).stellar.approachProgress).toBe(1)
}

function projectedDirection(
  star: { x: number; y: number; width: number; height: number },
  planet: { x: number; y: number; width: number; height: number },
) {
  const x = star.x + star.width / 2 - planet.x - planet.width / 2
  const y = star.y + star.height / 2 - planet.y - planet.height / 2
  const length = Math.max(1e-6, Math.hypot(x, y))
  return { x: x / length, y: y / length }
}

async function writeOrAttachPlanetCandidate(
  metrics: object,
  captures: Record<PlanetThermal, { png: Buffer }>,
  far: { farA: Buffer; farB: Buffer; farFlip: Buffer },
  testInfo: TestInfo,
) {
  const output = resolvePlanetBaselineOutput(process.env.MINDVERSE_PLANET_BASELINE_OUT)
  if (output) {
    await mkdir(dirname(output.json), { recursive: true })
    await writeFile(output.json, JSON.stringify(metrics, null, 2) + '\n')
    for (const { thermal } of PLANET_RENDER_CASES) await writeFile(output.images[thermal], captures[thermal].png)
    await writeFile(output.images['far-a'], far.farA)
    await writeFile(output.images['far-b'], far.farB)
    await writeFile(output.images['far-flip'], far.farFlip)
    return
  }
  await testInfo.attach('babylon-planets-candidate.json', { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
  for (const { thermal } of PLANET_RENDER_CASES) {
    await testInfo.attach(`babylon-planets-candidate-${thermal}.png`, { body: captures[thermal].png, contentType: 'image/png' })
  }
  await testInfo.attach('babylon-planets-candidate-far-a.png', { body: far.farA, contentType: 'image/png' })
  await testInfo.attach('babylon-planets-candidate-far-b.png', { body: far.farB, contentType: 'image/png' })
  await testInfo.attach('babylon-planets-candidate-far-flip.png', { body: far.farFlip, contentType: 'image/png' })
}

async function assertRelativePerformance(metrics: { performance: RenderCostByTier }) {
  if (process.env.MINDVERSE_UPDATE_BASELINES === '1') return
  const committedPath = resolve(process.cwd(), COMMITTED_STELLAR_BASELINE)
  if (!existsSync(committedPath)) throw new Error('committed Babylon stellar baseline is missing')
  const committed = JSON.parse(await readFile(committedPath, 'utf8'))
  // 比的是每帧真正干了多少活。p95FrameTime 被 30fps 空闲节流钉死，拿它比等于不比。
  const violations = findRelativeBudgetViolations(metrics.performance, committed.performance ?? {})
  expect(violations.map(({ quality, measuredMs, baselineMs, allowedMs }) =>
    `${quality} render cost ${measuredMs.toFixed(2)}ms exceeds ${allowedMs.toFixed(2)}ms (baseline ${baselineMs.toFixed(2)}ms)`,
  )).toEqual([])
}

async function writeOrAttachBaseline(
  metrics: object,
  states: Record<StateName, { png: Buffer }>,
  testInfo: TestInfo,
) {
  const output = resolveBaselineOutput(process.env.MINDVERSE_BASELINE_OUT)
  if (output) {
    await mkdir(dirname(output.json), { recursive: true })
    await writeFile(output.json, JSON.stringify(metrics, null, 2) + '\n')
    for (const name of STATE_NAMES) await writeFile(output.images[name], states[name].png)
    return
  }
  await testInfo.attach('babylon-stellar-metrics.json', {
    body: JSON.stringify(metrics, null, 2), contentType: 'application/json',
  })
  for (const name of STATE_NAMES) {
    await testInfo.attach(`babylon-${name}.png`, { body: states[name].png, contentType: 'image/png' })
  }
}

const PLANET_IMAGE_NAMES = [
  ...PLANET_RENDER_CASES.map(({ thermal }) => thermal), 'far-a', 'far-b', 'far-flip',
] as const

/**
 * Resolves where a planet capture writes. Any stem inside the baseline directory
 * is allowed: `compare:planet-baselines` reads `babylon-planets-v1.json`, so a
 * candidate-only rule made the very file that gate depends on impossible to
 * produce through the supported capture path.
 */
export function resolvePlanetBaselineOutput(
  value: string | undefined,
): { json: string, images: Record<typeof PLANET_IMAGE_NAMES[number], string> } | null {
  if (!value) return null
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const json = resolve(process.cwd(), value)
  const pathFromRoot = relative(root, json)
  if (extname(json) !== '.json' || pathFromRoot.startsWith('..') || pathFromRoot === '' || basename(json) === '.json') {
    throw new Error('MINDVERSE_PLANET_BASELINE_OUT must be a .json file inside testdata/render-baselines')
  }
  const stem = basename(json, '.json')
  const directory = dirname(json)
  return {
    json,
    images: Object.fromEntries(
      PLANET_IMAGE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]),
    ) as Record<typeof PLANET_IMAGE_NAMES[number], string>,
  }
}

export function resolveBaselineOutput(value: string | undefined): {
  json: string
  directory: string
  images: Record<StateName, string>
} | null {
  if (!value) return null
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const json = resolve(process.cwd(), value)
  const pathFromRoot = relative(root, json)
  if (extname(json) !== '.json' || pathFromRoot.startsWith('..') || pathFromRoot === '' || basename(json) === '.json') {
    throw new Error('MINDVERSE_BASELINE_OUT must be a .json file inside testdata/render-baselines')
  }
  const directory = dirname(json)
  const stem = basename(json, '.json')
  const images = Object.fromEntries(
    STATE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]),
  ) as Record<StateName, string>
  return { json, directory, images }
}
