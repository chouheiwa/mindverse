// Cross-renderer visual parity metrics.
//
// The migration gate used to compare four scalars pulled out of two frozen JSON
// files, so it could not see a renderer that had lost its background layers, its
// bloom, or its framing. This module derives its verdict from the pixels instead.
//
// Every metric is deliberately low-frequency:
//   * the structure grid averages thousands of pixels per tile,
//   * the tone bands are wide,
//   * chroma is measured on tile means, never per pixel.
// Per-pixel noise from a different GPU averages out below the tolerances, while
// a missing nebula, a collapsed glow skirt or a three-times-larger subject does
// not. That is the whole point: sensitive to composition, blind to dithering.

export const PARITY_STATE_NAMES = Object.freeze(['panorama', 'focused-star', 'planet-focus'])

/** Matches the non-background threshold the render baselines have always used. */
export const BACKGROUND_LEVEL = 12 / 255

export const GRID_COLUMNS = 16
export const GRID_ROWS = 9

/**
 * Tone bands, in luminance.
 *
 * `faint` is where nebula, dust and orbit rings live; `glow` is the bloom skirt
 * around a hot core. A renderer that drops either one keeps its bright pixels
 * and its black pixels and loses the band in between — which a single
 * non-background ratio cannot express.
 */
export const TONE_BAND_NAMES = Object.freeze(['background', 'faint', 'glow', 'bright', 'highlight'])
const BAND_EDGES = Object.freeze([BACKGROUND_LEVEL, 0.18, 0.55, 0.85])

export const DEFAULT_PARITY_TOLERANCE = Object.freeze({
  /** Largest allowed luminance drift on any single structure tile. */
  tileMax: 0.055,
  /** Allowed root-mean-square luminance drift across the whole grid. */
  tileRms: 0.022,
  /** Allowed drift on any single tone-band population ratio. */
  toneBand: 0.03,
  coverage: 0.03,
  /** Allowed relative drift of the subject's luminance-weighted radius. */
  subjectRadius: 0.22,
  /** Allowed subject centroid drift, as a fraction of the frame diagonal. */
  subjectCentroid: 0.035,
  chroma: 0.05,
})

function luminance(red, green, blue) {
  return red * 0.2126 + green * 0.7152 + blue * 0.0722
}

function assertFrame(frame) {
  if (!frame || typeof frame !== 'object') throw new TypeError('describeFrame expects a decoded frame')
  const { width, height, data } = frame
  if (!Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0) {
    throw new Error('describeFrame: invalid frame dimensions')
  }
  if (!data || data.length !== width * height * 4) {
    throw new Error(`describeFrame: pixel buffer holds ${data?.length ?? 0} bytes, expected ${width * height * 4}`)
  }
  return frame
}

function bandIndex(value) {
  let index = 0
  while (index < BAND_EDGES.length && value >= BAND_EDGES[index]) index += 1
  return index
}

/**
 * Reduces a decoded RGBA frame to a small, noise-tolerant description.
 *
 * @param {{ width: number, height: number, data: Uint8Array }} frame
 */
