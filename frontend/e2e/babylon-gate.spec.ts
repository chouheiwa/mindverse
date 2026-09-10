import { expect, test, type Page } from '@playwright/test'
import { classifyWebGlBackend } from '../src/starmap/e2eDiagnostics'
import { readFreshLuminanceProfile, readFreshPixelStats } from '../src/starmap/renderReadback'
import { installStrataFixture, type StrataFixtureOptions } from './helpers/strataFixtureRoute'

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
  const stats = await canvas(page).evaluate(readFreshPixelStats, 10)
  return stats.nonBackground / stats.total
}

async function openBabylonUniverse(
  page: Page,
  query = '',
  reducedMotion: 'reduce' | 'no-preference' = 'reduce',
  fixture: StrataFixtureOptions = {},
) {
  await installLifecycleAudit(page)
  const installed = await installStrataFixture(page, fixture)
  await page.emulateMedia({ reducedMotion })
  await page.goto(`/universe.html${query}`)
  return installed
}

async function expectReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page))?.renderReady).toBe(true)
}

test('functional project is backed by measured SwiftShader', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  const evidence = await page.evaluate(() => {
    const probe = document.createElement('canvas')
    const gl = probe.getContext('webgl2') ?? probe.getContext('webgl')
    const extension = gl?.getExtension('WEBGL_debug_renderer_info')
    return {
      vendor: gl && extension ? String(gl.getParameter(extension.UNMASKED_VENDOR_WEBGL)) : null,
      renderer: gl && extension ? String(gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)) : null,
    }
  })
  expect(evidence.renderer).toMatch(/swiftshader|subzero/i)
  expect(classifyWebGlBackend(evidence.renderer, evidence.vendor)).toBe('swiftshader')
})

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

async function firstProjectedStar(page: Page) {
  await expect.poll(async () => (await snapshot(page))?.stellar.projectedStars[0] ?? null).not.toBeNull()
  return (await snapshot(page))!.stellar.projectedStars[0]!
}

async function dispatchPointer(
  page: Page,
  type: string,
  point: { x: number; y: number },
  pointerId: number,
  pointerType: 'mouse' | 'touch' = 'mouse',
) {
  await canvas(page).evaluate((node, event) => {
    const rect = node.getBoundingClientRect()
    node.dispatchEvent(new PointerEvent(event.type, {
      bubbles: true,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.pointerId === 1,
      clientX: rect.left + event.point.x,
      clientY: rect.top + event.point.y,
      buttons: event.type === 'pointerup' ? 0 : 1,
      button: 0,
    }))
  }, { type, point, pointerId, pointerType })
}

test('stellar halo hover, edge click and camera approach progressively reveal the system', async ({ page }) => {
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  const star = await firstProjectedStar(page)
  const haloEdge = {
    x: star.halo.x + star.halo.width - 1,
    y: star.halo.y + star.halo.height / 2,
  }

  await canvas(page).hover({ position: haloEdge, force: true })
  await expect(canvas(page)).toHaveCSS('cursor', 'pointer')
  await expect.poll(async () => (await snapshot(page))?.stellar.hoveredStarKey).toBe(star.starKey)
  await expect.poll(async () => (await snapshot(page))?.stellar.hoverProgress ?? 0).toBeGreaterThan(0)
  await canvas(page).click({ position: haloEdge, force: true })

  await expect.poll(async () => (await snapshot(page))?.stellar.focusedStarKey).toBe(star.starKey)
  await expect.poll(async () => (await snapshot(page))!.stellar.cameraSamples.length).toBeGreaterThanOrEqual(3)
  await expect.poll(async () => {
    const stellar = (await snapshot(page))!.stellar
    return stellar.approachProgress > 0.55 && stellar.approachProgress < 0.98
      && stellar.systemReveal > 0
      && stellar.visibleQuestionOrbits > 0
      && stellar.visibleQuestionPlanets > 0
  }, { timeout: 5_000, intervals: [16, 32, 64] }).toBe(true)
  await expect.poll(async () => (await snapshot(page))!.stellar.approachProgress).toBe(1)
  const distances = (await snapshot(page))!.stellar.cameraSamples.map(({ distance }) => distance)
  expect(new Set(distances.map((distance) => distance.toFixed(3))).size).toBeGreaterThanOrEqual(3)
})

