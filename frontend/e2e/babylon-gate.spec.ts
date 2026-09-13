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
  // 工作台是异步加载的：负载下它比地表的 walking 阶段晚一拍出现。「可见就点、不可见
  // 就跳过」在那一瞬间会直接跳过，然后白等 30 秒 —— 必须等按钮出现（或已自动进入地层）。
  await expect.poll(async () => (await trigger.isVisible().catch(() => false))
    || /strata/.test((await snapshot(page))?.scenePhase ?? ''), { timeout: 20_000 }).toBe(true)
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
  // 环视改的是地表姿态，相机要到下一帧才跟上；SwiftShader 一帧上百毫秒，这里必须等
  // 相机在两个真渲染帧之间不再变化，否则记下的「入口机位」是半路的。
  let settled = (await snapshot(page))!
  await expect.poll(async () => {
    const next = (await snapshot(page))!
    const same = next.resources.actualRenderCount! > settled.resources.actualRenderCount!
      && next.scene.cameraAlpha === settled.scene.cameraAlpha
      && next.scene.cameraBeta === settled.scene.cameraBeta
      && next.scene.cameraTargetX === settled.scene.cameraTargetX
    settled = next
    return same
  }, { timeout: 15_000, intervals: [100] }).toBe(true)
  const entryCamera = settled.scene
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

test('at planet focus a drag walks you around the planet, and the planet turns on its own', async ({ page }) => {
  // 之前拖动转的是行星网格：太阳在世界空间固定，明暗与轮廓一点不变，只有表面花纹在滑 ——
  // 读起来就是「纹理跟着我转，但星球没动」。松开手它又完全静止（选中时公转是冻住的）。
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  await openStar(page)
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await expect.poll(async () => (await snapshot(page))!.planet.selectedQuestionId).toBe('question:7')
  await expect.poll(async () => (await snapshot(page))!.stellar.approachProgress).toBe(1)
  await expect.poll(async () => (await snapshot(page))!.planet.rotation !== null).toBe(true)

  // 自转：不碰任何输入，行星的姿态也要变。
  const spinBefore = (await snapshot(page))!.planet.rotation!
  await expect.poll(async () => {
    const now = (await snapshot(page))!.planet.rotation!
    return now.some((value, index) => Math.abs(value - spinBefore[index]!) > 1e-4)
  }, { timeout: 20_000, intervals: [200] }).toBe(true)

  // 不碰任何输入时，跟着行星走的卡片不许抖。
  //
  // 注意这条在 SwiftShader 上抓不到真正的回归：抖动来自「rAF 60fps 采样 vs 渲染节流到
  // 30fps」的拍频 —— 有些帧拿的是上一次渲染留下的视图矩阵，配这一帧已经前进的行星位置，
  // 锚点于是在两簇值之间跳（Metal 实测 641.46/642.17，肉眼可见）。SwiftShader 一帧上百
  // 毫秒，拍频不成立，去掉修复它照样绿。修复本身是在 Metal 上实测的：抖动 1.4px → 0。
  // 留着它是防更粗的回归（锚点接错东西），不是防那个拍频。
  await expect.poll(async () => (await snapshot(page))!.lifecycle.focusState, { timeout: 20_000 }).toBe('focused')
  await page.waitForTimeout(400)
  const anchors: number[] = []
  for (let sample = 0; sample < 14; sample += 1) {
    const box = await page.locator('.qpc').boundingBox()
    if (box) anchors.push(box.x)
    await page.waitForTimeout(90)
  }
  expect(anchors.length).toBeGreaterThan(8)
  const jitter = Math.max(...anchors) - Math.min(...anchors)
  process.stdout.write(`[anchor] jitter ${jitter.toFixed(3)} over ${anchors.length} samples\n`)
  expect(jitter).toBeLessThan(0.25)

  // 拖动：转的是相机绕行星的方位角，不是网格。
  const before = (await snapshot(page))!.scene
  await canvas(page).hover({ position: { x: 400, y: 360 } })
  await page.mouse.down()
  await page.mouse.move(640, 360, { steps: 10 })
  await page.mouse.up()
  const after = (await snapshot(page))!.scene
  const settled = (await snapshot(page))!
  const bounds = settled.projectedBounds.selectedPlanet!
  process.stdout.write(`[orbit] alpha ${before.cameraAlpha} -> ${after.cameraAlpha} orbitCalls ${settled.lifecycle.orbitCalls} bounds ${JSON.stringify(bounds)}\n`)
  // 环绕归聚焦控制器独占。若它没接手，Babylon 自带的指针环绕会和它各转一遍。
  expect(settled.lifecycle.orbitCalls!).toBeGreaterThan(0)
  const swing = Math.abs(after.cameraAlpha! - before.cameraAlpha!)
  expect(swing).toBeGreaterThan(0.05)
  // 240px 的拖动只该转约 1.2 弧度。被 Babylon 自带的环绕叠一遍就是 3 倍速 ——
  // 实测拖 320px 相机绕了 4.6 弧度（265°），恒星甩满半屏、行星飞出画面。
  expect(swing).toBeLessThan(1.8)
  // 行星始终被框住：绕着它走，它就该一直在画面里、大小不变。
  expect(bounds.x).toBeGreaterThan(0)
  expect(bounds.x).toBeLessThan(1280)
  expect(bounds.y).toBeGreaterThan(0)
  expect(bounds.y).toBeLessThan(720)
  // 俯仰始终离极点有余量，否则上向量会翻面、画面猛跳。
  expect(after.cameraBeta!).toBeGreaterThan(0.07)
  expect(after.cameraBeta!).toBeLessThan(Math.PI - 0.07)
})

