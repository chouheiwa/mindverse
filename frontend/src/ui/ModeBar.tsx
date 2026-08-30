import type { Mode } from '../types'
import './ModeBar.css'

/** 六个视图互斥，所以是一条分段控件而不是六颗独立药丸。
 *  动作（宇宙身份证）不在这里 —— 它是动作不是状态，由仪表带单独承载。 */
const MODES: { k: Mode; t: string; warm?: boolean }[] = [
  { k: 'all', t: '全景' },
  { k: 'worm', t: '虫洞', warm: true },
  { k: 'dark', t: '熄灭的星', warm: true },
  { k: 'nebula', t: '星云' },
  { k: 'solo', t: '边缘微光' },
  { k: 'me', t: '好奇心结构' },
]

export function ModeBar({ mode, onMode }: {
  mode: Mode
  onMode: (m: Mode, trigger: HTMLButtonElement) => void
}) {
  return (
    <div className="seg" role="group" aria-label="视图">
      {MODES.map((m) => (
        <button
          key={m.k}
          className={`sg${mode === m.k ? ' on' : ''}${m.warm ? ' warm' : ''}`}
          aria-pressed={mode === m.k}
          onClick={(event) => onMode(m.k, event.currentTarget)}
        >
          {m.t}
        </button>
      ))}
    </div>
  )
}