export function describeFrame(frame) {
  const { width, height, data } = assertFrame(frame)
  const pixelCount = width * height

  const tileRed = new Float64Array(GRID_COLUMNS * GRID_ROWS)
  const tileGreen = new Float64Array(GRID_COLUMNS * GRID_ROWS)
  const tileBlue = new Float64Array(GRID_COLUMNS * GRID_ROWS)
  const tileCount = new Float64Array(GRID_COLUMNS * GRID_ROWS)
  const bandCounts = new Float64Array(TONE_BAND_NAMES.length)

  let luminanceSum = 0
  let weightSum = 0
  let weightedX = 0
  let weightedY = 0

  for (let y = 0; y < height; y += 1) {
    const tileRow = Math.min(GRID_ROWS - 1, Math.floor(y * GRID_ROWS / height))
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const red = data[offset] / 255
      const green = data[offset + 1] / 255
      const blue = data[offset + 2] / 255
      const value = luminance(red, green, blue)

      const tile = tileRow * GRID_COLUMNS + Math.min(GRID_COLUMNS - 1, Math.floor(x * GRID_COLUMNS / width))
      tileRed[tile] += red
      tileGreen[tile] += green
      tileBlue[tile] += blue
      tileCount[tile] += 1

      bandCounts[bandIndex(value)] += 1
      luminanceSum += value

      const weight = value > BACKGROUND_LEVEL ? value - BACKGROUND_LEVEL : 0
      if (weight > 0) {
        weightSum += weight
        weightedX += weight * x
        weightedY += weight * y
      }
    }
  }

  const grid = new Array(GRID_COLUMNS * GRID_ROWS)
  let chromaWeight = 0
  let chromaSum = 0
  for (let tile = 0; tile < grid.length; tile += 1) {
    const count = Math.max(1, tileCount[tile])
    const red = tileRed[tile] / count
    const green = tileGreen[tile] / count
    const blue = tileBlue[tile] / count
    const tileLuminance = luminance(red, green, blue)
    grid[tile] = tileLuminance
    const chroma = Math.max(red, green, blue) - Math.min(red, green, blue)
    chromaWeight += tileLuminance
    chromaSum += tileLuminance * chroma
  }

  const centroidX = weightSum > 0 ? weightedX / weightSum : width / 2
  const centroidY = weightSum > 0 ? weightedY / weightSum : height / 2
  let spread = 0
  if (weightSum > 0) {
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4
        const value = luminance(data[offset] / 255, data[offset + 1] / 255, data[offset + 2] / 255)
        const weight = value > BACKGROUND_LEVEL ? value - BACKGROUND_LEVEL : 0
        if (weight <= 0) continue
        spread += weight * ((x - centroidX) ** 2 + (y - centroidY) ** 2)
      }
    }
    spread = Math.sqrt(spread / weightSum)
  }

  const shortEdge = Math.min(width, height)
  const toneBands = Object.fromEntries(
    TONE_BAND_NAMES.map((name, index) => [name, bandCounts[index] / pixelCount]),
  )

  return Object.freeze({
    width,
    height,
    gridColumns: GRID_COLUMNS,
    gridRows: GRID_ROWS,
    grid,
    toneBands: Object.freeze(toneBands),
    coverage: 1 - toneBands.background,
    luminanceMean: luminanceSum / pixelCount,
    chroma: chromaWeight > 0 ? chromaSum / chromaWeight : 0,
    subject: Object.freeze({
      centroidX: centroidX / width,
      centroidY: centroidY / height,
      radius: spread / shortEdge,
    }),
  })
}

function assertDescriptor(descriptor, label) {
  if (!descriptor || !Array.isArray(descriptor.grid) || !descriptor.toneBands) {
    throw new TypeError(`${label} is not a frame descriptor`)
  }
  return descriptor
}

function deviation(metric, referenceValue, candidateValue, delta, allowed) {
  return Object.freeze({
    metric,
    reference: referenceValue,
    candidate: candidateValue,
    delta,
    allowed,
    severity: delta / allowed,
  })
}

/**
 * Compares two frame descriptors captured at the same viewport.
 *
 * @returns {{ parity: boolean, deviations: readonly object[] }}
 */
