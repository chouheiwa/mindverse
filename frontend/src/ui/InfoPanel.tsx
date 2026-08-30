import type { Mode, Universe } from '../types'
import './Panel.css'

interface Props {
  universe: Universe
  mode: Mode
  wormIdx: number
  onWorm: (i: number) => void
  onClose: () => void
  shared: boolean
}

/** 模式面板：虫洞、熄灭的星、星云、边缘微光、好奇心结构。 */
export function InfoPanel({ universe, mode, wormIdx, onWorm, onClose, shared }: Props) {
  const open = mode !== 'all'
  const u = universe
  const w = u.wormholes[wormIdx]
  if (!open) return null

  return (
    <aside className="pnl open">
      <button className="pnl-close" onClick={onClose} aria-label="关闭">×</button>
      {mode === 'worm' && w && (
        <div className="stagger">
          <div>
            <div className="lbl">虫洞 · 非典型组合 z = {w.z}</div>
            <h2>「{w.an}」×「{w.bn}」</h2>
          </div>
          <p className="pnl-lead">
            这两个星系在你全部足迹里<b>只相遇过 {w.obs} 次</b>。
            按你的兴趣规模，随机情况下本该相遇 <b>{w.exp}</b> 次。
            <em>它们几乎从不来往 —— 但下面这条，确实把它们连起来了。</em>
          </p>
          <div className="metrics">
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>实际跨越</div><b>{w.obs}</b></div>
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>随机预期</div><b>{w.exp}</b></div>
          </div>
          <div>
            <h3>连接它们的内容</h3>
            {w.ev.map((e, i) => (
              <a className="ev" key={i} href={e.u} target="_blank" rel="noopener noreferrer">
                <div className="ev-t">{e.t || (shared ? '在知乎上打开这条内容' : '')}</div>
                <div className="ev-m">
                  <span className="pill own">{e.a}</span>↔<span className="pill fav">{e.b}</span>
                </div>
              </a>
            ))}
          </div>
          {u.wormholes.length > 1 && (
            <div>
              <h3>换一个虫洞</h3>
              <div className="chips">
                {u.wormholes.map((x, j) => j === wormIdx ? null : (
                  <i key={j} onClick={() => onWorm(j)}>{x.an}×{x.bn}</i>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mode === 'dark' && (
        <div className="stagger">
          <div>
            <div className="lbl">熄灭的星 · 曾经密集，然后停了</div>
            <h2>你放下的那些</h2>
          </div>
          <p className="pnl-lead">
            这些主题你曾经一条条收进来，<em>然后就再没回去过</em>。
            星还在原处，只是很久没有新的光了。
          </p>
          {u.dark.map((d) => (
            <div key={d.c} style={{ marginBottom: 22 }}>
              <div style={{ fontFamily: 'var(--f-d)', fontSize: 18, fontWeight: 600, marginBottom: 4 }}>{d.c}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--mute)', marginBottom: 8 }}>
                {d.n} 条 · {d.first} → {d.last} · <em style={{ fontStyle: 'normal', color: 'var(--amber)' }}>已停 {d.gap} 个月</em>
              </div>
              {d.ev.map((e, i) => (
                <a className="ev" key={i} href={e.u} target="_blank" rel="noopener noreferrer">
                  <div className="ev-t">{e.t || (shared ? '在知乎上打开这条内容' : '')}</div>
                  <div className="ev-m"><span className="pill fav">我收藏的</span>
                    <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>{e.y}</span></div>
                </a>
              ))}
            </div>
          ))}
        </div>
      )}

      {mode === 'nebula' && (
        <div className="stagger">
          <div>
            <div className="lbl">星云 · 短暂而密集的爆发</div>
            <h2>你曾经一头扎进去的地方</h2>
          </div>
          <p className="pnl-lead">
            这些主题的内容高度集中在<em>同一个 30 天窗口</em>里 —— 不是长期兴趣，是一次燃烧。
          </p>
          {u.nebula.map((n) => (
            <div key={n.c} style={{ marginBottom: 18 }}>
              <div style={{ fontFamily: 'var(--f-d)', fontSize: 18, fontWeight: 600 }}>{n.c}</div>
              <div className="mono" style={{ fontSize: 11, color: 'var(--mute)', margin: '4px 0 0' }}>
                {n.n} 条 · 集中度 {Math.round(n.burst * 100)}% · {n.first} → {n.last}
              </div>
            </div>
          ))}
        </div>
      )}

      {mode === 'solo' && (
        <div className="stagger">
          <div>
            <div className="lbl">孤例概念 · 只出现过一两次</div>
            <h2>宇宙边缘的微光</h2>
          </div>
          <p className="pnl-lead">
            这些概念在你 {u.meta.items} 条足迹里只出现过 1–2 次，少到<em>连成星的资格都没有</em>。
            但正因为稀有，它们才是最可能通向别处的入口。
          </p>
          {u.solo.map((s, i) => (
            <a className="ev" key={i} href={s.u} target="_blank" rel="noopener noreferrer">
              <div className="ev-t">{s.t || (shared ? '在知乎上打开这条内容' : '')}</div>
              <div className="ev-m">
                <span className="pill fav">{s.c} ×{s.n}</span>
                <span className="mono" style={{ fontSize: 10, color: 'var(--mute)' }}>挂在「{s.g.join('、')}」上</span>
              </div>
            </a>
          ))}
        </div>
      )}

      {mode === 'me' && (
        <div className="stagger">
          <div>
            <div className="lbl">好奇心结构 · 由图指标算出，不是模型起的名</div>
            <h2>{label(u)}</h2>
          </div>
          <p className="pnl-lead">
            在 {new Date(u.meta.span[0] * 1000).getFullYear()}–{new Date(u.meta.span[1] * 1000).getFullYear()} 的{' '}
            <b>{u.meta.items}</b> 条足迹里，你的兴趣结成了 <b>{u.meta.clusters}</b> 个星群、
            <b>{u.meta.concepts}</b> 颗恒星。
          </p>
          <div className="metrics">
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>常规性 z 中位数</div><b>{u.meta.medz}</b></div>
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>新异尾部 z P10</div><b>{u.meta.p10z}</b></div>
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>我写过</div><b>{u.meta.own}</b></div>
            <div><div className="lbl" style={{ letterSpacing: '.1em', marginBottom: 6 }}>我收藏</div><b>{u.meta.fav}</b></div>
          </div>
          <div>
            <h3>这些结论怎么来的</h3>
            <p className="pnl-lead" style={{ fontSize: 13 }}>
              星群由概念共现网络的社区发现得出；虫洞用 Uzzi 2013 的非典型组合 z 检验判定，
              零模型是 1000 次保持度分布的随机重排。每一条结论都能点回上面的知乎原文。
            </p>
          </div>
        </div>
      )}
    </aside>
  )
}

/** 象限由两个算出来的数字决定，不是模型贴的标签。 */
function label(u: Universe): string {
  const solid = u.meta.medz > -1.2
  const cross = u.meta.p10z < -2.5
  if (solid && cross) return '造桥的人'
  if (solid) return '深井'
  if (cross) return '游荡者'
  return '拾荒者'
}
