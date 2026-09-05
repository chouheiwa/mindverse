import { describe, expect, it } from 'vitest'
import { buildPlanetSurfaceDescriptor, type PlanetSurfaceEvidence } from './planetSurface'
import { describePlanetAppearance } from './planetAppearance'

const evidence = (overrides: Partial<PlanetSurfaceEvidence> = {}): PlanetSurfaceEvidence => ({
  questionId: 'q-1',
  starId: 's-1',
  answerCount: 12,
  timeSpan: 86_400 * 900,
  freshness: 0.6,
  created: false,
  collected: false,
  normalizedStarEnergy: 1,
  normalizedOrbitDistance: 1,
  ...overrides,
})

const appearance = (overrides: Partial<PlanetSurfaceEvidence> = {}) =>
  describePlanetAppearance(buildPlanetSurfaceDescriptor(evidence(overrides)))

describe('planet appearance is driven by the evidence, not by taste', () => {
  it('grows cloud cover with freshness, the same signal that drives the atmosphere', () => {
    const stale = appearance({ freshness: 0.05 })
    const fresh = appearance({ freshness: 0.95 })
    expect(fresh.cloudCoverage).toBeGreaterThan(stale.cloudCoverage)
    expect(stale.cloudCoverage).toBeGreaterThan(0)
  })

  it('burns clouds off a magma world and thins them on an ice world', () => {
    const magma = appearance({ normalizedStarEnergy: 4, normalizedOrbitDistance: 1, freshness: 0.9 })
    const temperate = appearance({ normalizedStarEnergy: 1, normalizedOrbitDistance: 1.6, freshness: 0.9 })
    const frozen = appearance({ normalizedStarEnergy: 0.02, normalizedOrbitDistance: 3, freshness: 0.9 })
    expect(magma.cloudCoverage).toBeLessThan(temperate.cloudCoverage)
    expect(frozen.cloudCoverage).toBeLessThan(temperate.cloudCoverage)
    // 但一件都不能少：类别在，只是弱。
    expect(magma.cloudCoverage).toBeGreaterThan(0)
    expect(frozen.cloudCoverage).toBeGreaterThan(0)
  })

  it('lights the night side in proportion to how many answers the question holds', () => {
    const quiet = appearance({ answerCount: 1 })
    const busy = appearance({ answerCount: 400 })
    expect(busy.nightLightDensity).toBeGreaterThan(quiet.nightLightDensity * 2)
    // 一条回答也是一盏灯：夜侧不能是全黑，那等于说「这个问题没人回答过」。
    expect(quiet.nightLightDensity).toBeGreaterThan(0)
  })

  it('pushes the snow line towards the equator as the star gets further away', () => {
    const near = appearance({ normalizedStarEnergy: 2, normalizedOrbitDistance: 1 })
    const far = appearance({ normalizedStarEnergy: 2, normalizedOrbitDistance: 4 })
    expect(far.snowLine).toBeLessThan(near.snowLine)
    expect(far.snowLine).toBeGreaterThanOrEqual(0)
    expect(near.snowLine).toBeLessThanOrEqual(1)
  })

  it('opens lava rifts only where heat and a long history meet', () => {
    const youngHot = appearance({
      normalizedStarEnergy: 4, normalizedOrbitDistance: 1, timeSpan: 86_400,
    })
    const oldHot = appearance({
      normalizedStarEnergy: 4, normalizedOrbitDistance: 1, timeSpan: 86_400 * 3650,
    })
    const oldCold = appearance({
      normalizedStarEnergy: 0.02, normalizedOrbitDistance: 4, timeSpan: 86_400 * 3650,
    })
    expect(oldHot.lavaGlow).toBeGreaterThan(youngHot.lavaGlow)
    expect(oldHot.lavaGlow).toBeGreaterThan(oldCold.lavaGlow)
    expect(oldCold.lavaGlow).toBeLessThan(0.05)
  })

  it('reads ice fracture strength off the frozen weight', () => {
    const frozen = appearance({ normalizedStarEnergy: 0.02, normalizedOrbitDistance: 4 })
    const temperate = appearance({ normalizedStarEnergy: 1, normalizedOrbitDistance: 1.6 })
    expect(frozen.iceFracture).toBeGreaterThan(temperate.iceFracture)
  })

  it('keeps every channel finite and bounded for hostile evidence', () => {
    const hostile = describePlanetAppearance(buildPlanetSurfaceDescriptor(evidence({
      answerCount: Number.NaN,
      timeSpan: null,
      freshness: Number.POSITIVE_INFINITY,
      normalizedStarEnergy: Number.NaN,
      normalizedOrbitDistance: 0,
    })))
    for (const value of Object.values(hostile)) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(4)
    }
  })

  it('turns the whole system faster the closer the planet sits to its star', () => {
    const inner = appearance({ normalizedStarEnergy: 2, normalizedOrbitDistance: 0.8 })
    const outer = appearance({ normalizedStarEnergy: 2, normalizedOrbitDistance: 4 })
    expect(inner.cloudSpeed).toBeGreaterThan(outer.cloudSpeed)
    expect(outer.cloudSpeed).toBeGreaterThan(0)
  })
})