test('dragging more than six pixels rotates without selecting a star', async ({ page }) => {
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  const star = await firstProjectedStar(page)
  const center = { x: star.core.x + star.core.width / 2, y: star.core.y + star.core.height / 2 }
  const alpha = (await snapshot(page))!.scene.cameraAlpha!
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('stellar canvas has no bounds')
  await canvas(page).hover({ position: center })
  await page.mouse.down()
  await page.mouse.move(bounds.x + center.x + 30, bounds.y + center.y + 12, { steps: 4 })
  await page.mouse.up()
  await expect.poll(async () => (await snapshot(page))!.scene.cameraAlpha).not.toBe(alpha)
  expect((await snapshot(page))!.stellar.focusedStarKey).toBeNull()
})

type HierarchyExitInput = 'blank-click' | 'outward-wheel' | 'escape'

async function applyHierarchyExit(page: Page, input: HierarchyExitInput, exited: () => Promise<boolean>) {
  if (input === 'blank-click') {
    await canvas(page).click({ position: { x: 3, y: 3 }, force: true })
  } else if (input === 'escape') {
    await page.keyboard.press('Escape')
  } else {
    await canvas(page).hover({ position: { x: 3, y: 3 } })
    for (let attempt = 0; attempt < 16 && !await exited(); attempt += 1) await page.mouse.wheel(0, 2_000)
  }
  await expect.poll(exited).toBe(true)
}

for (const input of ['blank-click', 'outward-wheel', 'escape'] as const) {
  test(`${input} exits planet focus to its star, then exits the star to panorama`, async ({ page }) => {
    await openBabylonUniverse(page)
    await expectReady(page)
    const star = await firstProjectedStar(page)
    const center = { x: star.core.x + star.core.width / 2, y: star.core.y + star.core.height / 2 }
    await canvas(page).click({ position: center, force: true })
    await expect.poll(async () => (await snapshot(page))!.stellar.focusedStarKey).toBe(star.starKey)
    await page.getByRole('button', { name: /固定地层问题/ }).click()
    await expect.poll(async () => (await snapshot(page))!.projectedBounds.selectedPlanet).not.toBeNull()

    await applyHierarchyExit(page, input, async () => (await snapshot(page))!.projectedBounds.selectedPlanet === null)
    const starFocus = (await snapshot(page))!
    expect(starFocus.stellar.focusedStarKey).toBe(star.starKey)
    expect(starFocus.stellar.approachProgress).toBe(1)

    await applyHierarchyExit(page, input, async () => (await snapshot(page))!.stellar.focusedStarKey === null)
    const panorama = (await snapshot(page))!
    expect(panorama.projectedBounds.selectedPlanet).toBeNull()
    expect(panorama.stellar.focusedStarKey).toBeNull()
  })
}

for (const cancellation of ['pointercancel', 'lostpointercapture', 'second-touch'] as const) {
  test(`${cancellation} clears click eligibility without selecting`, async ({ page }) => {
    await openBabylonUniverse(page)
    await expectReady(page)
    const star = await firstProjectedStar(page)
    const center = { x: star.core.x + star.core.width / 2, y: star.core.y + star.core.height / 2 }
    const clicks = (await snapshot(page))!.lifecycle.clickEvents ?? 0
    await dispatchPointer(page, 'pointerdown', center, 1, cancellation === 'second-touch' ? 'touch' : 'mouse')
    if (cancellation === 'second-touch') {
      await dispatchPointer(page, 'pointerdown', center, 2, 'touch')
      await dispatchPointer(page, 'pointerup', center, 2, 'touch')
    } else {
      await dispatchPointer(page, cancellation, center, 1)
    }
    await dispatchPointer(page, 'pointerup', center, 1, cancellation === 'second-touch' ? 'touch' : 'mouse')
    expect((await snapshot(page))!.stellar.focusedStarKey).toBeNull()
    expect((await snapshot(page))!.lifecycle.clickEvents).toBe(clicks)
  })
}

