import type { Cluster } from '../types'
import type { StarDatum } from './gl/starData'
import { ownerOpacity } from './focusEmphasis'
import { starIdentity } from './starIdentity'

export interface StarLabelVisibility {
  star: StarDatum
  opacity: number
}

export function visibleClusterLabels(clusters: readonly Cluster[], focusCluster: number | null): Cluster[] {
  if (focusCluster !== null) return clusters.filter((cluster) => cluster.g === focusCluster)
  // 每个星群都要有名字：一屏没有名字的光点，用户根本认不出那是什么。
  // 这里只定**顺序**（规模降序，同规模按原序稳定）。屏幕装不下时由
  // labelPainter 的去重叠淘汰后来者 —— 让大的先占住位置，而不是预先砍名单：
  // 一个星群有没有资格拿到名字，不该取决于它排第几。
  return clusters
    .map((cluster, index) => ({ cluster, index }))
    .sort((a, b) => b.cluster.n - a.cluster.n || a.index - b.index)
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
  const focusIdentity = starIdentity(focusStar.s)
  return stars
    .filter((star) => star.s.g === focusStar.s.g)
    .map((star) => ({ star, opacity: ownerOpacity(starIdentity(star.s), focusIdentity) }))
}

/** 只在 focus 变化时重算标签策略；帧循环只读稳定数组。 */
export class LabelStrategyCache {
  readonly sourceClusters: readonly Cluster[]
  readonly sourceStars: readonly StarDatum[]
  clusterLabels: Cluster[]
  starLabels: StarLabelVisibility[] = []
  revision = 0
  private focusStarIdentity: string | null = null

  constructor(clusters: readonly Cluster[], stars: readonly StarDatum[]) {
    this.sourceClusters = clusters
    this.sourceStars = stars
    this.clusterLabels = visibleClusterLabels(clusters, null)
  }

  setFocus(focusStar: StarDatum | null): void {
    const nextIdentity = focusStar ? starIdentity(focusStar.s) : null
    if (nextIdentity === this.focusStarIdentity) return
    this.focusStarIdentity = nextIdentity
    this.clusterLabels = visibleClusterLabels(this.sourceClusters, focusStar?.s.g ?? null)
    this.starLabels = visibleStarLabels(this.sourceStars, focusStar)
    this.revision += 1
  }
}
