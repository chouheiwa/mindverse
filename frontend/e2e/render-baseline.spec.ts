import { execFileSync } from 'node:child_process'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { installStrataFixture, strataUniverseFixture } from './helpers/strataFixtureRoute'

test.use({ viewport: { width: 1280, height: 720 } })
test.setTimeout(90_000)

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')

test('captures the deterministic selected-planet render baseline', async ({ page }, testInfo) => {
  await installStrataFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const startedAt = performance.now()
  await page.goto('/universe.html')
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  const scene = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().scene)
  await canvas(page).click({ position: { x: scene.firstStarX!, y: scene.firstStarY! }, force: true })
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().projectedBounds.selectedPlanet)))
    .not.toBeNull()
  const firstInteractiveMs = performance.now() - startedAt

  const warm = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot().frames.nextSequence)
  await page.waitForTimeout(10_000)
  const snapshot = await page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())
  const samples = snapshot.frameTimes.slice(Math.max(0, warm - snapshot.frames.firstSequence))
  const sorted = [...samples].sort((left, right) => left - right)
  const p95FrameTime = sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] ?? 0
  const nonBackgroundRatio = await canvas(page).evaluate(async (node: HTMLCanvasElement) => {
    return await new Promise<number>((complete, reject) => requestAnimationFrame(() => {
      const gl = node.getContext('webgl2') ?? node.getContext('webgl')
      if (!gl) return reject(new Error('WebGL context unavailable'))
      const pixels = new Uint8Array(node.width * node.height * 4)
      gl.finish()
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let nonBackground = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) nonBackground += 1
      }
      complete(nonBackground / (pixels.length / 4))
    }))
  })
  const metrics = {
    fixtureVersion: strataUniverseFixture.fixtureVersion,
    rendererKind: snapshot.rendererKind,
    viewport: { width: 1280, height: 720 },
    selectedPlanetBounds: snapshot.projectedBounds.selectedPlanet,
    nonBackgroundRatio,
    firstInteractiveMs,
    p95FrameTime,
    sampleCount: samples.length,
    commitSha: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  }
  expect(metrics.selectedPlanetBounds).not.toBeNull()
  const png = await canvas(page).screenshot()
  const output = resolveBaselineOutput(process.env.MINDVERSE_BASELINE_OUT)
  if (output) {
    await mkdir(dirname(output.json), { recursive: true })
    await writeFile(output.json, JSON.stringify(metrics, null, 2) + '\n')
    await writeFile(output.png, png)
  } else {
    await testInfo.attach(`${snapshot.rendererKind}-question-7.json`, { body: JSON.stringify(metrics, null, 2), contentType: 'application/json' })
    await testInfo.attach(`${snapshot.rendererKind}-question-7.png`, { body: png, contentType: 'image/png' })
  }
})

export function resolveBaselineOutput(value: string | undefined): { json: string; png: string } | null {
  if (!value) return null
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const json = resolve(process.cwd(), value)
  const pathFromRoot = relative(root, json)
  if (extname(json) !== '.json' || pathFromRoot.startsWith('..') || pathFromRoot === '' || basename(json) === '.json') {
    throw new Error('MINDVERSE_BASELINE_OUT must be a .json file inside testdata/render-baselines')
  }
  return { json, png: json.slice(0, -5) + '.png' }
}
