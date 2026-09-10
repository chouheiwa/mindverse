// 独立审计用的三轮关键交互稳定回归。
//
// 与 babylon-gate 的分散断言不同，这里把「点击 / 拖拽 / 滚轮 / 主动旋转 /
// 飞行 / 进入地层 / 打开标本 / 退出」串成一条完整旅程，连跑三轮，并在每一轮
// 之后比对资源计数 —— 目的不是覆盖率，是「长时间重复进出资源不增长」这一条。
import { expect, test, type Page } from '@playwright/test'
import { readFreshPixelStats } from '../src/starmap/renderReadback'
import { installStrataFixture } from './helpers/strataFixtureRoute'

test.describe.configure({ mode: 'serial' })
test.setTimeout(600_000)

const canvas = (page: Page) => page.locator('canvas[aria-label="认知宇宙三维星图"]')
const snapshot = (page: Page) => page.evaluate(() => window.__MINDVERSE_E2E__?.snapshot())

async function nonBackgroundRatio(page: Page): Promise<number> {
  const stats = await canvas(page).evaluate(readFreshPixelStats, 10)
  return stats.nonBackground / stats.total
}

async function expectReady(page: Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 60_000 })
  await expect.poll(async () => (await snapshot(page))?.renderReady).toBe(true)
}

async function openStar(page: Page) {
  await expect.poll(async () => (await snapshot(page))?.scene.firstStarX ?? null).not.toBeNull()
  const scene = (await snapshot(page))!.scene
  await canvas(page).click({ position: { x: scene.firstStarX!, y: scene.firstStarY! }, force: true })
  await expect(page.getByRole('heading', { name: 'Alpha' })).toBeVisible()
}

async function openQuestionWorkspace(page: Page, title: string) {
  await page.getByRole('button', { name: new RegExp(title) }).click()
  await page.getByLabel('问题行星入口', { exact: true }).getByRole('button', { name: '进入问题行星' }).click()
  await expect(page.getByRole('heading', { name: title })).toBeVisible()
}

async function enterStrata(page: Page) {
  await page.getByRole('button', { name: '打开答案地层' }).click()
  // SwiftShader 下 surface-approach → surface-crossing → strata-free 这段转场
  // 是墙钟驱动的，但软件渲染把每一帧拉得很长，整段要十几秒才走完。
  await expect.poll(async () => (await snapshot(page))?.scenePhase, { timeout: 40_000 }).toBe('strata-free')
}

async function exitStrata(page: Page) {
  await page.getByRole('button', { name: '返回行星表面' }).click()
  await expect.poll(async () => (await snapshot(page))?.scenePhase, { timeout: 40_000 }).toBe('universe')
}

// 开启动效之后相机是带阻尼的（interactionFeedback 给 0.88），转场结束之后
// 还会继续滑一小段。要比对「进出地层机位是否复原」，就必须先等它停下来 ——
// 否则量到的是一个还在动的中间态。
async function settledCamera(page: Page) {
  // 空闲时渲染循环会节流到 30fps，只比两次采样会在「刚好跳过一帧」时误判成
  // 停住了。所以要求连续 5 次读数完全一致，跨度约 0.6s —— 比节流周期长。
  let last: { a: number; b: number; d: number } | null = null
  let stable = 0
  await expect.poll(async () => {
    const scene = (await snapshot(page))!.scene
    const next = { a: scene.cameraAlpha!, b: scene.cameraBeta!, d: scene.cameraDistance }
    stable = last && Math.abs(last.a - next.a) < 1e-9 && Math.abs(last.b - next.b) < 1e-9
      && Math.abs(last.d - next.d) < 1e-9
      ? stable + 1
      : 0
    last = next
    return stable
  }, { timeout: 60_000, intervals: [120] }).toBeGreaterThanOrEqual(5)
  return (await snapshot(page))!.scene
}

async function holdKeyUntil(page: Page, key: string, predicate: () => Promise<boolean>) {
  await page.keyboard.down(key)
  try {
    await expect.poll(predicate, { timeout: 6_000, intervals: [20] }).toBe(true)
  } finally {
    await page.keyboard.up(key)
    const hud = page.getByRole('region', { name: '答案地层导航' })
    await hud.dispatchEvent('keyup', { code: `Key${key.toUpperCase()}`, key })
    await hud.blur()
    await page.waitForTimeout(60)
    await hud.focus()
  }
}