test('Reduced Motion reaches the same stable focused state without a long flight', async ({ page }) => {
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  const star = await firstProjectedStar(page)
  const center = { x: star.core.x + star.core.width / 2, y: star.core.y + star.core.height / 2 }
  await canvas(page).click({ position: center, force: true })
  await expect.poll(async () => (await snapshot(page))!.stellar.approachProgress).toBe(1)
  const normal = (await snapshot(page))!
  await page.keyboard.press('Escape')
  await expect.poll(async () => (await snapshot(page))!.stellar.focusedStarKey).toBeNull()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // 等渲染器真的收到 media change，否则会在切换生效前就点下去，飞行仍按 900ms+ 播。
  await expect.poll(async () => (await snapshot(page))!.stellar.reducedMotion).toBe(true)
  const reducedStar = await firstProjectedStar(page)
  const reducedCenter = {
    x: reducedStar.core.x + reducedStar.core.width / 2,
    y: reducedStar.core.y + reducedStar.core.height / 2,
  }
  await canvas(page).click({ position: reducedCenter, force: true })
  await expect.poll(async () => (await snapshot(page))!.stellar.approachProgress).toBe(1)
  const reduced = (await snapshot(page))!
  // 断言飞行本身的时长，不是测试进程跑完一轮轮询的墙钟：后者混进了 CDP 往返
  // 与 expect.poll 的间隔，机器一忙就假红，产品再快也救不回来。
  expect(normal.stellar.approachDurationMs).toBeGreaterThanOrEqual(900)
  expect(reduced.stellar.approachDurationMs).toBeLessThanOrEqual(120)
  expect(reduced.stellar.focusedStarKey).toBe(normal.stellar.focusedStarKey)
  expect(reduced.stellar.systemReveal).toBe(normal.stellar.systemReveal)
  expect(reduced.scene.cameraDistance).toBeCloseTo(normal.scene.cameraDistance, 3)
})

/** 进入问题行星。这一步会一路飞进大气层落到地层 —— 工作台在地层背后。 */
async function openQuestionWorkspace(page: Page, title: string) {
  const laneButton = page.getByRole('button', { name: new RegExp(title) })
  await laneButton.click()
  await page.getByLabel('问题行星入口', { exact: true }).getByRole('button', { name: '进入问题行星' }).click()
  // 俯冲 900ms + 穿越 700ms。SwiftShader 下一帧要上百毫秒，同样的动画要跑好几秒 ——
  // 慢的是软件渲染，不是产品，所以这里给足超时而不是把动画改短。
  await expect.poll(
    async () => (await snapshot(page))?.resources.surfaceStage?.phase, { timeout: 30_000 },
  ).toBe('walking')
}

/**
 * 落在地层里。
 *
 * 进入行星会自动飞进去，所以多数情况下这里不需要点任何东西；从工作台退回来
 * 之后再次进入时，「打开答案地层」按钮仍在，点它即可。两种起点都要能用。
 */
async function enterStrata(page: Page, evidenceLabel: '回溯地层' | '当前可观测表层') {
  const trigger = page.getByRole('button', { name: '打开答案地层' })
  if (await trigger.isVisible().catch(() => false)) await trigger.click()
  await expect.poll(async () => (await snapshot(page))?.scenePhase, { timeout: 30_000 })
    .toBe('strata-free')
  await expect(page.getByRole('region', { name: '答案地层导航' })).toContainText(evidenceLabel)
}

