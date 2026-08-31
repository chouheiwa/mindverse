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

/** 只在 focus 变化时重算标签策略；帧循环只读稳定数组。 */
export class LabelStrategyCache {
  readonly sourceClusters: readonly Cluster[]
  readonly sourceStars: readonly StarDatum[]
  clusterLabels: Cluster[]
  starLabels: StarLabelVisibility[] = []
  revision = 0
  private focusStarId: string | null = null

  constructor(clusters: readonly Cluster[], stars: readonly StarDatum[]) {
    this.sourceClusters = clusters
    this.sourceStars = stars
    this.clusterLabels = visibleClusterLabels(clusters, null)
  }

  setFocus(focusStar: StarDatum | null): void {
    const nextId = focusStar?.s.c ?? null
    if (nextId === this.focusStarId) return
    this.focusStarId = nextId
    this.clusterLabels = visibleClusterLabels(this.sourceClusters, focusStar?.s.g ?? null)
    this.starLabels = visibleStarLabels(this.sourceStars, focusStar)
    this.revision += 1
  }
}
