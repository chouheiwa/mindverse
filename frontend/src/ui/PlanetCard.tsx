import { forwardRef } from 'react'
import type { Evidence } from '../types'
import type { StarDatum } from '../starmap/gl/starData'
import './PlanetCard.css'

/**
 * 轻量回答／探测器内容面板，保留给后续实体层使用。
 * 问题行星入口使用独立的 QuestionPlanetCard。
 *
 * 位置由 Renderer 每帧直接写 style（见 onAnchor），不走 React state ——
 * 行星一直在公转，挂到状态上就是每帧重渲染整棵树。
 */
export const PlanetCard = forwardRef<HTMLDivElement, {
  planet: { ev: Evidence; star: StarDatum; own: boolean } | null
  shared: boolean
  onClose: () => void
}>(function PlanetCard({ planet, shared, onClose }, ref) {
  if (!planet) return <div ref={ref} className="pc" hidden />
  const { ev, star, own } = planet
  return (
    <div ref={ref} className="pc">
      <button className="pc-x" onClick={onClose} aria-label="取消选中">×</button>
      <div className="pc-h">
        {/* 与右侧列表、以及 3D 里那颗行星的着色一致 */}
        <span className={`pdot${own ? ' own' : ''}`} />
        <span className="pc-k">{own ? '我写过的' : '我只收藏的'}</span>
        <span className="mono pc-y">{ev.y}</span>
      </div>
      {/* 分享快照不含原文标题 —— 只存结构与公开链接 */}
      <div className="pc-t">{ev.t || (shared ? '在知乎上打开这条内容' : '这条内容')}</div>
      <div className="pc-f">
        <span className="pc-s">绕「{star.s.c}」公转</span>
        <a href={ev.u} target="_blank" rel="noopener noreferrer">在知乎打开 →</a>
      </div>
    </div>
  )
})