/** 退回行星表面，才看得到问题工作台。 */
async function backToWorkspace(page: Page, title: string) {
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function exitStrata(page: Page) {
  await page.getByRole('button', { name: '返回行星表面' }).click()
  await expect.poll(async () => (await snapshot(page))?.scenePhase).toBe('universe')
  await expect(page.getByRole('button', { name: '打开答案地层' })).toBeVisible()
}

async function holdKeyUntil(page: Page, key: string, predicate: () => Promise<boolean>) {
  await page.keyboard.down(key)
  try {
    await expect.poll(predicate, { timeout: 5_000, intervals: [20] }).toBe(true)
  } finally {
    await page.keyboard.up(key)
    const strataHud = page.getByRole('region', { name: '答案地层导航' })
    const code = key.length === 1 ? `Key${key.toUpperCase()}` : key
    await strataHud.dispatchEvent('keyup', { code, key })
    await strataHud.blur()
    await page.waitForTimeout(60)
    await strataHud.focus()
  }
}

test('Babylon vertical slice renders, orbits, crosses the surface and preserves cave camera pose', async ({ page }, testInfo) => {
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
    lifecycle: { rafLoops: 1, listeners: 10 }, scene: { planetCount: 2, probeCount: 0 },
    resources: {
      materializedPlanetCount: 0,
      planetVisualConstructions: 0,
      planetShaderCompileRequests: 0,
      planetUpdatesLastFrame: 0,
    },
  })
  await openStar(page)
  await expect.poll(async () => (await snapshot(page))?.resources.materializedPlanetCount).toBe(2)
  await expect.poll(async () => (await snapshot(page))?.resources.planetShaderCompileRequests ?? 0).toBeGreaterThanOrEqual(4)
  await expect.poll(async () => (await snapshot(page))?.resources.planetUpdatesLastFrame).toBe(2)
  expect((await snapshot(page))!.resources.planetVisualConstructions).toBe(2)
  await openQuestionWorkspace(page, '固定地层问题')
  // 进入行星直落地质，工作台的近景舞台要退回表面才在。
  await backToWorkspace(page, '固定地层问题')

  const selectedBefore = (await snapshot(page))!.projectedBounds.selectedPlanet!
  expect(Math.min(selectedBefore.width, selectedBefore.height)).toBeGreaterThanOrEqual(720 * 0.24)
  // 站在地表上：左边是行走 HUD，拖动是环视（相机注视点变），不再转行星。
  const stage = page.getByRole('region', { name: '行星地表' })
  const stageBounds = await stage.boundingBox()
  if (!stageBounds) throw new Error('planet surface stage has no bounds')
  const lookBefore = (await snapshot(page))!.scene
  await page.mouse.move(stageBounds.x + stageBounds.width * 0.35, stageBounds.y + stageBounds.height * 0.45)
  await page.mouse.down()
  await page.mouse.move(stageBounds.x + stageBounds.width * 0.58, stageBounds.y + stageBounds.height * 0.35, { steps: 5 })
  await page.mouse.up()
  await expect.poll(async () => {
    const scene = (await snapshot(page))!.scene
    return Math.hypot(
      scene.cameraTargetX! - lookBefore.cameraTargetX!,
      scene.cameraTargetY! - lookBefore.cameraTargetY!,
      scene.cameraTargetZ! - lookBefore.cameraTargetZ!,
    )
  }).toBeGreaterThan(0)
  expect((await snapshot(page))!.resources.highPlanetCount).toBeLessThanOrEqual(1)
  const entryCamera = (await snapshot(page))!.scene
  await enterStrata(page, '回溯地层')
  expect(await nonBackgroundRatio(page)).toBeGreaterThanOrEqual(0.35)
  // Evidence that entering a question lands in a strata world rather than text
  // laid over the universe.
  await testInfo.attach('strata-world.png', {
    body: await canvas(page).screenshot(), contentType: 'image/png',
  })
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
  await testInfo.attach('babylon-strata-cave.png', {
    body: await page.screenshot(), contentType: 'image/png',
  })
  // 相机停下之前投影还在动：拿一份会动的包围盒去点，点到的是它刚才在的地方。
  const mainSpecimen = async () => (await snapshot(page))!.projectedBounds.answerSpecimens!
    .find(({ room, bounds }) => room === 'main' && bounds)?.bounds ?? null
  let target = await mainSpecimen()
  await expect.poll(async () => {
    const next = await mainSpecimen()
    const settled = Boolean(target && next
      && Math.abs(target.x - next.x) < 0.5 && Math.abs(target.y - next.y) < 0.5)
    target = next
    return settled
  }, { timeout: 10_000 }).toBe(true)
  if (!target) throw new Error('no answer specimen is on screen to click')
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
  const depth = (await snapshot(page))!.scene.strataPose!.depth
  const targetPitch = Math.atan2(depth - undated.depth, Math.hypot(undated.x, undated.z))
  await holdKeyUntil(page, 'e', async () => (await snapshot(page))!.scene.strataPose!.pitch >= targetPitch - 0.03)
  try {
    await page.keyboard.down('d')
    await expect.poll(async () => {
      const bounds = (await snapshot(page))!.projectedBounds.answerSpecimens
        ?.find(({ answerId, room: specimenRoom }) => answerId === 'answer:999' && specimenRoom === 'undated')?.bounds
      if (!bounds) return false
      const canvasBounds = await canvas(page).boundingBox()
      if (!canvasBounds) return false
      await page.mouse.click(
        canvasBounds.x + bounds.x + bounds.width / 2,
        canvasBounds.y + bounds.y + bounds.height / 2,
      )
      return page.getByRole('dialog', { name: /未定年答案/ }).isVisible()
    }, { timeout: 8_000, intervals: [20] }).toBe(true)
  } catch (cause) {
    const state = (await snapshot(page))!
    const target = state.projectedBounds.answerSpecimens?.find(({ answerId }) => answerId === 'answer:999')
    throw new Error(`Undated specimen never became pickable: ${JSON.stringify({
      cause: cause instanceof Error ? cause.message : String(cause),
      pose: state.scene.strataPose,
      target,
      cameraTarget: [state.scene.cameraTargetX, state.scene.cameraTargetY, state.scene.cameraTargetZ],
    })}`)
  } finally {
    await page.keyboard.up('d')
  }
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

test('planet surface fallback stays pickable and can enter strata', async ({ page }) => {
  await openBabylonUniverse(page, '?e2ePlanetSurfaceFail=all')
  await expectReady(page)
  await openStar(page)
  await openQuestionWorkspace(page, '固定地层问题')
  await expect.poll(async () => (await snapshot(page))!.planet.surfaceLevel).toBe('lambert')
  expect((await snapshot(page))!.planet).toMatchObject({
    selectedQuestionId: 'question:7', surfaceFallback: true, highFrequencyDetail: false,
  })
  await enterStrata(page, '回溯地层')
  await exitStrata(page)
})

test('atmosphere fallback hides only the shell and preserves strata navigation', async ({ page }) => {
  await openBabylonUniverse(page, '?e2ePlanetAtmosphereFail=1')
  await expectReady(page)
  await openStar(page)
  await openQuestionWorkspace(page, '固定地层问题')
  await expect.poll(async () => (await snapshot(page))!.planet.atmosphereFallback).toBe(true)
  expect((await snapshot(page))!.planet.surfaceFallback).toBe(false)
  await enterStrata(page, '回溯地层')
  await exitStrata(page)
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
    await expect.poll(async () => await lifecycleAudit(page)).toMatchObject({ canvases: 0, liveWebglContexts: 0 })
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

test('an article probe is a craft in orbit that can be approached, orbited, scanned and closed', async ({ page }, testInfo) => {
  const fixture = await openBabylonUniverse(page, '', 'no-preference', { probes: true })
  await expectReady(page)
  await openStar(page)

  const before = await snapshot(page)
  expect(before?.scene.probeCount).toBe(2)
  expect(before?.scene.probeNearVisible).toBe(false)

  const trigger = page.getByRole('button', { name: '检查探测器' }).first()
  await trigger.click()

  // 接近是一段真实运镜：镜头必须离开恒星系机位、落到机体旁。
  const dialog = page.getByRole('dialog', { name: /检查探测器：/ })
  await expect(dialog).toBeVisible({ timeout: 15_000 })
  await expect.poll(async () => (await snapshot(page))?.scene.probeNearVisible ?? false, { timeout: 20_000 })
    .toBe(true)
  const arrived = (await snapshot(page))!.scene
  expect(arrived.cameraDistance).toBeLessThan(before!.scene.cameraDistance)

  // 主动旋转观察：拖动改变机位，而机体本身留在原地。
  const bounds = await canvas(page).boundingBox()
  if (!bounds) throw new Error('probe inspection canvas has no layout bounds')
  await page.mouse.move(bounds.x + bounds.width * 0.3, bounds.y + bounds.height * 0.5)
  await page.mouse.down()
  await page.mouse.move(bounds.x + bounds.width * 0.62, bounds.y + bounds.height * 0.38, { steps: 6 })
  await page.mouse.up()
  await expect.poll(async () => {
    const scene = (await snapshot(page))!.scene
    return Math.abs((scene.cameraAlpha ?? 0) - (arrived.cameraAlpha ?? 0))
      + Math.abs((scene.cameraBeta ?? 0) - (arrived.cameraBeta ?? 0))
  }, { timeout: 10_000 }).toBeGreaterThan(0.05)

  await page.getByRole('button', { name: '聚焦部件：天线' }).click()
  await page.getByRole('button', { name: '开始扫描' }).click()
  const article = page.getByRole('link', { name: '查看原文章' })
  await expect(article).toBeVisible({ timeout: 10_000 })
  expect(await article.getAttribute('href')).toBe(fixture.generation.universe?.probes?.[0]?.url)

  await testInfo.attach('babylon-probe-inspection.png', {
    body: await page.screenshot(), contentType: 'image/png',
  })

  await page.keyboard.press('Escape')
  await expect(trigger).toBeFocused()
  await expect.poll(async () => (await snapshot(page))?.scene.probeNearVisible ?? true).toBe(false)

  // 重复进出不得堆积资源。
  const memory = [(await snapshot(page))!.memory]
  for (let cycle = 0; cycle < 2; cycle += 1) {
    await trigger.click()
    await expect(dialog).toBeVisible()
    await expect.poll(async () => (await snapshot(page))?.scene.probeNearVisible ?? false, { timeout: 20_000 })
      .toBe(true)
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()
    memory.push((await snapshot(page))!.memory)
  }
  expect(memory[2].geometries).toBeLessThanOrEqual(memory[0].geometries)
  expect(memory[2].textures).toBeLessThanOrEqual(memory[0].textures)
})

test('the answer strata is a lit, layered world rather than a black void', async ({ page }, testInfo) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await openStar(page)
  await openQuestionWorkspace(page, '固定地层问题')
  await enterStrata(page, '回溯地层')
  await expect.poll(async () => (await snapshot(page))?.scenePhase).toMatch(/strata-(free|snapped)/)
  await page.getByRole('region', { name: '答案地层导航' }).focus()
  await holdKeyUntil(page, 's', async () => ((await snapshot(page))?.scene.strataPose?.depth ?? 0) > 3)

  // 1) 宇宙退场：星图那一层必须整体关掉，不是「叠在宇宙上的文字」。
  const inside = (await snapshot(page))!
  expect(inside.scene.planetCount).toBeGreaterThanOrEqual(0)
  expect(inside.scenePhase).toMatch(/strata-(free|snapped)/)
  // 相机 up 轴必须回到世界 Y。地表把它掰成脚下法线，洞穴若原样继承，水平纹层就成了斜纹，
  // 下面的分带剖面会被抹平 —— 这条把那种失败说成人话。
  expect(inside.scene.cameraUp).toBeDefined()
  expect(inside.scene.cameraUp![0]).toBeCloseTo(0, 6)
  expect(inside.scene.cameraUp![1]).toBeCloseTo(1, 6)
  expect(inside.scene.cameraUp![2]).toBeCloseTo(0, 6)

  // 2) 洞窟必须有东西可看。全黑的地层世界只是一个 HUD。
  const lit = await nonBackgroundRatio(page)
  await testInfo.attach('babylon-strata-lit.png', {
    body: await page.screenshot(), contentType: 'image/png',
  })
  process.stdout.write(`[strata] nonBackground ${lit.toFixed(4)}\n`)
  expect(lit).toBeGreaterThan(0.35)

  // 3) 纵向年代层：岩壁必须在竖直方向上明暗交替，而不是一条单调渐变。
  //    修复前实测剖面 0.0529,0.0536,…,0.0616 —— 单调、落差 0.0087、零次穿越。
  const bands = (await canvas(page).evaluate(readFreshLuminanceProfile, 12)).bands
  process.stdout.write(`[strata] bands ${bands.map((value) => value.toFixed(4)).join(',')}\n`)
  expect(Math.max(...bands)).toBeGreaterThan(0.09)
  const mean = bands.reduce((sum, value) => sum + value, 0) / bands.length
  let crossings = 0
  for (let index = 1; index < bands.length; index += 1) {
    if ((bands[index - 1]! - mean) * (bands[index]! - mean) < 0) crossings += 1
  }
  expect(crossings).toBeGreaterThanOrEqual(3)
})

test('cluster structure rings leave the frame as the camera zooms in from panorama', async ({ page }) => {
  // 基础语料只有一颗坐在质心上的星，半径 0 画不出环 —— 必须用 500 星的密集语料。
  await openBabylonUniverse(page, '', 'reduce', { denseStars: true })
  await expectReady(page)

  // 全景机位：环是「这是个星系」最强的结构信号，必须满亮。
  const panorama = (await snapshot(page))!
  expect(panorama.resources.clusterRingCount).toBeGreaterThan(0)
  expect(panorama.resources.clusterRingGain).toBeGreaterThan(0.2)

  // 滚轮推进。环是全景尺度的东西，推近之后只剩遮挡，必须退场。
  // 断言的是实际交给材质的增益 —— 帧描述子在这个量级上看不见它。
  await canvas(page).hover({ position: { x: 200, y: 200 } })
  for (let attempt = 0; attempt < 24; attempt += 1) {
    const current = (await snapshot(page))!
    if (current.resources.clusterRingGain === 0) break
    await page.mouse.wheel(0, -600)
  }
  const zoomed = (await snapshot(page))!
  expect(zoomed.scene.cameraDistance).toBeLessThan(panorama.scene.cameraDistance)
  expect(zoomed.resources.clusterRingGain).toBe(0)
  // 环本身没有被销毁，只是不显示 —— 退回全景要能原样回来。
  expect(zoomed.resources.clusterRingCount).toBe(panorama.resources.clusterRingCount)
})

test('the planet stage has no universe left in it', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await openStar(page)

  // 恒星系阶段：宇宙还在，只是退让。
  const atStar = (await snapshot(page))!
  expect(atStar.resources.backdropGain).toBeGreaterThan(0)

  await openQuestionWorkspace(page, '固定地层问题')
  await backToWorkspace(page, '固定地层问题')

  // 地表阶段：星空、星云、尘埃、星群环、轨道椭圆、星群名全部不在。
  // 留一点余晖就还是「一颗球飘在宇宙里」，那不是地表。
  const atPlanet = (await snapshot(page))!
  expect(atPlanet.scenePhase).toBe('universe')
  expect(atPlanet.planet.selectedQuestionId).toBe('question:7')
  expect(atPlanet.resources.backdropGain).toBe(0)
  expect(atPlanet.stellar.visibleQuestionOrbits).toBe(0)

  // 地表必须真的画出来。诊断说「walking、327 块」而画布全黑 —— 那不是地表，是一个
  // 状态机。实测 Metal 上整帧 lit = 0：近裁剪面 0.1 把半径 0.18 的星球整个地面裁掉了。
  const surface = atPlanet.resources.surfaceStage!
  process.stdout.write(`[surface] ${JSON.stringify(surface)}\n`)
  // 相机得真的站在地上：注视点在眼前半个半径处；被宇宙的 1.2 机位下限夹住时
  // 相机悬在星球外一米多，这个距离会是 1.2。
  expect(surface.cameraTargetDistance!).toBeLessThan(surface.groundRadius)
  expect(surface.lightCount!).toBeGreaterThanOrEqual(1)
  // 落点得在白天那一面：正对镜头的一面是夜面（恒星在行星背后），实测太阳高度角余弦 −0.73。
  expect(surface.sunElevation!).toBeGreaterThan(0.3)
  const lit = await nonBackgroundRatio(page)
  process.stdout.write(`[surface] nonBackground ${lit.toFixed(4)}\n`)
  const skyBands = (await canvas(page).evaluate(readFreshLuminanceProfile, 12)).bands
  process.stdout.write(`[surface] bands ${skyBands.map((value) => value.toFixed(4)).join(',')}\n`)
  expect(lit).toBeGreaterThan(0.3)

  // 返回问题航道 = 离开地表回到轨道：宇宙回来，地表阶段归 idle。
  await page.getByRole('button', { name: '返回问题航道' }).click()
  await expect.poll(async () => (await snapshot(page))?.resources.surfaceStage?.phase).toBe('idle')
  // 行星仍然选中（行星聚焦阶段背景增益按设计仍是 0），但行星本身必须重新画出来。
  await expect.poll(async () => (await snapshot(page))?.stellar.visibleQuestionPlanets ?? 0).toBeGreaterThan(0)
  await expect.poll(async () => (await snapshot(page))?.resources.surfaceStage?.chunkCount).toBe(0)
})


test('question planets and their orbits ride along with a drifting star', async ({ page }) => {
  // 恒星在绕星群中心走、还在上下浮动，镜头跟着恒星。行星与轨道盘必须同样跟着 ——
  // 冻结公转冻的只能是轨道相位，不能把恒星那一刻的位置也一起冻住。
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  await openStar(page)
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await snapshot(page))!.planet.selectedQuestionId).toBe('question:7')
  await expect.poll(async () => (await snapshot(page))!.stellar.approachProgress).toBe(1)

  const sample = async () => {
    const current = (await snapshot(page))!
    const star = current.stellar.projectedStars.find(({ starKey }) => starKey === current.stellar.focusedStarKey)!
    const planet = current.projectedBounds.selectedPlanet!
    return {
      frames: current.resources.actualRenderCount ?? 0,
      star: { x: star.core.x + star.core.width / 2, y: star.core.y + star.core.height / 2 },
      planet: { x: planet.x + planet.width / 2, y: planet.y + planet.height / 2, width: planet.width },
    }
  }
  // 先等到行星换成实体球并且真渲染过帧。
  await expect.poll(async () => (await sample()).planet.width, { timeout: 30_000 }).toBeGreaterThan(20)
  const first = await sample()
  await expect.poll(async () => (await sample()).frames, { timeout: 10_000 }).toBeGreaterThan(first.frames + 12)
  const second = await sample()
  process.stdout.write(`[ride-along] star ${JSON.stringify(first.star)} -> ${JSON.stringify(second.star)} planet ${JSON.stringify(first.planet)} -> ${JSON.stringify(second.planet)}\n`)
  // 镜头跟着恒星：恒星在屏幕上不动。
  expect(Math.hypot(second.star.x - first.star.x, second.star.y - first.star.y)).toBeLessThan(1.5)
  // 行星也必须不动 —— 它和轨道盘要跟着恒星一起走。
  expect(Math.hypot(second.planet.x - first.planet.x, second.planet.y - first.planet.y)).toBeLessThan(1.5)
})