// 雪线极冠掩膜的定义域不变量。
//
// `planet.fragment.fx` 里那一句
//   polarMask = smoothstep(snowStart, snowStart + 0.22, latitude)
// 的两个边必须严格有序：GLSL 规定 `edge0 >= edge1` 时 smoothstep **未定义**，
// 主流驱动实现成 clamp((x - e0) / (e1 - e0), 0, 1)，分母变号之后极冠整个**翻转**
// —— 冰盖长在赤道、两极反而裸露。
//
// 提升批次原本在着色器里写 `mix(snowBand, 0.42, uThermalIce)`：冰行星
// （incident ≤ 0.06 → thermal.ice = 1、snowLine ≈ 0.067）算出 edge0 = 0.42，
// 而 edge1 = snowBand + 0.22 ≈ 0.287 —— 每一颗冰行星都落在未定义分支里。
// 现在冰权重在 CPU 侧折进 `snowLine`（只能把雪线往赤道压），着色器只剩
// 一条自推的带宽，顺序因此是结构性成立的，不依赖任何 uniform 的取值。
describe('the snow line never inverts the polar cap', () => {
  it('never lets the ice weight raise the snow line above what incident energy asks for', () => {
    const raised: string[] = []
    for (const energy of [0.01, 0.05, 0.2, 1, 2, 4, 9]) {
      for (const distance of [0.4, 0.8, 1, 1.6, 2.4, 3, 5]) {
        const surface = buildPlanetSurfaceDescriptor(
          evidence({ normalizedStarEnergy: energy, normalizedOrbitDistance: distance }),
        )
        const { snowLine } = describePlanetAppearance(surface)
        // 入射能量单独给出的雪线：冰权重只允许把它压低（冰盖更大），不允许抬高。
        const fromIncident = 1 - Math.exp(-Math.min(surface.incident, 6) * 1.15)
        if (snowLine > fromIncident + 1e-9) {
          raised.push(`energy=${energy} distance=${distance} ice=${surface.thermal.ice.toFixed(3)} `
            + `snowLine=${snowLine.toFixed(4)} > incident-only ${fromIncident.toFixed(4)}`)
        }
      }
    }
    expect(raised).toEqual([])
  })

  it('keeps a frozen world capped past the mid latitudes instead of only at the poles', () => {
    const frozen = buildPlanetSurfaceDescriptor(
      evidence({ normalizedStarEnergy: 0.02, normalizedOrbitDistance: 3 }),
    )
    expect(frozen.thermal.ice).toBe(1)
    const { snowLine } = describePlanetAppearance(frozen)
    // 着色器把 snowLine 当极冠掩膜的下缘，带宽 0.22。冻透的世界，
    // 冰盖要越过中纬度，而不是缩在极点。
    expect(snowLine).toBeLessThan(0.28)
    expect(snowLine + 0.22).toBeLessThan(0.5)
  })

  it('still gives a scorched inner world a cap that only reaches the poles', () => {
    const scorched = buildPlanetSurfaceDescriptor(
      evidence({ normalizedStarEnergy: 6, normalizedOrbitDistance: 0.9 }),
    )
    expect(scorched.thermal.ice).toBe(0)
    const { snowLine } = describePlanetAppearance(scorched)
    expect(snowLine).toBeGreaterThan(0.9)
  })
})
