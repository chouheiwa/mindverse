import { expect, test, type Page } from '@playwright/test'
import { installStrataFixture } from './helpers/strataFixtureRoute'

test.describe.configure({ mode: 'serial' })

test.beforeEach((_fixtures, testInfo) => testInfo.setTimeout(90_000))

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot())

async function nonBackgroundRatio(page: Page): Promise<number> {
  return canvas(page).evaluate(async (node: HTMLCanvasElement) => await new Promise<number>((complete, reject) => {
    requestAnimationFrame(() => {
      const gl = node.getContext('webgl2') ?? node.getContext('webgl')
      if (!gl) return reject(new Error('WebGL context unavailable'))
      const pixels = new Uint8Array(node.width * node.height * 4)
      gl.finish()
      gl.readPixels(0, 0, node.width, node.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      let count = 0
      for (let index = 0; index < pixels.length; index += 4) {
        if (Math.max(pixels[index], pixels[index + 1], pixels[index + 2]) > 12) count += 1
      }
      complete(count / (pixels.length / 4))
    })
  }))
}

async function openBabylonUniverse(page: Page, query = '') {
  await installStrataFixture(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto(`/universe.html${query}`)
}

async function expectReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page))?.renderReady).toBe(true)
}

async function openStar(page: Page) {
  const target = await expect.poll(async () => {
    const scene = (await snapshot(page))?.scene
    return scene?.firstStarX === null || scene?.firstStarY === null
      ? null
      : { x: scene?.firstStarX ?? 0, y: scene?.firstStarY ?? 0 }
  }).not.toBeNull()
  void target
  const scene = (await snapshot(page))!.scene
  await canvas(page).click({ position: { x: scene.firstStarX!, y: scene.firstStarY! }, force: true })
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible()
}

async function openQuestionWorkspace(page: Page, title: string) {
  const laneButton = page.getByRole('button', { name: new RegExp(title) })
  await laneButton.click()
  await page.getByLabel('问题行星入口', { exact: true }).getByRole('button', { name: '进入问题行星' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function enterStrata(page: Page, evidenceLabel: '回溯地层' | '当前可观测表层') {
  const trigger = page.getByRole('button', { name: '打开答案地层' })
  await trigger.click()
  await expect.poll(async () => (await snapshot(page))?.scenePhase).toBe('strata-free')
  await expect(page.getByRole('region', { name: '答案地层导航' })).toContainText(evidenceLabel)
}

async function exitStrata(page: Page) {
  await page.getByRole('button', { name: '返回行星表面' }).click()
  await expect.poll(async () => (await snapshot(page))?.scenePhase).toBe('universe')
  await expect(page.getByRole('button', { name: '打开答案地层' })).toBeVisible()
}

test('Babylon vertical slice renders, orbits, crosses the surface and preserves lifecycle', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await openBabylonUniverse(page)
  await expectReady(page)

  const initial = (await snapshot(page))!
  await expect(canvas(page)).toHaveCount(1)
  expect(initial).toMatchObject({
    rendererKind: 'babylon', activeContextCount: 1, scenePhase: 'universe',
    lifecycle: { rafLoops: 1, listeners: 3 }, scene: { planetCount: 2, probeCount: 0 },
  })
  await openStar(page)
  await openQuestionWorkspace(page, '固定地层问题')

  const selectedBefore = (await snapshot(page))!.projectedBounds.selectedPlanet!
  expect(Math.min(selectedBefore.width, selectedBefore.height)).toBeGreaterThanOrEqual(720 * 0.24)
  const stage = page.getByRole('region', { name: '问题行星近景' })
  const stageBounds = await stage.boundingBox()
  if (!stageBounds) throw new Error('question planet stage has no bounds')
  const orbitBefore = (await snapshot(page))!.scene.cameraAlpha!
  await page.mouse.move(stageBounds.x + stageBounds.width * 0.35, stageBounds.y + stageBounds.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(stageBounds.x + stageBounds.width * 0.58, stageBounds.y + stageBounds.height * 0.35, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page))!.scene.cameraAlpha).not.toBe(orbitBefore)
  const entryCamera = (await snapshot(page))!.scene
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await enterStrata(page, '回溯地层')
    const active = (await snapshot(page))!
    expect(active.activeContextCount).toBe(1)
    expect(active.lifecycle).toMatchObject({ rafLoops: 1, listeners: 3 })
    if (cycle === 0) {
      expect(await nonBackgroundRatio(page)).toBeGreaterThanOrEqual(0.35)
      const hud = page.getByRole('region', { name: '答案地层导航' })
      await hud.focus()
      await page.keyboard.down('s')
      await page.waitForTimeout(900)
      await page.keyboard.up('s')
      await expect.poll(async () => (await snapshot(page))?.scenePhase)
        .toMatch(/strata-(free|snapped)/)
      const specimen = await expect.poll(async () => (await snapshot(page))?.projectedBounds.firstAnswerSpecimen)
        .not.toBeNull()
      void specimen
      const target = (await snapshot(page))!.projectedBounds.firstAnswerSpecimen!
      await canvas(page).click({ position: { x: target.x + target.width / 2, y: target.y + target.height / 2 }, force: true })
      expect((await snapshot(page))!.lifecycle.lastPick).toBe('specimen')
      await expect(page.getByRole('dialog', { name: /ANSWER SPECIMEN|固定答案/ })).toBeVisible()
      await page.getByRole('button', { name: '关闭答案证据板' }).click()
    }
    await exitStrata(page)
  }

  const after = (await snapshot(page))!
  expect(after.scene.cameraAlpha).toBeCloseTo(entryCamera.cameraAlpha!, 6)
  expect(after.scene.cameraBeta).toBeCloseTo(entryCamera.cameraBeta!, 6)
  expect(after.scene.cameraDistance).toBeCloseTo(entryCamera.cameraDistance, 6)
  expect(after.activeContextCount).toBe(1)
  expect(errors).toEqual([])
})

test('below-gate question opens a blocked surface-only room', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await openStar(page)
  await openQuestionWorkspace(page, '当前表层问题')
  await enterStrata(page, '当前可观测表层')
  await expect(page.getByRole('region', { name: '答案地层导航' })).toContainText('深层已阻断')
})

for (const [label, query, message] of [
  ['Engine 初始化', '?e2eEngineFail=1', /Engine initialization failure/],
  ['WebGL2 能力', '?e2eWebGL2Unavailable=1', /不支持 WebGL2/],
] as const) {
  test(`${label} 失败进入可读文本降级页`, async ({ page }) => {
    await openBabylonUniverse(page, query)
    await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
    await expect(page.getByRole('alert')).toContainText(message)
    await expect(page.getByRole('navigation', { name: '宇宙文本导航' })).toContainText('固定地层问题')
    expect(await snapshot(page)).toBeUndefined()
  })
}

test('webglcontextlost destroys the old runtime and remounts one fresh context', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await canvas(page).dispatchEvent('webglcontextlost')
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  expect(await snapshot(page)).toBeUndefined()
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectReady(page)
  await expect.poll(async () => (await snapshot(page))?.activeContextCount).toBe(1)
})
