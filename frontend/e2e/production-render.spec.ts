import { expect, test } from '@playwright/test'
import { installUniverseFixture } from './helpers/fixtureRoute'

test('production universe imports Renderer without a page error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installUniverseFixture(page)

  await page.goto('/')
  const demoButton = page.getByRole('button', { name: '先看示例宇宙' })
  await expect(demoButton).toBeVisible({ timeout: 15_000 })
  await Promise.all([
    page.waitForURL(/\/universe\.html$/, { timeout: 15_000 }),
    demoButton.click({ timeout: 15_000 }),
  ])

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
