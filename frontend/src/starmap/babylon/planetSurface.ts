export type ThermalState = 'magma' | 'desert' | 'rock' | 'tundra' | 'ice'

export type ThermalWeights = Readonly<Record<ThermalState, number>>

export interface PlanetSurfaceEvidence {
  readonly questionId: string
  readonly starId: string
  readonly answerCount: number
  readonly timeSpan: number | null
  readonly freshness: number
  readonly created: boolean
  readonly collected: boolean
  readonly normalizedStarEnergy: number
  readonly normalizedOrbitDistance: number
}

export interface PlanetSurfaceDescriptor {
  readonly metadata: Readonly<{ questionId: string; starId: string }>
  readonly seed: number
  readonly radius: number
  readonly craterCount: number
  readonly detailDensity: number
  readonly faultStrength: number
  readonly atmosphere: number
  readonly createdGlow: 0 | 1
  readonly collectedMarker: 0 | 1
  readonly incident: number
  readonly thermal: ThermalWeights
}

const EPSILON = 1e-6
const ANSWER_REFERENCE = Math.log1p(30)
const TIME_REFERENCE_DAYS = Math.log1p(3650)
const THERMAL_CENTERS = Object.freeze([
  ['magma', 1.4],
  ['desert', 0.8],
  ['rock', 0.42],
  ['tundra', 0.2],
  ['ice', 0.06],
] as const)

export function incidentEnergy(normalizedStarEnergy: number, normalizedOrbitDistance: number): number {
  const energy = Number.isFinite(normalizedStarEnergy) ? Math.max(0, normalizedStarEnergy) : 0
  const distance = Number.isFinite(normalizedOrbitDistance) ? Math.abs(normalizedOrbitDistance) : 0
  const incident = energy / Math.max(distance * distance, EPSILON)
  return Number.isFinite(incident) ? incident : Number.MAX_VALUE
}

export function thermalWeights(incident: number): ThermalWeights {
  const value = Number.isFinite(incident) ? Math.max(0, incident) : 0
  const weights: Record<ThermalState, number> = { magma: 0, desert: 0, rock: 0, tundra: 0, ice: 0 }
  if (value >= THERMAL_CENTERS[0][1]) {
    weights.magma = 1
    return Object.freeze(weights)
  }
  const coldest = THERMAL_CENTERS.at(-1)!
  if (value <= coldest[1]) {
    weights.ice = 1
    return Object.freeze(weights)
  }
  for (let index = 0; index < THERMAL_CENTERS.length - 1; index += 1) {
    const [hotName, hotCenter] = THERMAL_CENTERS[index]
    const [coldName, coldCenter] = THERMAL_CENTERS[index + 1]
    if (value > hotCenter || value < coldCenter) continue
    const linear = (value - coldCenter) / (hotCenter - coldCenter)
    const hotWeight = linear * linear * (3 - 2 * linear)
    weights[hotName] = hotWeight
    weights[coldName] = 1 - hotWeight
    return Object.freeze(weights)
  }
  weights.rock = 1
  return Object.freeze(weights)
}

export function buildPlanetSurfaceDescriptor(evidence: PlanetSurfaceEvidence): PlanetSurfaceDescriptor {
  const answerDensity = clamp01(Math.log1p(Math.max(0, finite(evidence.answerCount))) / ANSWER_REFERENCE)
  const spanDays = evidence.timeSpan === null ? 0 : Math.max(0, finite(evidence.timeSpan)) / 86_400
  const faultStrength = evidence.timeSpan === null
    ? 0
    : clamp01(Math.log1p(spanDays) / TIME_REFERENCE_DAYS)
  const incident = incidentEnergy(evidence.normalizedStarEnergy, evidence.normalizedOrbitDistance)
  return Object.freeze({
    metadata: Object.freeze({ questionId: evidence.questionId, starId: evidence.starId }),
    seed: stablePlanetSeed(evidence.questionId, evidence.starId),
    radius: clamp(0.55 + 0.45 * answerDensity, 0.55, 1),
    craterCount: Math.round(clamp(5 + 43 * answerDensity, 5, 48)),
    detailDensity: clamp01(answerDensity),
    faultStrength: clamp01(faultStrength),
    atmosphere: clamp01(evidence.freshness),
    createdGlow: evidence.created ? 1 as const : 0 as const,
    collectedMarker: evidence.collected ? 1 as const : 0 as const,
    incident: clamp(incident, 0, Number.MAX_VALUE),
    thermal: thermalWeights(incident),
  })
}

export function stablePlanetSeed(questionId: string, starId: string): number {
  let hash = 2166136261
  for (const codePoint of `${questionId}\u0000${starId}`) {
    hash ^= codePoint.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

const finite = (value: number): number => Number.isFinite(value) ? value : 0
const clamp = (value: number, minimum: number, maximum: number): number =>
  Math.min(maximum, Math.max(minimum, finite(value)))
const clamp01 = (value: number): number => clamp(value, 0, 1)
