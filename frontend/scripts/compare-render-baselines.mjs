import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const finite = (value, label) => {
  if (!Number.isFinite(value)) throw new Error(`render baseline: invalid ${label}`)
  return value
}

export function compareRenderBaselines(baseline, candidate) {
  if (baseline.rendererKind !== 'three' || candidate.rendererKind !== 'babylon') {
    throw new Error('render baseline: expected a Three baseline and Babylon candidate')
  }
  if (baseline.fixtureVersion !== candidate.fixtureVersion) throw new Error('render baseline: fixture mismatch')
  if (baseline.viewport?.width !== candidate.viewport?.width || baseline.viewport?.height !== candidate.viewport?.height) {
    throw new Error('render baseline: viewport mismatch')
  }
  if (finite(candidate.p95FrameTime, 'p95') > finite(baseline.p95FrameTime, 'p95') * 1.25) {
    throw new Error('render baseline: p95 frame time regressed over 25%')
  }
  if (finite(candidate.firstInteractiveMs, 'interactive') > finite(baseline.firstInteractiveMs, 'interactive') * 1.30) {
    throw new Error('render baseline: first interactive time regressed over 30%')
  }
  const left = baseline.selectedPlanetBounds
  const right = candidate.selectedPlanetBounds
  if (!left || !right) throw new Error('render baseline: selected object bounds missing')
  const centerDrift = Math.hypot(
    right.x + right.width / 2 - left.x - left.width / 2,
    right.y + right.height / 2 - left.y - left.height / 2,
  )
  if (centerDrift > Math.min(baseline.viewport.width, baseline.viewport.height) * 0.10) {
    throw new Error('render baseline: selected object center drift exceeds 10%')
  }
  if (Math.abs(finite(candidate.nonBackgroundRatio, 'non-background ratio')
    - finite(baseline.nonBackgroundRatio, 'non-background ratio')) > 0.20) {
    throw new Error('render baseline: non-background ratio drift exceeds 20%')
  }
  return { rendererKind: candidate.rendererKind, centerDrift }
}

async function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2)
  if (!baselinePath || !candidatePath) throw new Error('usage: compare-render-baselines <three.json> <babylon.json>')
  const [baseline, candidate] = await Promise.all([
    readFile(resolve(baselinePath), 'utf8').then(JSON.parse),
    readFile(resolve(candidatePath), 'utf8').then(JSON.parse),
  ])
  const result = compareRenderBaselines(baseline, candidate)
  process.stdout.write(`render baselines verified: ${result.rendererKind}; center drift ${result.centerDrift.toFixed(2)}px\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
