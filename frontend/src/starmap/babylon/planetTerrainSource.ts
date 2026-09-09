import { buildPlanetTerrain, type PlanetTerrainLevel } from './planetTerrain'
import type { PlanetSurfaceDescriptor } from './planetSurface'
import { createTerrainField, type PlanetTerrainField } from './terrainField'

// 行星地形的**唯一构造口**。
//
// 轨道视图的球体网格和可环绕的地表世界必须问同一个地形场，否则「从轨道看到的
// 山」和「落地踩到的山」是两座不同的山。把构造收在这里，就不可能出现两处各自
// 拼一套参数、日后偷偷分叉的情况。

export const TERRAIN_QUALITY_LEVEL: Readonly<Record<PlanetTerrainLevel, 0 | 1 | 2>> = Object.freeze({
  low: 0, medium: 1, high: 2,
})

export interface PlanetTerrainSource {
  readonly field: PlanetTerrainField
  /** 高度场到半径比例的换算系数，与着色器时代的 uDisplacement 同义。 */
  readonly displacement: number
}

export function createPlanetTerrainSource(
  descriptor: PlanetSurfaceDescriptor,
  level: PlanetTerrainLevel,
): PlanetTerrainSource {
  const terrain = buildPlanetTerrain(descriptor, level)
  return Object.freeze({
    field: createTerrainField({
      ...terrain,
      seed: descriptor.seed,
      detailDensity: descriptor.detailDensity,
      faultStrength: descriptor.faultStrength,
      qualityLevel: TERRAIN_QUALITY_LEVEL[level],
    }),
    displacement: 0.045 + descriptor.detailDensity * 0.08,
  })
}
