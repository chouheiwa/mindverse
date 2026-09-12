import { chromium } from '@playwright/test'
import { spawn } from 'node:child_process'
const root = process.cwd() + '/..'
const PORT = '14350'
const server = spawn('go', ['run', './cmd/server'], { cwd: root, env: { ...process.env, PORT, MINDVERSE_SOURCE: 'mock', MINDVERSE_WEB_DIR: root + '/.e2e-web', MINDVERSE_SNAPSHOT_DIR: process.env.CLAUDE_JOB_DIR + '/tmp/snapT' }, stdio: ['ignore', 'ignore', 'ignore'] })
await new Promise((r) => setTimeout(r, 5000))
const browser = await chromium.launch({ headless: false, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 810 } })
await page.emulateMedia({ reducedMotion: 'no-preference' })
await page.goto(`http://127.0.0.1:${PORT}/universe.html`)
const skip = page.getByRole('button', { name: /跳过/ })
if (await skip.isVisible({ timeout: 8000 }).catch(() => false)) await skip.click()
await page.waitForFunction(() => window.__MINDVERSE_E2E__?.snapshot().renderReady === true, null, { timeout: 60000 })
const first = await page.evaluate(() => { const s = window.__MINDVERSE_E2E__.snapshot().scene; return [s.firstStarX, s.firstStarY] })
await page.mouse.click(first[0], first[1])
await page.waitForFunction(() => window.__MINDVERSE_E2E__?.snapshot().stellar.focusedStarKey !== null, null, { timeout: 20000 })
await page.waitForTimeout(2500)
await page.getByRole('button', { name: '进入问题行星' }).first().click()
await page.waitForFunction(() => window.__MINDVERSE_E2E__?.snapshot().resources.surfaceStage?.phase === 'walking', null, { timeout: 30000 })
await page.waitForTimeout(2000)
const state = () => page.evaluate(() => { const s = window.__MINDVERSE_E2E__.snapshot(); const sc = s.scene; return {
  pos: [sc.cameraTargetX, sc.cameraTargetY, sc.cameraTargetZ].map((v) => Math.round(v*1e4)/1e4),
  up: (sc.cameraUp||[]).map((v) => Math.round(v*1e4)/1e4),
  alpha: Math.round((sc.cameraAlpha??0)*1e4)/1e4, beta: Math.round((sc.cameraBeta??0)*1e4)/1e4, dist: Math.round(sc.cameraDistance*1e5)/1e5,
  beacons: (s.projectedBounds.surfaceBeacons||[]).slice(0,3).map((b) => [b.label, Math.round(b.x), Math.round(b.y)]),
  sign: s.projectedBounds.surfaceSignpost ? [Math.round(s.projectedBounds.surfaceSignpost.x), Math.round(s.projectedBounds.surfaceSignpost.y)] : null,
  marks: (s.projectedBounds.surfaceMarks||[]).slice(0,2).map((m) => [Math.round(m.x), Math.round(m.y)]),
} })
const stage = await page.locator('.qw-planet-stage').boundingBox()
console.log('S0', JSON.stringify(await state()))
await page.screenshot({ path: process.env.CLAUDE_JOB_DIR + '/tmp/turn-0.png' })
for (const [i, dx] of [[1, 260], [2, 260]]) {
  await page.mouse.move(stage.x + 300, stage.y + 400)
  await page.mouse.down()
  await page.mouse.move(stage.x + 300 + dx, stage.y + 400, { steps: 12 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  console.log('S' + i, JSON.stringify(await state()))
  await page.screenshot({ path: process.env.CLAUDE_JOB_DIR + `/tmp/turn-${i}.png` })
}
await browser.close(); server.kill()
