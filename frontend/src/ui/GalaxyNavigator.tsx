import { galaxyName } from '../starmap/galaxyNavigation'
import type { Cluster, Universe } from '../types'
import { starIdentity } from '../starmap/starIdentity'
import './GalaxyNavigator.css'

export function GalaxyNavigator({ universe, cluster, onCluster, onStar }: {
  universe: Universe
  cluster?: Cluster
  onCluster: (id: number) => void
  onStar: (key: string) => void
}) {
  const groups = universe.clusters.map((group) => ({
    group, members: universe.stars.filter((star) => star.g === group.g),
  })).filter(({ members }) => members.length > 0)
  const members = cluster ? groups.find(({ group }) => group.g === cluster.g)?.members ?? [] : []
  return <aside className="galaxy-nav" aria-label={cluster ? '星系内的恒星' : '选择星系'}>
    <div className="galaxy-nav-heading">
      <span>{cluster ? '下一步 · 选择恒星' : '从一个星系开始'}</span>
      <small>{cluster ? members.length : groups.length} {cluster ? '颗恒星' : '个星系'}</small>
    </div>
    <p>{cluster ? '每颗恒星连接着一组真实问题。' : '进入一个感兴趣的方向，看看其中有哪些概念。'}</p>
    <div className="galaxy-nav-list">
      {cluster ? members.map((star) => <button key={starIdentity(star)} onClick={() => onStar(starIdentity(star))}>
        <span className="galaxy-nav-symbol" aria-hidden="true">✦</span>
        <span><strong>{star.c}</strong><small>进入恒星系</small></span>
        <span aria-hidden="true">→</span>
      </button>) : groups.map(({ group, members: stars }) => <button key={group.g} onClick={() => onCluster(group.g)}>
        <span className="galaxy-nav-symbol" aria-hidden="true">◎</span>
        <span><strong>{galaxyName(group)}</strong><small>{stars.length} 颗概念恒星 · 点击进入</small></span>
        <span aria-hidden="true">→</span>
      </button>)}
    </div>
  </aside>
}
