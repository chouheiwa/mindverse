// 提升前后对比报告。
//
//   node scripts/report-uplift.mjs <before-dir> <after-dir> [state|state=x,y,w,h ...]
//
// 逐状态解码「提升前」与「提升后」的 PNG，输出 upliftMetrics 的五项指标
// 以及它们的方向判定。
//
// **必须给窗口**：parity 截图是整页合成帧，右侧 React 面板与左下角问题航道
// 占了大量高对比像素，量整帧等于在量 UI 的文字边缘 —— 两边逐位相同，
// 于是所有指标都被稀释成 1.00×。`state=x,y,w,h` 指定一个**纯画布**窗口；
// 想量「主体可辨识性」时窗口还要落在主体**内部**：一个同时含黑背景和白恒星的
// 窗口，偏离均值的像素天然接近 100%，那个数不说明任何事。
//
// 不给窗口时退回 parity JSON 的 `selectedPlanetBounds`，再退回整帧。

import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { compareUplift, describeUpliftPng } from './upliftMetrics.mjs'

const STATES = ['panorama', 'focused-star', 'planet-focus']

async function readJsonOrNull(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'))
  } catch {
    return null
  }
}

function formatRow({ metric, before, after, ratio, direction, improved }) {
  const arrow = improved === null ? '·' : improved ? '↑' : '↓'
  const verdict = improved === null ? '中性' : improved ? '改善' : '退步'
  const ratioText = Number.isFinite(ratio) ? `${ratio.toFixed(2)}×` : '—'
  return `| ${metric} | ${before.toFixed(4)} | ${after.toFixed(4)} | ${ratioText} | ${arrow} ${verdict} (期望${direction === 'higher' ? '增' : direction === 'lower' ? '减' : '不限'}) |`
}

function parseStateArgument(argument) {
  const [state, window] = argument.split('=')
  if (!window) return { state, region: undefined }
  const parts = window.split(',').map(Number)
  if (parts.length !== 4 || parts.some((value) => !Number.isFinite(value))) {
    throw new TypeError(`window must be x,y,w,h — received "${window}"`)
  }
  const [x, y, width, height] = parts
  return { state, region: { x, y, width, height } }
}

async function main() {
  const [beforeDir, afterDir, ...requested] = process.argv.slice(2)
  if (!beforeDir || !afterDir) {
    throw new Error('usage: node scripts/report-uplift.mjs <before-dir> <after-dir> [state|state=x,y,w,h ...]')
  }
  const parsed = (requested.length > 0 ? requested : STATES).map(parseStateArgument)
  const states = parsed.map(({ state }) => state)
  const regionByState = new Map(parsed.map(({ state, region }) => [state, region]))
  const beforeDoc = await readJsonOrNull(resolve(beforeDir, 'babylon-parity-candidate.json'))
  const afterDoc = await readJsonOrNull(resolve(afterDir, 'babylon-parity-candidate.json'))

  for (const state of states) {
    const bounds = regionByState.get(state)
      ?? afterDoc?.states?.[state]?.selectedPlanetBounds
      ?? beforeDoc?.states?.[state]?.selectedPlanetBounds
      ?? undefined
    const [before, after] = await Promise.all([
      readFile(resolve(beforeDir, `babylon-parity-candidate-${state}.png`)),
      readFile(resolve(afterDir, `babylon-parity-candidate-${state}.png`)),
    ])
    const rows = compareUplift(
      describeUpliftPng(before, bounds),
      describeUpliftPng(after, bounds),
    )
    const window = bounds
      ? ` (window ${bounds.x},${bounds.y} ${bounds.width}×${bounds.height})`
      : ' (full frame)'
    process.stdout.write(`\n### ${state}${window}\n\n`)
    process.stdout.write('| 指标 | 提升前 | 提升后 | 比值 | 判定 |\n|---|---:|---:|---:|---|\n')
    for (const row of rows) process.stdout.write(`${formatRow(row)}\n`)
  }
}

main().catch((cause) => {
  process.stderr.write(`${cause instanceof Error ? cause.stack : String(cause)}\n`)
  process.exitCode = 1
})
