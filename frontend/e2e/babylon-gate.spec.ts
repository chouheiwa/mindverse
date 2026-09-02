import { expect, test, type Page } from '@playwright/test'
import { installStrataFixture } from './helpers/strataFixtureRoute'

test.describe.configure({ mode: 'serial' })

test.beforeEach(({ browserName: _browserName }, testInfo) => testInfo.setTimeout(90_000))

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot())

interface BrowserLifecycleAudit {
  readonly canvases: number
  readonly liveWebglContexts: number
  readonly pendingAnimationFrames: number
  readonly listeners: number
}

async function installLifecycleAudit(page: Page) {
  await page.addInitScript(() => {
    const webglContexts = new Set<WebGLRenderingContext | WebGL2RenderingContext>()
    const listeners: Array<{ target: EventTarget, type: string, listener: EventListenerOrEventListenerObject, capture: boolean }> = []
    const pendingFrames = new Set<number>()
    const nativeGetContext = HTMLCanvasElement.prototype.getContext
    const nativeAdd = EventTarget.prototype.addEventListener
    const nativeRemove = EventTarget.prototype.removeEventListener
    const nativeRequest = window.requestAnimationFrame.bind(window)
    const nativeCancel = window.cancelAnimationFrame.bind(window)

    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, ...args: Parameters<HTMLCanvasElement['getContext']>) {
      const context = nativeGetContext.apply(this, args)
      if ((args[0] === 'webgl' || args[0] === 'webgl2') && context) {
        webglContexts.add(context as WebGLRenderingContext | WebGL2RenderingContext)
      }
      return context
    } as HTMLCanvasElement['getContext']
    EventTarget.prototype.addEventListener = function (this: EventTarget, type, listener, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
      if (listener && !listeners.some((entry) => entry.target === this && entry.type === type
        && entry.listener === listener && entry.capture === capture)) {
        listeners.push({ target: this, type, listener, capture })
      }
      nativeAdd.call(this, type, listener, options)
    }
    EventTarget.prototype.removeEventListener = function (this: EventTarget, type, listener, options) {
      const capture = typeof options === 'boolean' ? options : Boolean(options?.capture)
      const index = listeners.findIndex((entry) => entry.target === this && entry.type === type
        && entry.listener === listener && entry.capture === capture)
      if (index >= 0) listeners.splice(index, 1)
      nativeRemove.call(this, type, listener, options)
    }
    window.requestAnimationFrame = (callback) => {
      let id = 0
      id = nativeRequest((time) => {
        pendingFrames.delete(id)
        callback(time)
      })
      pendingFrames.add(id)
      return id
    }
    window.cancelAnimationFrame = (id) => {
      pendingFrames.delete(id)
      nativeCancel(id)
    }
    Object.defineProperty(window, '__MINDVERSE_LIFECYCLE_AUDIT__', {
      configurable: false,
      value: {
        snapshot: (): BrowserLifecycleAudit => ({
          canvases: document.querySelectorAll('canvas[aria-label="认知宇宙三维星图"]').length,
          liveWebglContexts: [...webglContexts].filter((context) => !context.isContextLost()).length,
          pendingAnimationFrames: pendingFrames.size,
          listeners: listeners.filter(({ target }) => !(target instanceof Node) || target.isConnected).length,
        }),
      },
    })
  })
}

const lifecycleAudit = (page: Page) => page.evaluate(() => (
  window as typeof window & { __MINDVERSE_LIFECYCLE_AUDIT__: { snapshot(): BrowserLifecycleAudit } }
).__MINDVERSE_LIFECYCLE_AUDIT__.snapshot())

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
  await installLifecycleAudit(page)
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

async function holdKeyUntil(page: Page, key: string, predicate: () => Promise<boolean>) {
  await page.keyboard.down(key)
  try {
    await expect.poll(predicate, { timeout: 5_000 }).toBe(true)
  } finally {
    await page.keyboard.up(key)
    const focused = await page.locator(':focus').elementHandle()
    await focused?.evaluate((element: HTMLElement) => {
      element.blur()
      element.focus()
    })
  }
}

