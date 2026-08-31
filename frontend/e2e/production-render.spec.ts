import { expect, test } from '@playwright/test'
import { installUniverseFixture } from './helpers/fixtureRoute'

test('production universe imports Renderer without a page error', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await installUniverseFixture(page)

  await page.goto('/')
  await page.getByRole('button', { name: '先看示例宇宙' }).click()

  const canvas = page.locator('canvas[aria-label="认知宇宙三维星图"]')
  await expect(canvas).toBeVisible()
  await expect.poll(async () => {
    if (errors.length > 0) return `page errors: ${errors.join(' | ')}`
    const size = await canvas.evaluate((node: HTMLCanvasElement) => ({
      width: node.width,
      height: node.height,
    }))
    return size.width > 300 && size.height > 150
      ? 'renderer ready'
      : `canvas backing store: ${size.width}x${size.height}`
  }, { timeout: 10_000 }).toBe('renderer ready')

  await page.evaluate(() => new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  }))
  expect(errors).toEqual([])
})
