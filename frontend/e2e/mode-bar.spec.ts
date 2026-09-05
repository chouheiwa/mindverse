import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, relative, resolve } from 'node:path'
import { expect, test, type Page, type TestInfo } from '@playwright/test'
import { parseUniverse } from '../src/domain/universe'
import { readFreshPixelStats } from '../src/starmap/renderReadback'
import { createModeLayerFixture, installStrataFixture } from './helpers/strataFixtureRoute'

// 模式栏可见性门禁。
//
// 迁移后模式栏一度只剩「整屏变暗」：六个按钮里五个不产生任何新元素。基础
// strata fixture 只有一颗星、虫洞/暗物质/星云/孤立概念全是空列表，因此它
// 分辨不出模式栏是好的还是坏的。这里用 modeLayers fixture 把六个按钮各自
// 该强调的数据都填上，然后逐个点过去量画面。

const VIEWPORT = { width: 1280, height: 720, deviceScaleFactor: 1 } as const
const MODES = [
  { key: 'all', label: '全景' },
  { key: 'worm', label: '虫洞' },
  { key: 'dark', label: '熄灭的星' },
  { key: 'nebula', label: '星云' },
  { key: 'solo', label: '边缘微光' },
  { key: 'me', label: '好奇心结构' },
] as const

test.use({ viewport: { width: VIEWPORT.width, height: VIEWPORT.height }, deviceScaleFactor: 1 })
test.setTimeout(120_000)

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__!.snapshot())

export function resolveModeOutput(value: string | undefined): { json: string, image: (key: string) => string } | null {
  if (!value) return null
  const root = resolve(process.cwd(), 'testdata/render-baselines')
  const json = resolve(process.cwd(), value)
  const pathFromRoot = relative(root, json)
  if (extname(json) !== '.json' || pathFromRoot.startsWith('..') || pathFromRoot === '' || basename(json) === '.json') {
    throw new Error('MINDVERSE_MODE_OUT must be a .json file inside testdata/render-baselines')
  }
  const stem = basename(json, '.json')
  return { json, image: (key) => resolve(dirname(json), `${stem}-${key}.png`) }
}

async function nonBackgroundRatio(page: Page): Promise<number> {
  // A plain readPixels only works on the very first sample: the drawing buffer
  // is not preserved, so every later read comes back empty and every mode after
  // the first looks like a black frame. Sample after a fresh render instead.
  const stats = await canvas(page).evaluate(readFreshPixelStats, 12)
  return stats.nonBackground / stats.total
}

test('the mode fixture carries something for every button to show', () => {
  const universe = createModeLayerFixture().generation.universe!
  expect(universe.wormholes).toHaveLength(1)
  expect(universe.dark).toHaveLength(1)
  expect(universe.nebula).toHaveLength(1)
  expect(universe.solo).toHaveLength(2)
  expect(universe.particles!.length).toBeGreaterThan(0)
  expect(universe.clusters).toHaveLength(2)
  expect(universe.stars!.some(({ o }) => o > 0)).toBe(true)
  // A fixture the parser rejects renders a fallback page, not a mode bar.
  expect(() => parseUniverse(universe)).not.toThrow()
})

test('every mode bar button changes what the canvas shows @metal-performance', async ({ page }, testInfo) => {
  // 逐帧读回依赖 Babylon 才上报的 actualRenderCount：没有它就分不清读到的是
  // 新一帧还是上一帧的残留。Three 构建下这条门禁无从执行。
  test.skip(process.env.VITE_RENDERER !== 'babylon', 'mode bar readback needs the Babylon render counter')
  await installStrataFixture(page, { modeLayers: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/universe.html')
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page)).renderReady).toBe(true)

  const measured: Record<string, { ratio: number, resources: unknown }> = {}
  const shots: Record<string, Buffer> = {}
  for (const { key, label } of MODES) {
    await page.getByRole('button', { name: label, exact: true }).click()
    await page.waitForTimeout(500)
    measured[key] = {
      ratio: await nonBackgroundRatio(page),
      resources: (await snapshot(page)).resources,
    }
    shots[key] = await canvas(page).screenshot()
  }

  // Evidence first: a failing gate must still leave the frames behind.
  const output = resolveModeOutput(process.env.MINDVERSE_MODE_OUT)
  const document = {
    schemaVersion: 'mindverse-mode-bar.v1',
    fixtureVersion: 'strata-universe.modes.v1',
    rendererKind: (await snapshot(page)).rendererKind,
    viewport: VIEWPORT,
    modes: measured,
  }
  if (output) {
    await mkdir(dirname(output.json), { recursive: true })
    await writeFile(output.json, JSON.stringify(document, null, 2) + '\n')
    for (const { key } of MODES) await writeFile(output.image(key), shots[key]!)
  } else {
    await attach(document, shots, testInfo)
  }

  // Restoration contract: no mode may be answered by dimming everything.
  for (const { key } of MODES) {
    expect(measured[key]!.ratio, `${key} must render something`).toBeGreaterThan(0.001)
  }
  const ratios = MODES.map(({ key }) => measured[key]!.ratio)
  expect(new Set(ratios.map((ratio) => ratio.toFixed(4))).size,
    'at least three modes must differ measurably').toBeGreaterThanOrEqual(3)
  // The wormhole stream is the one genuinely modal layer.
  expect(measured.worm!.ratio).toBeGreaterThan(measured.nebula!.ratio)

  // Coverage alone cannot tell two star-filter modes apart, so require that no
  // two buttons produce the same frame.
  const digests = new Map<string, string>()
  for (const { key } of MODES) {
    const digest = createHash('sha256').update(shots[key]!).digest('hex')
    const clash = [...digests.entries()].find(([, value]) => value === digest)
    expect(clash?.[0], `${key} renders the same frame as ${clash?.[0]}`).toBeUndefined()
    digests.set(key, digest)
  }
})

async function attach(document: object, shots: Record<string, Buffer>, testInfo: TestInfo) {
  await testInfo.attach('mode-bar.json', {
    body: JSON.stringify(document, null, 2), contentType: 'application/json',
  })
  for (const [key, png] of Object.entries(shots)) {
    await testInfo.attach(`mode-${key}.png`, { body: png, contentType: 'image/png' })
  }
}
