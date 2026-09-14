import { useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import './Loading.css'

interface Props {
  stage: string
  progress: number
  error?: string | null
  gone: boolean
}

const chapters = [
  { name: '拾起微光', title: '每一次好奇，都留下了光。', note: '从收藏、创作或此刻选中的方向，寻找最初的微光。' },
  { name: '寻找引力', title: '相似的念头，开始相认。', note: '有些内容隔得很远，却被同一种好奇心吸引。' },
  { name: '星群成形', title: '你的宇宙，逐渐有了形状。', note: '再等片刻，就能沿着这些光，走回真实的问题。' },
]

// A symbolic formation scene, not a visualization of intermediate user data.
// Fixed seeds keep the scene stable across renders and avoid hydration/random drift.
const dust = Array.from({ length: 132 }, (_, i) => {
  const a = i * 2.399963
  const seed = (Math.sin(i * 127.1 + 19) * 43758.5453) % 1
  const r = Math.sqrt((i + 1) / 132)
  const center = [[-170, -48], [160, -72], [20, 115]][i % 3]!
  return {
    '--sx': `${Math.cos(a) * (110 + r * 290)}px`,
    '--sy': `${Math.sin(a) * (40 + r * 160)}px`,
    '--gx': `${Math.cos(a + r * 3) * r * 300}px`,
    '--gy': `${Math.sin(a + r * 3) * r * 116}px`,
    '--fx': `${center[0]! + Math.cos(a) * r * 104}px`,
    '--fy': `${center[1]! + Math.sin(a) * r * 62}px`,
    '--delay': `${-i * .19}s`,
    '--duration': `${3.4 + Math.abs(seed) * 4}s`,
    '--brightness': .3 + Math.abs(seed) * .65,
  } as CSSProperties
})

function Nursery({ phase }: { phase: number }) {
  const field = useRef<HTMLButtonElement>(null)
  const [ripple, setRipple] = useState(0)
  const move = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = (event.clientX - rect.left) / rect.width - .5
    const y = (event.clientY - rect.top) / rect.height - .5
    event.currentTarget.style.setProperty('--drift-x', `${x * 28}px`)
    event.currentTarget.style.setProperty('--drift-y', `${y * 18}px`)
  }
  const settle = () => {
    field.current?.style.setProperty('--drift-x', '0px')
    field.current?.style.setProperty('--drift-y', '0px')
  }
  return (
    <div className="ld-nursery" data-phase={phase}>
      <button className="ld-play" ref={field} aria-label="轻触，扰动星尘"
        onPointerMove={move} onPointerLeave={settle} onBlur={settle}
        onClick={() => setRipple((value) => value + 1)}>
        <svg className="ld-sky" viewBox="-450 -245 900 490" aria-hidden="true">
          <g className="ld-guides">
            <ellipse rx="330" ry="175" />
            <ellipse rx="285" ry="118" transform="rotate(-14)" />
            <path d="M-400 0h18m764 0h18M0-211v14m0 394v14" />
          </g>
          <g className="ld-traces">
            <path d="M-170-48Q-25-175 160-72Q222 120 20 115Q-168 157-170-48" />
            <ellipse cx="-170" cy="-48" rx="107" ry="66" transform="rotate(-16 -170 -48)" />
            <ellipse cx="160" cy="-72" rx="99" ry="58" transform="rotate(18 160 -72)" />
            <ellipse cx="20" cy="115" rx="107" ry="58" transform="rotate(-12 20 115)" />
          </g>
          <g className="ld-drift">
            <g key={`dust-${ripple}`} className={ripple ? 'ld-kick' : 'ld-orbit'}>
            {dust.map((style, i) => (
              <g key={i} className={`ld-grain${i % 11 === 0 ? ' ld-bright' : ''}`} style={style}>
                <circle className="ld-spark" r={i % 11 === 0 ? 2.3 : i % 3 === 0 ? 1.35 : .8} />
                {i % 22 === 0 && <path className="ld-flare" d="M-7 0h14M0-7v14" />}
              </g>
            ))}
            <g className="ld-nuclei">
              {[[-170, -48], [160, -72], [20, 115]].map(([x, y], i) => (
                <g key={i} transform={`translate(${x} ${y})`}>
                  <circle className="ld-nucleus-halo" r="24" />
                  <circle className="ld-nucleus" r="3" />
                  <path className="ld-crown" d="M-12 0h24M0-12v24" />
                </g>
              ))}
            </g>
            </g>
            {ripple > 0 && <g key={ripple} className="ld-ripple"><circle r="32" /><circle r="52" /></g>}
          </g>
        </svg>
      </button>
      <span className="ld-coordinate ld-coordinate-left" aria-hidden="true">{['散落', '靠近', '相连'][phase]} / 0{phase + 1}</span>
      <span className="ld-coordinate ld-coordinate-right" aria-hidden="true">一场好奇心的引力实验</span>
      <p className="ld-invitation" aria-live="polite">{ripple ? '看，你也有引力。' : '划过星尘，或轻触一下。'}</p>
    </div>
  )
}

export function Loading({ stage, progress, error, gone }: Props) {
  if (gone) return null
  const safeProgress = Number.isFinite(progress) ? Math.min(100, Math.max(0, progress)) : 0
  const phase = safeProgress < 30 ? 0 : safeProgress < 70 ? 1 : 2
  const chapter = chapters[phase]!
  return (
    <section className={`ld${error ? ' ld-failed' : ''}`} aria-label="宇宙生成">
      <header className="ld-header">
        <a href="/" className="ld-brand"><span aria-hidden="true">✳</span>知见宇宙</a>
        <span className="ld-edition">{error ? '观测暂时中断' : '一份好奇心的诞生记录'}</span>
      </header>
      {error ? (
        <div className="ld-error-content">
          <span className="ld-error-mark" aria-hidden="true">· · ·</span>
          <h2>先在这里停靠一下。</h2>
          <p role="alert">{error}</p>
          <a href="/">返回入口</a>
        </div>
      ) : (
        <>
          <Nursery phase={phase} />
          <div className="ld-story" key={phase}>
            <span className="ld-chapter">第 {['一', '二', '三'][phase]}幕 · {chapter.name}</span>
            <h2 aria-label={chapter.title}>{chapter.title.split('，').map((part, i) => <span className="ld-title-segment" key={part}>{part}{i === 0 ? '，' : ''}</span>)}</h2>
            <p>{chapter.note}</p>
          </div>
          <footer className="ld-footer">
            <ol className="ld-chapters" aria-label="生成阶段">
              {chapters.map((item, i) => (
                <li key={item.name} data-active={i === phase} data-done={i < phase} aria-current={i === phase ? 'step' : undefined}>
                  <span className="ld-step-number" aria-hidden="true">{i < phase ? '✓' : `0${i + 1}`}</span>{item.name}
                </li>
              ))}
            </ol>
            <div className="ld-telemetry">
              <p role="status" aria-live="polite" aria-atomic="true"><span className="ld-signal" aria-hidden="true" />{stage || '正在连接你的宇宙'}</p>
              <div className="ld-track" role="progressbar" aria-label="生成进度" aria-valuemin={0} aria-valuemax={100}
                aria-valuenow={safeProgress} aria-valuetext={stage}>
                <i style={{ transform: `scaleX(${safeProgress / 100})` }} />
              </div>
            </div>
          </footer>
        </>
      )}
    </section>
  )
}
