import { useMemo } from 'react'
import type { Dark, Evidence, Meta, Star, Universe } from '../types'
import './Panel.css'

interface Props {
  universe: Universe
  star: Star | null
  onClose: () => void
  onPickConcept: (concept: string) => void
  shared: boolean
  /** 当前选中行星对应内容的链接，用来在列表里标出「就是这一条」 */
  highlight?: string
}

/** "2019.03" 与 "26.08" 两种写法都要吃得下 —— 前者来自 Star，后者来自 Evidence。 */
function frac(s: string): number {
  const [ys, ms] = s.split('.')
  let y = Number(ys)
  if (y < 100) y += 2000
  return y + (Number(ms) - 1) / 12
}

/**
 * 活跃区间。
 *
 * 刻意不画月度柱状图：条目的逐月分布后端没有下发，Star 只给了首末月份，
 * ev 又最多 6 条。旧版拿 `40 + (i*37)%60` 生成柱高冒充分布 —— 那是编的。
 * 这里只画三样真东西：整个宇宙的跨度、这颗星的首末区间、以及手上这几条的时间点。
 */
function SpanRail({ star, meta }: { star: Star; meta: Meta }) {
  const g = useMemo(() => {
    const y0 = new Date(meta.span[0] * 1000).getFullYear()
    const y1 = new Date(meta.span[1] * 1000).getFullYear()
    const lo = y0
    const hi = Math.max(y1 + 1, y0 + 1)
    const at = (s: string) => Math.min(1, Math.max(0, (frac(s) - lo) / (hi - lo)))
    const a = at(star.fi)
    const b = at(star.la)
    return { y0, y1, a, w: Math.max(0.012, b - a), ticks: star.ev.map((e) => at(e.y)) }
  }, [star, meta])

  return (
    <div className="span">
      <div className="rail">
        <i style={{ left: `${g.a * 100}%`, width: `${g.w * 100}%` }} />
        {g.ticks.map((t, i) => (
          <span className="tk" key={i} style={{ left: `${t * 100}%` }} />
        ))}
      </div>
      <div className="ax">
        <span>{g.y0}</span>
        <span>{star.fi} – {star.la}</span>
        <span>{g.y1}</span>
      </div>
    </div>
  )
}

function EvidenceList({ items, shared, highlight }: {
  items: Evidence[]; shared: boolean; highlight?: string
}) {
  return (
    <>
      {items.map((e, i) => (
        <a className={`evp${highlight && e.u === highlight ? ' on' : ''}`} key={i}
          href={e.u} target="_blank" rel="noopener noreferrer">
          <span className={`pdot ${e.o ? 'own' : 'fav'}`} />
          {/* 分享快照不含原文标题 —— 只存结构与公开链接 */}
          <span className="evp-t">{e.t || (shared ? '在知乎上打开这条内容' : '')}</span>
          <span className="evp-y">{e.y}</span>
        </a>
      ))}
    </>
  )
}

export function Panel({ universe, star, onClose, onPickConcept, shared, highlight }: Props) {
  const cluster = star ? universe.clusters.find((c) => c.g === star.g) : null
  const dark: Dark | undefined = star ? universe.dark.find((d) => d.c === star.c) : undefined
  const nebula = star ? universe.nebula.find((n) => n.c === star.c) : undefined
  const rest = star ? star.n - star.ev.length : 0

  return (
    <aside className={`pnl${star ? ' open' : ''}`} aria-live="polite">
      <button className="pnl-close" onClick={onClose} aria-label="关闭">×</button>
      {star && (
        <div className="stagger">
          <div>
            <h2>{star.c}</h2>
            <div className="pnl-strip">
              {star.n} 颗行星<u>·</u>{star.o} 创作<u>·</u>{star.f} 收藏<u>·</u>属于「{cluster?.name}」星群
            </div>
          </div>

          <p className="pnl-lead">
            {dark ? (
              <>你收藏了 <b>{star.f}</b> 条关于「{star.c}」的内容，<em>一条都没有写过</em>。这是一片暗物质。</>
            ) : nebula ? (
              <><b>{Math.round(star.bu * 100)}%</b> 的内容集中在同一个 30 天窗口里 —— 这是一次<em>短暂而密集的爆发</em>，不是长期兴趣。</>
            ) : (
              <>这颗星由 <b>{star.n}</b> 条真实内容构成，从 {star.fi} 一直亮到 {star.la}。</>
            )}
          </p>

          <div>
            <h3>活跃区间</h3>
            <SpanRail star={star} meta={universe.meta} />
          </div>

          <div>
            <h3>构成它的内容 · 每一条就是一颗行星</h3>
            <div className="lgd">
              <span><i className="pdot own" />我写过的 · 自己发光</span>
              <span><i className="pdot fav" />我只收藏的 · 反射恒星的光</span>
            </div>
            <EvidenceList items={star.ev} shared={shared} highlight={highlight} />
            {rest > 0 && <div className="rest">另有 {rest} 条未在此列出</div>}
          </div>

          {cluster && cluster.mem.length > 1 && (
            <div>
              <h3>同星群的其他天体</h3>
              <div className="chips">
                {cluster.mem.filter((m) => m !== star.c).map((m) => (
                  <i key={m} onClick={() => onPickConcept(m)}>{m}</i>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </aside>
  )
}