export function compareFrameDescriptors(reference, candidate, options = {}) {
  assertDescriptor(reference, 'reference')
  assertDescriptor(candidate, 'candidate')
  if (reference.width !== candidate.width || reference.height !== candidate.height) {
    throw new Error(
      `frame parity: viewport mismatch, reference ${reference.width}x${reference.height} `
      + `vs candidate ${candidate.width}x${candidate.height}`,
    )
  }
  if (reference.grid.length !== candidate.grid.length) {
    throw new Error('frame parity: structure grids have different shapes')
  }
  const tolerance = { ...DEFAULT_PARITY_TOLERANCE, ...options.tolerance }
  const deviations = []

  let tileMax = 0
  let squareSum = 0
  let worstTile = -1
  for (let tile = 0; tile < reference.grid.length; tile += 1) {
    const drift = Math.abs(candidate.grid[tile] - reference.grid[tile])
    squareSum += drift * drift
    if (drift > tileMax) {
      tileMax = drift
      worstTile = tile
    }
  }
  const tileRms = Math.sqrt(squareSum / reference.grid.length)
  if (tileMax > tolerance.tileMax) {
    deviations.push(deviation(
      'structure:tileMax',
      reference.grid[worstTile],
      candidate.grid[worstTile],
      tileMax,
      tolerance.tileMax,
    ))
  }
  if (tileRms > tolerance.tileRms) {
    deviations.push(deviation('structure:tileRms', 0, tileRms, tileRms, tolerance.tileRms))
  }

  for (const band of TONE_BAND_NAMES) {
    if (band === 'background') continue
    const referenceRatio = reference.toneBands[band] ?? 0
    const candidateRatio = candidate.toneBands[band] ?? 0
    const drift = Math.abs(candidateRatio - referenceRatio)
    if (drift > tolerance.toneBand) {
      deviations.push(deviation(`toneBand:${band}`, referenceRatio, candidateRatio, drift, tolerance.toneBand))
    }
  }

  const coverageDrift = Math.abs(candidate.coverage - reference.coverage)
  if (coverageDrift > tolerance.coverage) {
    deviations.push(deviation('coverage', reference.coverage, candidate.coverage, coverageDrift, tolerance.coverage))
  }

  const referenceRadius = reference.subject.radius
  const candidateRadius = candidate.subject.radius
  const radiusDrift = referenceRadius > 1e-6
    ? Math.abs(candidateRadius / referenceRadius - 1)
    : Math.abs(candidateRadius - referenceRadius)
  if (radiusDrift > tolerance.subjectRadius) {
    deviations.push(deviation('subject:radius', referenceRadius, candidateRadius, radiusDrift, tolerance.subjectRadius))
  }

  const centroidDrift = Math.hypot(
    candidate.subject.centroidX - reference.subject.centroidX,
    candidate.subject.centroidY - reference.subject.centroidY,
  )
  if (centroidDrift > tolerance.subjectCentroid) {
    deviations.push(deviation(
      'subject:centroid',
      [reference.subject.centroidX, reference.subject.centroidY],
      [candidate.subject.centroidX, candidate.subject.centroidY],
      centroidDrift,
      tolerance.subjectCentroid,
    ))
  }

  const chromaDrift = Math.abs(candidate.chroma - reference.chroma)
  if (chromaDrift > tolerance.chroma) {
    deviations.push(deviation('chroma', reference.chroma, candidate.chroma, chromaDrift, tolerance.chroma))
  }

  deviations.sort((left, right) => right.severity - left.severity)
  return Object.freeze({ parity: deviations.length === 0, deviations: Object.freeze(deviations) })
}

/**
 * Compares the full captured state set. Every state in `PARITY_STATE_NAMES` must
 * be present on both sides — a missing capture is a gate failure, never a pass.
 */
export function compareVisualParitySets(reference, candidate, options = {}) {
  const states = PARITY_STATE_NAMES.map((name) => {
    if (!reference?.[name]) throw new Error(`frame parity: reference is missing state ${name}`)
    if (!candidate?.[name]) throw new Error(`frame parity: candidate is missing state ${name}`)
    const result = compareFrameDescriptors(reference[name], candidate[name], options)
    return Object.freeze({ name, parity: result.parity, deviations: result.deviations })
  })
  const failedStates = states.filter(({ parity }) => !parity).map(({ name }) => name)
  return Object.freeze({
    parity: failedStates.length === 0,
    states: Object.freeze(states),
    failedStates: Object.freeze(failedStates),
  })
}

/** Human-readable one-liner used by the CLI and by Playwright failure messages. */
export function formatDeviation({ metric, reference, candidate, delta, allowed }) {
  const format = (value) => Array.isArray(value)
    ? `[${value.map((part) => part.toFixed(4)).join(', ')}]`
    : typeof value === 'number' ? value.toFixed(4) : String(value)
  return `${metric}: reference ${format(reference)} vs candidate ${format(candidate)} `
    + `(drift ${delta.toFixed(4)} > allowed ${allowed.toFixed(4)})`
}