for (const motion of ['reduce', 'no-preference'] as const) {
test(`three full journeys keep every interaction working and release every resource (${motion})`, async ({ page }, testInfo) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`)
  })

  await installStrataFixture(page, {})
  await page.emulateMedia({ reducedMotion: motion })
  await page.goto('/universe.html')
  await expectReady(page)

  const rounds: Array<Record<string, number>> = []

  for (let round = 1; round <= 3; round += 1) {
    // --- 全景：星场 / 星云 / 尘埃必须已经在画面上 ---
    await expect.poll(async () => (await snapshot(page))?.scenePhase).toBe('universe')
    const panoramaCoverage = await nonBackgroundRatio(page)
    expect(panoramaCoverage, `round ${round} panorama is not black`).toBeGreaterThan(0.02)
    if (round === 1) {
      await testInfo.attach('round1-panorama.png', { body: await page.screenshot(), contentType: 'image/png' })
    }

    // --- 拖拽旋转：超过 6px 只旋转，不选中 ---
    const box = (await canvas(page).boundingBox())!
    const before = (await snapshot(page))!.scene
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.5)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width * 0.52, box.y + box.height * 0.42, { steps: 8 })
    await page.mouse.up()
    await expect
      .poll(async () => (await snapshot(page))!.scene.cameraAlpha !== before.cameraAlpha
        || (await snapshot(page))!.scene.cameraBeta !== before.cameraBeta)
      .toBe(true)
    expect((await snapshot(page))!.stellar.focusedStarKey, `round ${round} drag must not select`).toBeNull()

    // --- 滚轮：改变距离 ---
    const distanceBefore = (await snapshot(page))!.scene.cameraDistance
    await canvas(page).hover({ position: { x: box.width * 0.5, y: box.height * 0.5 } })
    await page.mouse.wheel(0, -320)
    await expect
      .poll(async () => (await snapshot(page))!.scene.cameraDistance !== distanceBefore)
      .toBe(true)

    // --- 点击恒星 → 飞行 → 聚焦 ---
    await openStar(page)
    await expect.poll(async () => (await snapshot(page))?.stellar.approachProgress, { timeout: 40_000 }).toBe(1)
    await expect.poll(async () => (await snapshot(page))?.resources.materializedPlanetCount).toBe(2)
    if (round === 1) {
      await testInfo.attach('round1-focused-star.png', { body: await page.screenshot(), contentType: 'image/png' })
    }

    // --- 进入问题行星 → 主动旋转 ---
    await openQuestionWorkspace(page, '固定地层问题')
    // 站在地表上：拖动是环视（相机注视点变），不再转行星。
    const stage = page.getByRole('region', { name: '行星地表' })
    const stageBounds = (await stage.boundingBox())!
    const lookBefore = (await snapshot(page))!.scene
    await page.mouse.move(stageBounds.x + stageBounds.width * 0.35, stageBounds.y + stageBounds.height * 0.45)
    await page.mouse.down()
    await page.mouse.move(stageBounds.x + stageBounds.width * 0.6, stageBounds.y + stageBounds.height * 0.33, { steps: 6 })
    await page.mouse.up()
    await expect.poll(async () => {
      const scene = (await snapshot(page))!.scene
      return Math.hypot(
        scene.cameraTargetX! - lookBefore.cameraTargetX!,
        scene.cameraTargetY! - lookBefore.cameraTargetY!,
        scene.cameraTargetZ! - lookBefore.cameraTargetZ!,
      )
    }).toBeGreaterThan(0)
    const entryCamera = await settledCamera(page)

    // --- 进入地层：宇宙退场，纵向地层可读 ---
    await enterStrata(page)
    const strataCoverage = await nonBackgroundRatio(page)
    expect(strataCoverage, `round ${round} strata is a world, not a black void`).toBeGreaterThanOrEqual(0.35)
    const hud = page.getByRole('region', { name: '答案地层导航' })
    await hud.focus()
    await holdKeyUntil(page, 's', async () => /strata-(free|snapped)/.test((await snapshot(page))?.scenePhase ?? ''))
    await holdKeyUntil(page, 'd', async () => Boolean((await snapshot(page))?.projectedBounds.answerSpecimens
      ?.some(({ room, bounds }) => room === 'main' && bounds)))
    if (round === 1) {
      await testInfo.attach('round1-strata.png', { body: await page.screenshot(), contentType: 'image/png' })
    }

    // --- 打开答案标本：文章入口可读 ---
    const mainSpecimen = async () => (await snapshot(page))!.projectedBounds.answerSpecimens!
      .find(({ room, bounds }) => room === 'main' && bounds)?.bounds ?? null
    let target = await mainSpecimen()
    await expect.poll(async () => {
      const next = await mainSpecimen()
      const settled = Boolean(target && next
        && Math.abs(target.x - next.x) < 0.5 && Math.abs(target.y - next.y) < 0.5)
      target = next
      return settled
    }, { timeout: 12_000 }).toBe(true)
    if (!target) throw new Error(`round ${round}: no answer specimen on screen`)
    await canvas(page).click({
      position: { x: target.x + target.width / 2, y: target.y + target.height / 2 },
      force: true,
    })
    const afterPick = (await snapshot(page))!
    console.log(`[audit] motion=${motion} round=${round} pick=${afterPick.lifecycle.lastPick} `
      + `phase=${afterPick.scenePhase} target=${JSON.stringify(target)} `
      + `specimens=${JSON.stringify(afterPick.projectedBounds.answerSpecimens?.map((entry) => (
        { room: entry.room, bounds: entry.bounds })))}`)
    expect(afterPick.lifecycle.lastPick, `round ${round} specimen pick`).toBe('specimen')
    const specimenDialog = page.getByRole('dialog', { name: /ANSWER SPECIMEN|固定答案/ })
    await expect(specimenDialog).toBeVisible()
    if (round === 1) {
      await testInfo.attach('round1-specimen.png', { body: await page.screenshot(), contentType: 'image/png' })
    }
    await page.getByRole('button', { name: '关闭答案证据板' }).click()

    // --- 退出：回到进入时的机位 ---
    await exitStrata(page)
    const restored = await settledCamera(page)
    // 关掉动效时转场是瞬时的，行星几乎没有沿轨道走，机位应当逐位复原。
    // 开着动效时这一整段旅程要走十几秒（SwiftShader），被选中的行星已经
    // 沿轨道移动了一段，镜头跟着它重新取景 —— 那不是「没复原」，是
    // 「复原到那颗行星现在的位置」。所以这里只在 reduce 下做逐位比对。
    console.log(`[audit] motion=${motion} round=${round} `
      + `entry d=${entryCamera.cameraDistance} a=${entryCamera.cameraAlpha} `
      + `| restored d=${restored.cameraDistance} a=${restored.cameraAlpha}`)
    if (motion === 'reduce') {
      expect(restored.cameraAlpha).toBeCloseTo(entryCamera.cameraAlpha!, 6)
      expect(restored.cameraBeta).toBeCloseTo(entryCamera.cameraBeta!, 6)
      expect(restored.cameraDistance).toBeCloseTo(entryCamera.cameraDistance, 6)
    } else {
      expect((await snapshot(page))!.scenePhase).toBe('universe')
    }

    // --- 一路退到全景 ---
    // 退出是分层的：行星 → 恒星系 → 全景，而且第一下 Escape 可能先被
    // 问题工作台的面板吃掉。所以按到真的回到全景为止，而不是固定按两下。
    for (let press = 0; press < 6; press += 1) {
      if ((await snapshot(page))?.stellar.focusedStarKey == null) break
      await page.keyboard.press('Escape')
      await page.waitForTimeout(500)
    }
    await expect.poll(async () => (await snapshot(page))?.stellar.focusedStarKey, { timeout: 20_000 }).toBeNull()
    await expect.poll(async () => (await snapshot(page))?.scenePhase, { timeout: 20_000 }).toBe('universe')

    const final = (await snapshot(page))!
    const heap = await page.evaluate(() => {
      const withMemory = performance as Performance & { memory?: { usedJSHeapSize: number } }
      return withMemory.memory?.usedJSHeapSize ?? 0
    })
    rounds.push({
      contexts: final.activeContextCount,
      rafLoops: final.lifecycle.rafLoops,
      listeners: final.lifecycle.listeners,
      geometries: final.memory.geometries,
      textures: final.memory.textures,
      planetCount: final.scene.planetCount,
      probeCount: final.scene.probeCount,
      nebulaShells: final.resources.nebulaShellCount ?? -1,
      starfieldShells: final.resources.starfieldShellCount ?? -1,
      starfieldPoints: final.resources.starfieldPointCount ?? -1,
      dust: final.resources.dustCount ?? -1,
      clusterRings: final.resources.clusterRingCount ?? -1,
      planetVisualConstructions: final.resources.planetVisualConstructions ?? -1,
      heapMB: Number((heap / 1048576).toFixed(1)),
      panoramaCoverage: Number(panoramaCoverage.toFixed(4)),
      strataCoverage: Number(strataCoverage.toFixed(4)),
    })
  }

  console.log('[audit] per-round resources:', JSON.stringify(rounds, null, 2))

  // 资源不增长：第三轮与第二轮必须逐项相同（第一轮含首次材质编译，不参与比对）。
  expect(rounds[2]!.contexts).toBe(1)
  expect(rounds[2]!.rafLoops).toBe(1)
  // 第一轮含首次材质编译与首次建层，不参与比对；第二、三轮必须逐项相同。
  for (const key of ['listeners', 'geometries', 'textures', 'planetCount', 'probeCount',
    'nebulaShells', 'starfieldShells', 'starfieldPoints', 'dust', 'clusterRings'] as const) {
    expect(rounds[2]![key], `${key} grew between round 2 and round 3`).toBe(rounds[1]![key])
  }
  expect(errors).toEqual([])
})
}
