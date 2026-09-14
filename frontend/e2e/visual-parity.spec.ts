import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { installStrataFixture, strataUniverseFixture } from './helpers/strataFixtureRoute'

// Cross-renderer visual parity capture.
//
// This spec is deliberately renderer-agnostic: it drives the product exactly as
// a visitor would (click a star on the canvas, then open a question planet) and
// reads only diagnostics both renderers publish. Run it once per engine and the
// two documents it writes can be compared pixel-for-pixel by
// `scripts/compare-render-baselines.mjs`.
//
// Reduced motion is forced so both engines settle into a static frame: Three
// pins its animation clock to zero and Babylon stops advancing `elapsedMs`, so
// the only remaining variation between two runs is GPU dithering — which the
// comparator's tolerances are sized to absorb.

const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 } as const
const PARITY_STATE_NAMES = ['panorama', 'focused-star', 'planet-focus'] as const
type ParityStateName = typeof PARITY_STATE_NAMES[number]

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: 1 })
test.setTimeout(120_000)

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())

interface CapturedState {
  readonly captured: true
  readonly cameraDistance: number
  readonly selectedPlanetBounds: { x: number, y: number, width: number, height: number } | null
  /** Scene inventory, so a layer restoration can be costed rather than guessed at. */
  readonly meshes: number
  readonly textures: number
}

export function resolveParityOutput(value: string | undefined): { json: string, images: Record<ParityStateName, string> } | null {
  if (!value) return null
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const json = resolve(process.cwd(), value)
  const pathFromRoot = relative(root, json)
  if (extname(json) !== '.json' || pathFromRoot.startsWith('..') || pathFromRoot === '' || basename(json) === '.json') {
    throw new Error('MINDVERSE_PARITY_OUT must be a .json file inside testdata/render-baselines')
  }
  const stem = basename(json, '.json')
  const directory = dirname(json)
  return {
    json,
    images: Object.fromEntries(
      PARITY_STATE_NAMES.map((name) => [name, resolve(directory, `${stem}-${name}.png`)]),
    ) as Record<ParityStateName, string>,
  }
}

async function expectReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page)).renderReady).toBe(true)
}

/** Waits until the camera stops easing, so neither engine is captured mid-flight. */
async function settleScene(page: Page) {
  let previous: number | null = null
  await expect.poll(async () => {
    const { scene } = await snapshot(page)
    const settled = previous !== null
      && Math.abs(scene.cameraDistance - previous) <= Math.max(1e-3, Math.abs(scene.cameraDistance) * 0.001)
    previous = scene.cameraDistance
    return settled
  }, { timeout: 30_000, intervals: [150] }).toBe(true)
  await page.waitForTimeout(400) // Let the final eased frame reach the front buffer.
}

async function captureState(page: Page, name: ParityStateName) {
  await settleScene(page)
  const state = await snapshot(page)
  const png = await canvas(page).screenshot()
  if (png.length === 0) throw new Error(`${name}: canvas screenshot is empty`)
  return {
    png,
    metadata: {
      captured: true,
      cameraDistance: state.scene.cameraDistance,
      selectedPlanetBounds: state.projectedBounds.selectedPlanet,
      meshes: state.memory.geometries,
      textures: state.memory.textures,
    } satisfies CapturedState,
  }
}

async function writeOrAttachParity(
  document: object,
  states: Record<ParityStateName, { png: Buffer }>,
  testInfo: TestInfo,
) {
  const output = resolveParityOutput(process.env.MINDVERSE_PARITY_OUT)
  if (output) {
    await mkdir(dirname(output.json), { recursive: true })
    await writeFile(output.json, JSON.stringify(document, null, 2) + '\n')
    for (const name of PARITY_STATE_NAMES) await writeFile(output.images[name], states[name].png)
    return
  }
  const stem = (document as { rendererKind: string }).rendererKind
  await testInfo.attach(`${stem}-parity.json`, {
    body: JSON.stringify(document, null, 2), contentType: 'application/json',
  })
  for (const name of PARITY_STATE_NAMES) {
    await testInfo.attach(`${stem}-parity-${name}.png`, { body: states[name].png, contentType: 'image/png' })
  }
}

test('derives one PNG path per parity state inside the baseline directory', () => {
  expect(resolveParityOutput(undefined)).toBeNull()
  const output = resolveParityOutput('testdata/render-baselines/three-parity-v1.json')!
  expect(basename(output.images.panorama)).toBe('three-parity-v1-panorama.png')
  expect(basename(output.images['planet-focus'])).toBe('three-parity-v1-planet-focus.png')
  for (const invalid of ['../escape.json', 'testdata/render-baselines/no-extension', 'testdata/render-baselines/.json']) {
    expect(() => resolveParityOutput(invalid)).toThrow(/MINDVERSE_PARITY_OUT/)
  }
})

test('captures panorama, focused-star and planet-focus for whichever renderer is built', async ({ page }, testInfo) => {
  await installStrataFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/universe.html')
  await expectReady(page)

  const states = {} as Record<ParityStateName, Awaited<ReturnType<typeof captureState>>>
  states.panorama = await captureState(page, 'panorama')
  expect(states.panorama.metadata.selectedPlanetBounds).toBeNull()

  const overview = await snapshot(page)
  const { firstStarX, firstStarY } = overview.scene
  if (firstStarX === null || firstStarY === null) throw new Error('panorama did not project a star to click')
  await canvas(page).click({ position: { x: firstStarX, y: firstStarY }, force: true })
  await page.getByRole('button', { name: /Alpha 进入恒星系/ }).click()
  states['focused-star'] = await captureState(page, 'focused-star')
  expect(states['focused-star'].metadata.cameraDistance)
    .toBeLessThan(states.panorama.metadata.cameraDistance)

  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await snapshot(page)).projectedBounds.selectedPlanet).not.toBeNull()
  states['planet-focus'] = await captureState(page, 'planet-focus')
  expect(states['planet-focus'].metadata.selectedPlanetBounds).not.toBeNull()

  const rendererKind = (await snapshot(page)).rendererKind
  const document = {
    schemaVersion: 'mindverse-visual-parity.v1',
    fixtureVersion: strataUniverseFixture.fixtureVersion,
    rendererKind,
    viewport: VIEWPORT,
    states: Object.fromEntries(PARITY_STATE_NAMES.map((name) => [name, states[name].metadata])),
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  }
  await writeOrAttachParity(document, states, testInfo)
})