test('Babylon vertical slice renders, orbits, crosses the surface and preserves cave camera pose', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  await openBabylonUniverse(page)
  await expectReady(page)

  const initial = (await snapshot(page))!
  await expect(canvas(page)).toHaveCount(1)
  await expect.poll(async () => await lifecycleAudit(page)).toMatchObject({
    canvases: 1,
    liveWebglContexts: 1,
    pendingAnimationFrames: 1,
  })
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
  await enterStrata(page, '回溯地层')
  expect(await nonBackgroundRatio(page)).toBeGreaterThanOrEqual(0.35)
  const hud = page.getByRole('region', { name: '答案地层导航' })
  await hud.focus()
  await page.keyboard.down('s')
  await page.waitForTimeout(400)
  await page.keyboard.up('s')
  await expect.poll(async () => (await snapshot(page))?.scenePhase).toMatch(/strata-(free|snapped)/)
  const cave = (await snapshot(page))!
  const pose = cave.scene.strataPose!
  expect(cave.scene.cameraTargetY).toBeCloseTo(-pose.depth + Math.sin(pose.pitch), 2)
  await holdKeyUntil(page, 'd', async () => Boolean((await snapshot(page))?.projectedBounds.answerSpecimens
    ?.some(({ room, bounds }) => room === 'main' && bounds)))
  const target = (await snapshot(page))!.projectedBounds.answerSpecimens!
    .find(({ room, bounds }) => room === 'main' && bounds)!.bounds!
  await canvas(page).click({ position: { x: target.x + target.width / 2, y: target.y + target.height / 2 }, force: true })
  expect((await snapshot(page))!.lifecycle.lastPick).toBe('specimen')
  await expect(page.getByRole('dialog', { name: /ANSWER SPECIMEN|固定答案/ })).toBeVisible()
  await page.getByRole('button', { name: '关闭答案证据板' }).click()
  await exitStrata(page)

  const after = (await snapshot(page))!
  expect(after.scene.cameraAlpha).toBeCloseTo(entryCamera.cameraAlpha!, 6)
  expect(after.scene.cameraBeta).toBeCloseTo(entryCamera.cameraBeta!, 6)
  expect(after.scene.cameraDistance).toBeCloseTo(entryCamera.cameraDistance, 6)
  expect(after.activeContextCount).toBe(1)
  expect(errors).toEqual([])
})

test('five complete mounts release real canvas, context, listeners and RAF resources', async ({ page }) => {
  await openBabylonUniverse(page)
  let destroyedBaseline: BrowserLifecycleAudit | null = null
  for (let cycle = 0; cycle < 5; cycle += 1) {
    await expectReady(page)
    await openStar(page)
    await openQuestionWorkspace(page, '固定地层问题')
    await enterStrata(page, '回溯地层')
    await exitStrata(page)
    await canvas(page).dispatchEvent('webglcontextlost')
    await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
    await expect.poll(async () => await lifecycleAudit(page)).toMatchObject({
      canvases: 0,
      liveWebglContexts: 0,
      pendingAnimationFrames: 0,
    })
    const released = await lifecycleAudit(page)
    if (destroyedBaseline === null) destroyedBaseline = released
    else expect(released.listeners).toBe(destroyedBaseline.listeners)
    expect(await snapshot(page)).toBeUndefined()
    if (cycle < 4) await page.getByRole('button', { name: '重试 3D' }).click()
  }
})

test('navigates through the side passage and opens the identified undated specimen', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await openStar(page)
  await openQuestionWorkspace(page, '固定地层问题')
  await enterStrata(page, '回溯地层')
  const hud = page.getByRole('region', { name: '答案地层导航' })
  await hud.focus()
  const undated = (await snapshot(page))!.projectedBounds.answerSpecimens!
    .find(({ answerId, room }) => answerId === 'answer:999' && room === 'undated')!
  const targetYaw = Math.atan2(undated.x, undated.z)
  await holdKeyUntil(page, 's', async () => (await snapshot(page))!.scene.strataPose!.depth >= undated.depth - 0.2)
  await holdKeyUntil(page, 'd', async () => (await snapshot(page))!.scene.strataPose!.yaw >= targetYaw - 0.05)
  await holdKeyUntil(page, 'e', async () => (await snapshot(page))!.scene.strataPose!.pitch >= -0.03)
  try {
    await holdKeyUntil(page, 'd', async () => Boolean((await snapshot(page))!.projectedBounds.answerSpecimens
      ?.find(({ answerId, room: specimenRoom }) => answerId === 'answer:999' && specimenRoom === 'undated')?.bounds))
  } catch (cause) {
    const state = (await snapshot(page))!
    const target = state.projectedBounds.answerSpecimens?.find(({ answerId }) => answerId === 'answer:999')
    throw new Error(`Undated specimen never became pickable: ${JSON.stringify({
      cause: cause instanceof Error ? cause.message : String(cause),
      pose: state.scene.strataPose,
      target,
      cameraTarget: [state.scene.cameraTargetX, state.scene.cameraTargetY, state.scene.cameraTargetZ],
    })}`)
  }
  const target = (await snapshot(page))!.projectedBounds.answerSpecimens!
    .find(({ answerId }) => answerId === 'answer:999')!.bounds!
  await canvas(page).click({ position: { x: target.x + target.width / 2, y: target.y + target.height / 2 }, force: true })
  await expect(page.getByRole('dialog', { name: /未定年答案/ })).toBeVisible()
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
