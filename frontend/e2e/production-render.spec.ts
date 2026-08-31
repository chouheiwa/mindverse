import { expect, test } from '@playwright/test'
import { installUniverseFixture } from './helpers/fixtureRoute'

// Each case owns a real WebGL context; concurrent Chromium software renderers are unstable in CI.
test.describe.configure({ mode: 'serial' })

async function openProductionUniverse(page: import('@playwright/test').Page, suffix = '') {
  await page.goto('/' + suffix)
  const demoButton = page.getByRole('button', { name: '先看示例宇宙' })
  await expect(demoButton).toBeVisible({ timeout: 15_000 })
  await Promise.all([
    page.waitForURL(/\/universe\.html/, { timeout: 15_000 }),
    demoButton.click({ timeout: 15_000 }),
  ])
}

async function expectRendererReady(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('universe-root')).toHaveAttribute('data-render-state', 'ready', { timeout: 15_000 })
}

test('production universe imports Renderer without a page error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installUniverseFixture(page)

  await openProductionUniverse(page)

  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  await expect.poll(async () => {
    if (errors.length > 0) return `page errors: ${errors.join(' | ')}`
    if (await canvas.count() === 0) return 'canvas absent'
    const size = await canvas.evaluate((node: HTMLCanvasElement) => ({
      width: node.width,
      height: node.height,
    }))
    return size.width > 300 && size.height > 150
      ? 'renderer ready'
      : `canvas backing store: ${size.width}x${size.height}`
  }, { timeout: 15_000 }).toBe('renderer ready')

  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  expect(errors).toEqual([])
})

test('a failed Renderer chunk uses reload recovery and the second request becomes ready', async ({ page }) => {
  await installUniverseFixture(page)
  let rendererRequests = 0
  await page.route(/\/assets\/Renderer-[^/]+\.js$/, async (route) => {
    rendererRequests += 1
    if (rendererRequests === 1) {
      await route.fulfill({ status: 503, contentType: 'text/javascript', body: 'unavailable' })
    } else {
      await route.continue()
    }
  })

  await openProductionUniverse(page)
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)
  expect(rendererRequests).toBeGreaterThanOrEqual(2)
})

test('WebGL context creation failure remounts the renderer on the same page', async ({ page }) => {
  await installUniverseFixture(page)
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext
    ;(window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail = true
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...args: unknown[]) {
      if ((type === 'webgl' || type === 'webgl2')
        && (window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail) return null
      return original.call(this, type, ...args as [])
    } as typeof HTMLCanvasElement.prototype.getContext
  })

  await openProductionUniverse(page)
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  await page.evaluate(() => { (window as typeof window & { __e2eWebglFail?: boolean }).__e2eWebglFail = false })
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)
  await expect(page).toHaveURL(/\/universe\.html$/)
})

test('one-shot shader failure remounts on the same page and becomes ready', async ({ page }) => {
  await installUniverseFixture(page)
  await page.goto('/universe.html?e2eShaderFail=once')
  await expect(page.getByRole('heading', { name: '3D 星图暂时不可用' })).toBeVisible()
  await page.getByRole('button', { name: '重试 3D' }).click()
  await expectRendererReady(page)
  await expect(page).toHaveURL(/e2eShaderFail=once/)
})
