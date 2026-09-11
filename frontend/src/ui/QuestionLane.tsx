import type { QuestionPlanetDatum } from '../domain/universe'
import { isBeltOrbit } from '../starmap/orbitGeometry'
import './QuestionLane.css'

export function QuestionLane({ planets, selectedId, onSelect }: {
  planets: readonly QuestionPlanetDatum[]
  selectedId: string | null
  onSelect: (planet: QuestionPlanetDatum, trigger: HTMLButtonElement) => void
}) {
  return (
    <nav className="ql" data-desktop-question-lane aria-label="问题航道">
      <details open>
        <summary>问题航道 <span>{planets.length}</span></summary>
        {planets.length ? (
          <ol>
            {planets.map((planet) => (
              <li key={planet.question.id}>
                <button type="button" className={selectedId === planet.question.id ? 'is-selected' : ''}
                  data-focus-return={`lane:${planet.question.id}`}
                  aria-pressed={selectedId === planet.question.id}
                  aria-label={`${isBeltOrbit(planet.orbitIndex, planets.length) ? '小行星带' : '轨道'} ${planet.orbitIndex}，${planet.question.title}，${planet.answerCount} 个回答`}
                  onClick={(event) => onSelect(planet, event.currentTarget)}>
                  <span>{String(planet.orbitIndex).padStart(2, '0')}</span>
                  <b>{planet.question.title}</b>
                  <i>{planet.answerCount} 回答</i>
                </button>
              </li>
            ))}
          </ol>
        ) : <p>这颗恒星还没有已收录的问题行星</p>}
      </details>
    </nav>
  )
}
