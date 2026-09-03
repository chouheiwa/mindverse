import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { createStrataUniverseFixture, installStrataFixture, strataUniverseFixture } from './helpers/strataFixtureRoute'

const VIEWPORT = { width: 1440, height: 900, deviceScaleFactor: 1 } as const
const STATE_NAMES = ['panorama', 'approach-midpoint', 'focused-star', 'planet-focus'] as const
type StateName = typeof STATE_NAMES[number]

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
})

test('baseline and candidate outputs derive disjoint PNG paths from their JSON stems', () => {
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const baseline = resolveBaselineOutput('testdata/render-baselines/babylon-stellar-v1.json')
  const candidate = resolveBaselineOutput('testdata/render-baselines/babylon-stellar-candidate.json')
  if (!baseline || !candidate) throw new Error('expected explicit baseline outputs')
  const baselineImages = Object.values(baseline.images)
  const candidateImages = Object.values(candidate.images)

  expect(baselineImages.map((path) => basename(path))).toEqual(STATE_NAMES.map((name) => `babylon-stellar-v1-${name}.png`))
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
  await page.evaluate(() => new Promise<void>((resolveFrame) => requestAnimationFrame(() => {
    requestAnimationFrame(() => resolveFrame())
  })))
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
  return page.evaluate(() => {
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
  if (enforceAbsoluteBudgets) expect(p95FrameTime).toBeLessThanOrEqual(absoluteBudgetMs)
  return {
    fixtureVersion: fixture.fixtureVersion,
    starCount: final.stellar.starCount,
    p95FrameTime,
    absoluteBudgetMs,
    sampleCount: samples.length,
    warmupMs: 3_000,
    sampleWindowMs: 10_000,
    hardware: await hardwareMetadata(page),
  }
}

test('captures four deterministic stellar states and gates dense performance @metal-performance', async ({ page }, testInfo) => {
  const referenceDevice = {
    enforceAbsoluteBudgets: process.env.MINDVERSE_REFERENCE_DEVICE === '1'
      && process.platform === 'darwin'
      && testInfo.project.name === 'metal-performance',
    platform: process.platform,
    graphicsBackend: process.platform === 'darwin' && testInfo.project.name === 'metal-performance'
      ? 'metal' : 'swiftshader',
  }
  if (process.env.MINDVERSE_REFERENCE_DEVICE === '1' && !referenceDevice.enforceAbsoluteBudgets) {
    throw new Error('MINDVERSE_REFERENCE_DEVICE=1 requires the macOS metal-performance project')
  }
  await installStrataFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/universe.html?e2eQuality=medium')
  await expectReady(page)

  const states = {} as Record<StateName, Awaited<ReturnType<typeof captureState>>>
  states.panorama = await captureState(page, 'panorama')
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  const target = (await snapshot(page)).stellar.projectedStars[0]!
  await canvas(page).click({
    position: { x: target.halo.x + target.halo.width / 2, y: target.halo.y + target.halo.height / 2 },
    force: true,
  })
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

async function assertRelativePerformance(metrics: {
  performance: Record<'medium' | 'low', { p95FrameTime: number }>
}) {
  if (process.env.MINDVERSE_UPDATE_BASELINES === '1') return
  const committedPath = resolve(process.cwd(), 'testdata/render-baselines/babylon-stellar-v1.json')
  if (!existsSync(committedPath)) throw new Error('committed Babylon stellar baseline is missing')
  const committed = JSON.parse(await readFile(committedPath, 'utf8'))
  for (const quality of ['medium', 'low'] as const) {
    const reference = committed.performance?.[quality]?.p95FrameTime
    if (!Number.isFinite(reference)) throw new Error(`committed ${quality} p95 baseline is missing`)
    expect(metrics.performance[quality].p95FrameTime).toBeLessThanOrEqual(reference * 1.2)
  }
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
  await testInfo.attach('babylon-stellar-v1.json', {
    body: JSON.stringify(metrics, null, 2), contentType: 'application/json',
  })
  for (const name of STATE_NAMES) {
    await testInfo.attach(`babylon-${name}.png`, { body: states[name].png, contentType: 'image/png' })
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
