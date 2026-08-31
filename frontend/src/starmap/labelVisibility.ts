import type { Cluster } from '../types'
import type { StarDatum } from './gl/starData'
import { ownerOpacity } from './focusEmphasis'

export interface StarLabelVisibility {
  star: StarDatum
  opacity: number
}

export function visibleClusterLabels(clusters: readonly Cluster[], focusCluster: number | null): Cluster[] {
  if (focusCluster !== null) return clusters.filter((cluster) => cluster.g === focusCluster)
  return clusters
    .map((cluster, index) => ({ cluster, index }))
    .sort((a, b) => b.cluster.n - a.cluster.n || a.index - b.index)
    .slice(0, 7)
    .map(({ cluster }) => cluster)
}

export function starLabelOpacity(projectedRadiusPx: number): number {
  return Math.min(1, Math.max(0, (projectedRadiusPx - 18) / 24))
}

/** 全景不铺恒星名；聚焦后只显示同星群，且当前 owner 为 1、其他为 .12。 */
export function visibleStarLabels(
  stars: readonly StarDatum[],
  focusStar: StarDatum | null,
): StarLabelVisibility[] {
  if (!focusStar) return []
  return stars
    .filter((star) => star.s.g === focusStar.s.g)
    .map((star) => ({ star, opacity: ownerOpacity(star.s.c, focusStar.s.c) }))
}