test('entering a question planet is a descent you can watch, not a freeze then a cut', async ({ page }) => {
  // 实测（Metal 真机，rAF 采样 472 帧）：修复前进入那一帧 2086.5ms，其余 <= 14.2ms —— 同一帧
  // 建了 303 个地形块。墙钟在卡顿期间照走，卡完之后 8 次渲染就把 1100ms 的俯冲放完。
  // 用户看到的是「卡一下，然后直接切过去」。这条门禁钉住两件事：单帧不再一次建一大批块，
  // 俯冲真的跨了很多帧。
  await openBabylonUniverse(page, '', 'no-preference')
  await expectReady(page)
  await openStar(page)
  await page.getByRole('button', { name: /固定地层问题/ }).click()
  await page.getByLabel('问题行星入口', { exact: true }).getByRole('button', { name: '进入问题行星' }).click()

  let builtPeak = 0
  const descents: number[] = []
  let started = false
  await expect.poll(async () => {
    const stage = (await snapshot(page))?.resources.surfaceStage
    if (!stage) return 'idle'
    builtPeak = Math.max(builtPeak, stage.builtThisUpdate)
    if (stage.descentStarted) started = true
    if (stage.phase === 'descending') descents.push(stage.descent)
    return stage.phase
  }, { timeout: 60_000, intervals: [40] }).toBe('walking')

  const distinct = [...new Set(descents)]
  process.stdout.write(`[descent] builtPeak ${builtPeak} distinct ${distinct.length} samples ${descents.length}\n`)
  expect(started).toBe(true)
  // 一帧只建限量的块 —— 303 块挤一帧正是那 2086ms。
  expect(builtPeak).toBeLessThanOrEqual(12)
  // 俯冲要跨过很多帧。修复前只有 8 个不同进度值，而且全挤在卡顿之后的 115ms 里。
  expect(distinct.length).toBeGreaterThanOrEqual(12)
  // 进度只增不减，最后走到 1。
  for (let index = 1; index < descents.length; index += 1) {
    expect(descents[index]!).toBeGreaterThanOrEqual(descents[index - 1]!)
  }
})

