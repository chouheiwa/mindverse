import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

export const STELLAR_BASELINE_SCHEMA = 'babylon-stellar-baseline.v1'
export const STELLAR_STATE_NAMES = Object.freeze([
  'panorama', 'approach-midpoint', 'focused-star', 'planet-focus',
])

const PERFORMANCE_QUALITIES = Object.freeze(['medium', 'low'])
const ABSOLUTE_BUDGETS = Object.freeze({ medium: 20, low: 33.3 })

function finite(value, label) {
  if (!Number.isFinite(value)) throw new Error(`render baseline: invalid ${label}`)
  return value
}

function validateState(name, state) {
  if (!state) throw new Error(`render baseline: missing state ${name}`)
  const core = finite(state.corePixelDiameter, `${name} core diameter`)
  const halo = finite(state.haloPixelDiameter, `${name} halo diameter`)
  const nonBackground = finite(state.nonBackgroundRatio, `${name} non-background ratio`)
  const variance = finite(state.luminanceVariance, `${name} luminance variance`)
  const clippedWhite = finite(state.clippedWhiteRatio, `${name} clipped-white ratio`)
  if (core <= 0 || halo < Math.max(6, core * 1.2)) {
    throw new Error(`render baseline: point-only radius in ${name}`)
  }
  if (nonBackground < 0.001 && variance < 0.00001) {
    throw new Error(`render baseline: black frame in ${name}`)
  }
  if (clippedWhite > 0.08) throw new Error(`render baseline: blown-white frame in ${name}`)
  if (!state.camera || !state.presentation) throw new Error(`render baseline: missing camera/presentation state in ${name}`)
}

function validatePerformance(baseline, candidate) {
  for (const quality of PERFORMANCE_QUALITIES) {
    const reference = baseline.performance?.[quality]
    const measured = candidate.performance?.[quality]
    if (!reference || !measured) throw new Error(`render baseline: missing ${quality} performance state`)
    const referenceP95 = finite(reference.p95FrameTime, `${quality} baseline p95`)
    const candidateP95 = finite(measured.p95FrameTime, `${quality} candidate p95`)
    if (!Number.isInteger(measured.sampleCount) || measured.sampleCount <= 0) {
      throw new Error(`render baseline: invalid ${quality} sample count`)
    }
    if (candidateP95 > ABSOLUTE_BUDGETS[quality]) {
      throw new Error(`render baseline: absolute ${quality} p95 budget exceeded`)
    }
    if (candidateP95 > referenceP95 * 1.2) {
      throw new Error(`render baseline: ${quality} p95 regressed over 20%`)
    }
  }
}

export function compareRenderBaselines(baseline, candidate) {
  if (baseline.schemaVersion === undefined && candidate.schemaVersion === undefined) {
    return compareLegacyMigrationPair(baseline, candidate)
  }
  if (baseline.schemaVersion !== STELLAR_BASELINE_SCHEMA
    || candidate.schemaVersion !== STELLAR_BASELINE_SCHEMA) {
    throw new Error(`render baseline: schema must be ${STELLAR_BASELINE_SCHEMA}`)
  }
  if (candidate.rendererKind !== 'babylon') throw new Error('render baseline: expected Babylon candidate')
  if (baseline.fixtureVersion !== candidate.fixtureVersion) throw new Error('render baseline: fixture mismatch')
  if (baseline.viewport?.width !== candidate.viewport?.width
    || baseline.viewport?.height !== candidate.viewport?.height
    || baseline.viewport?.deviceScaleFactor !== candidate.viewport?.deviceScaleFactor) {
    throw new Error('render baseline: viewport mismatch')
  }
  for (const name of STELLAR_STATE_NAMES) {
    validateState(name, baseline.states?.[name])
    validateState(name, candidate.states?.[name])
  }
  validatePerformance(baseline, candidate)
  return { rendererKind: candidate.rendererKind, states: [...STELLAR_STATE_NAMES] }
}

function compareLegacyMigrationPair(baseline, candidate) {
  if (baseline.rendererKind !== 'three' || candidate.rendererKind !== 'babylon') {
    throw new Error('render baseline: expected a Three baseline and Babylon candidate')
  }
  if (baseline.fixtureVersion !== candidate.fixtureVersion) throw new Error('render baseline: fixture mismatch')
  if (baseline.viewport?.width !== candidate.viewport?.width || baseline.viewport?.height !== candidate.viewport?.height) {
    throw new Error('render baseline: viewport mismatch')
  }
  if (finite(candidate.p95FrameTime, 'p95') > finite(baseline.p95FrameTime, 'p95') * 1.2) {
    throw new Error('render baseline: p95 frame time regressed over 20%')
  }
  if (finite(candidate.firstInteractiveMs, 'interactive') > finite(baseline.firstInteractiveMs, 'interactive') * 1.3) {
    throw new Error('render baseline: first interactive time regressed over 30%')
  }
  const left = baseline.selectedPlanetBounds
  const right = candidate.selectedPlanetBounds
  if (!left || !right) throw new Error('render baseline: selected object bounds missing')
  const centerDrift = Math.hypot(
    right.x + right.width / 2 - left.x - left.width / 2,
    right.y + right.height / 2 - left.y - left.height / 2,
  )
  if (centerDrift > Math.min(baseline.viewport.width, baseline.viewport.height) * 0.1) {
    throw new Error('render baseline: selected object center drift exceeds 10%')
  }
  if (Math.abs(finite(candidate.nonBackgroundRatio, 'non-background ratio')
    - finite(baseline.nonBackgroundRatio, 'non-background ratio')) > 0.2) {
    throw new Error('render baseline: non-background ratio drift exceeds 20%')
  }
  return { rendererKind: candidate.rendererKind, states: [], centerDrift }
}

async function main() {
  const [baselinePath, candidatePath] = process.argv.slice(2)
  if (!baselinePath || !candidatePath) throw new Error('usage: compare-render-baselines <baseline.json> <candidate.json>')
  const [baseline, candidate] = await Promise.all([
    readFile(resolve(baselinePath), 'utf8').then(JSON.parse),
    readFile(resolve(candidatePath), 'utf8').then(JSON.parse),
  ])
  const result = compareRenderBaselines(baseline, candidate)
  process.stdout.write(`render baselines verified: ${result.rendererKind}; states ${result.states.join(', ')}\n`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