test('a near miss on a question planet selects it instead of ejecting you to the universe', async ({ page }) => {
  await openBabylonUniverse(page)
  await expectReady(page)
  await openStar(page)
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await snapshot(page))!.planet.selectedQuestionId).toBe('question:7')

  // 等相机飞停：连续多次采样的投影一致才算稳。行星本身进了恒星系就已冻住，
  // 这里等的是机位，不是行星。
  // 只数**真的渲染过新帧**的采样：选中后渲染器可能空闲近一秒，其间投影是旧帧的
  // 3px 远景贴片；第一帧真渲染出来行星才换成 77px 的实体球。按墙钟采样会把那段
  // 空闲误判成「稳」，然后在换帧那一刻看到一次 30px 的「移动」。
  const sample = async () => {
    const current = (await snapshot(page))!
    return { bounds: current.projectedBounds.selectedPlanet!, frames: current.resources.actualRenderCount }
  }
  let previous = await sample()
  let stableRun = 0
  await expect.poll(async () => {
    const current = await sample()
    if (current.frames === previous.frames) return stableRun
    // 连续两帧接近不算稳：负载下缓动很慢，凑巧接近很常见。要求连续 6 帧。
    stableRun = Math.abs(current.bounds.x - previous.bounds.x) < 0.05
      && Math.abs(current.bounds.y - previous.bounds.y) < 0.05
      ? stableRun + 1 : 0
    previous = current
    return stableRun
  }, { timeout: 60_000, intervals: [120] }).toBeGreaterThanOrEqual(6)

  // 稳定之后行星必须真的不动 —— 这条闸的是「移动靶」本身。
  const bounds = (await sample()).bounds
  await page.waitForTimeout(700)
  const later = (await sample()).bounds
  expect(later.x).toBeCloseTo(bounds.x, 2)
  expect(later.y).toBeCloseTo(bounds.y, 2)
  // 稳定后的行星是实体球，不是远景贴片 —— 下面的「瞄偏 8px」才有意义。
  expect(bounds.width).toBeGreaterThan(20)

  // 瞄偏：点在行星边缘之外 8px。以前这会被判成空白点击并把人弹回全景。
  const centre = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 }
  await canvas(page).click({
    position: { x: centre.x + bounds.width / 2 + 8, y: centre.y },
    force: true,
  })
  const after = (await snapshot(page))!
  expect(after.stellar.focusedStarKey).not.toBeNull()
  expect(after.planet.selectedQuestionId).toBe('question:7')
})
