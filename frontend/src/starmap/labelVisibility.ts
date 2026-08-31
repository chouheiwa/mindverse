import type { Cluster } from '../types'

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