test('the planet stage has no universe left in it', async ({ page }) => {
  // 地表材质是自定义着色器：编译失败时 Babylon 只在控制台报错，画面静默全黑。
  const effectErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error' && /compiling effect|compile effect/i.test(message.text())) effectErrors.push(message.text())
  })
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
  expect(effectErrors).toEqual([])
  // 落点旁就是你留下的痕迹（夹具里有你创作的回答 → 旗）：在视野里、可点、点开证据板。
  expect(surface.markCount!).toBeGreaterThan(0)
  const marks = atPlanet.projectedBounds.surfaceMarks ?? []
  process.stdout.write(`[surface] marks ${JSON.stringify(marks)}\n`)
  // 「在画面内」不够：扇面偏 40° 时旗的落点投在 x=117、旗面左缘约 69px，整面旗挤在画面最外侧
  // 13% 里贴着边缘，这条门禁照样绿。要求落点离两侧各留 140px，贴边就红（偏 24° 时投在 x=362）。
  const onScreen = marks.filter(({ x, y }) => x > 140 && x < 1140 && y > 0 && y < 720)
  expect(onScreen.length).toBeGreaterThan(0)
  await page.mouse.click(onScreen[0]!.x, onScreen[0]!.y - 6)
  await expect(page.getByRole('button', { name: '关闭答案证据板' })).toBeVisible()
  await page.getByRole('button', { name: '关闭答案证据板' }).click()

  // 地上一条小径指向下一站：夹具里你 2025.12 在「固定地层问题」留下痕迹、2026.01 去了「当前表层问题」。
  expect(atPlanet.resources.surfaceStage!.trailSteps!).toBeGreaterThan(0)
  const signpost = (await snapshot(page))!.projectedBounds.surfaceSignpost
  process.stdout.write(`[surface] signpost ${JSON.stringify(signpost)}\n`)
  expect(signpost).not.toBeNull()
  expect(signpost!.text).toMatch(/^2026\.01 你从这里去了 → 《当前表层问题》$/)

  // 天上挂着同恒星系的邻居（夹具里另一个问题「当前表层问题」）。
  const surfaceNow = (await snapshot(page))!
  expect(surfaceNow.resources.surfaceStage!.beaconCount!).toBeGreaterThan(0)
  const beacons = surfaceNow.projectedBounds.surfaceBeacons ?? []
  process.stdout.write(`[surface] beacons ${JSON.stringify(beacons)}\n`)
  expect(beacons.some(({ kind }) => kind === 'planet')).toBe(true)
  // 落地朝向天上第一个邻居；点它就飞过去，落到它的地表上。
  const neighbour = beacons.find(({ kind }) => kind === 'planet')!
  expect(neighbour.x).toBeGreaterThan(0)
  expect(neighbour.x).toBeLessThan(1280)
  expect(neighbour.y).toBeGreaterThan(0)
  expect(neighbour.y).toBeLessThan(360)
  await page.mouse.click(neighbour.x, neighbour.y)
  await expect(page.getByRole('heading', { name: '当前表层问题' })).toBeVisible()
  await expect.poll(async () => (await snapshot(page))?.resources.surfaceStage?.phase, { timeout: 30_000 }).toBe('walking')
  await expect.poll(async () => (await snapshot(page))?.planet.selectedQuestionId).toBe('question:8')
  // 回到原来那颗，后面的断言接着用它。落地朝向它，但投影要等到落地后的第一帧。
  let back: { x: number; y: number } | null = null
  await expect.poll(async () => {
    const list = (await snapshot(page))?.projectedBounds.surfaceBeacons ?? []
    process.stdout.write(`[surface] beacons@8 ${JSON.stringify(list)}\n`)
    back = list.find(({ label }) => label === '固定地层问题') ?? null
    return back !== null
  }, { timeout: 10_000, intervals: [200] }).toBe(true)
  await page.mouse.click(back!.x, back!.y)
  await expect(page.getByRole('heading', { name: '固定地层问题' })).toBeVisible()
  await expect.poll(async () => (await snapshot(page))?.resources.surfaceStage?.phase, { timeout: 30_000 }).toBe('walking')

  // 资料默认折成小卡，阅读面板不挡地表；按 I 铺开，Esc 折回。
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await page.keyboard.press('i')
  await expect(page.getByRole('tab', { name: '我的证据轨迹' })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('tablist')).toHaveCount(0)
  await expect(page.getByRole('region', { name: '问题资料卡' })).toBeVisible()
  // 相机得真的站在地上：注视点在眼前半个半径处；被宇宙的 1.2 机位下限夹住时
  // 相机悬在星球外一米多，这个距离会是 1.2。
  expect(surface.cameraTargetDistance!).toBeLessThan(surface.groundRadius)
  expect(surface.lightCount!).toBeGreaterThanOrEqual(1)
  // 落点得在白天那一面：正对镜头的一面是夜面（恒星在行星背后），实测太阳高度角余弦 −0.73。
  expect(surface.sunElevation!).toBeGreaterThan(0.3)
  // 落地朝向天上的邻居时可能抬着头；像素剖面按「看着地面」量，先低头。
  await page.keyboard.down('q')
  await page.waitForTimeout(500)
  await page.keyboard.up('q')
  await page.waitForTimeout(200)
  const lit = await nonBackgroundRatio(page)
  process.stdout.write(`[surface] nonBackground ${lit.toFixed(4)}\n`)
  const profile = await canvas(page).evaluate(readFreshLuminanceProfile, 12)
  process.stdout.write(`[surface] bands ${profile.bands.map((value) => value.toFixed(4)).join(',')} contrast ${profile.contrast.map((value) => value.toFixed(4)).join(',')}\n`)
  expect(lit).toBeGreaterThan(0.3)
  // 抬头得是白天的天，不是黑洞：最上面一带亮度。修复前 0.0104。
  expect(profile.bands[0]!).toBeGreaterThan(0.10)
  // 脚下得有岩理，不是一片平灰：最下面一带的像素对比度。修复前素色 StandardMaterial ≈ 0.003。
  expect(profile.contrast[profile.contrast.length - 1]!).toBeGreaterThan(0.02)

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
  // 必须等聚焦过渡走完：entering 期间相机还在飞向行星，采到的位置是半路的
  // （实测偶发 38.9px 的位移，单跑复现不出来）。
  await expect.poll(async () => (await snapshot(page))!.lifecycle.focusState, { timeout: 20_000 }).toBe('focused')

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
  const gap = (s: Awaited<ReturnType<typeof sample>>) =>
    Math.hypot(s.planet.x - s.star.x, s.planet.y - s.star.y)
  process.stdout.write(`[ride-along] gap ${gap(first).toFixed(1)} -> ${gap(second).toFixed(1)} planet ${JSON.stringify(second.planet)}\n`)
  // 相机锁着选中的行星，所以它在屏幕上定住；恒星则因为公转在画面里缓缓移动。
  expect(Math.hypot(second.planet.x - first.planet.x, second.planet.y - first.planet.y)).toBeLessThan(1.5)
  // 真正要钉的是「行星没有被恒星甩下」：两者的屏幕间距始终是这条轨道该有的量级。
  // 修复前恒星位置用了冻结时钟，镜头带着恒星飞走、行星留在原地，间距会一路发散。
  expect(gap(first)).toBeGreaterThan(0)
  expect(gap(second)).toBeGreaterThan(0)
  expect(Math.abs(gap(second) - gap(first))).toBeLessThan(gap(first) * 0.35)
  // 行星始终在画面里。
  expect(second.planet.x).toBeGreaterThan(0)
  expect(second.planet.x).toBeLessThan(1280)
  expect(second.planet.y).toBeGreaterThan(0)
  expect(second.planet.y).toBeLessThan(720)
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
