import { forwardRef } from 'react'
import type { PlanetDatum } from '../starmap/gl/bodies'
import './QuestionPlanetCard.css'

function relationCopy(planet: PlanetDatum): string {
  if (planet.created && planet.collected) return '我创作并收藏过相关回答'
  if (planet.created) return '我创作过相关回答'
  if (planet.collected) return '我收藏过相关回答'
  return '公共问题'
}

/** Attached observatory annotation and gateway for one real question planet. */
export const QuestionPlanetCard = forwardRef<HTMLDivElement, {
  planet: PlanetDatum | null
  onClose: () => void
  onEnter: (planet: PlanetDatum) => void
}>(function QuestionPlanetCard({ planet, onClose, onEnter }, ref) {
  if (!planet) return <div ref={ref} className="qpc" hidden />

  return (
    <aside ref={ref} className="qpc" aria-label="问题行星入口">
      <button className="qpc-close" type="button" onClick={onClose} aria-label="关闭问题行星入口">×</button>
      <div className="qpc-readout" aria-label={`轨道 ${planet.index + 1}，${planet.answerCount} 个回答`}>
        <span className={`qpc-orbit${planet.created ? ' is-created' : ''}`} aria-hidden="true"><i /></span>
        <span>QUESTION ORBIT {String(planet.index + 1).padStart(2, '0')}</span>
        <span className="qpc-count">{planet.answerCount} 个回答</span>
      </div>
      <h2>{planet.question.title}</h2>
      <p className={`qpc-relation${planet.created ? ' is-created' : ''}`}>{relationCopy(planet)}</p>
      <div className="qpc-actions">
        <button type="button" className="qpc-enter" onClick={() => onEnter(planet)}>进入问题行星</button>
        <a href={planet.question.url} target="_blank" rel="noopener noreferrer">查看知乎原问题</a>
      </div>
    </aside>
  )
})
