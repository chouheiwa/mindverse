import { useEffect, useState } from 'react'
import { getSeedTopics, submitSeed, type SeedTopic } from '../api'
import { KanshanIcon } from './KanshanIcon'
import './Seed.css'

/**
 * 游客模式（种子星）。
 *
 * 界面必须显式说明这不是你的知乎历史 —— 绝不允许把现场挑选的结果
 * 伪装成真实数据。这条写在设计文档里，也写在下面的文案里。
 */
export function Seed({ onDone }: { onDone: () => void }) {
  const [topics, setTopics] = useState<SeedTopic[]>([])
  const [range, setRange] = useState({ min: 6, max: 12 })
  const [picked, setPicked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    getSeedTopics()
      .then((d) => { setTopics(d.topics); setRange({ min: d.min, max: d.max }) })
      .catch((e) => setErr(e instanceof Error ? e.message : String(e)))
  }, [])

  const toggle = (id: string) =>
    setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id)
      : p.length >= range.max ? p : [...p, id]))

  const go = async () => {
    setBusy(true); setErr(null)
    try {
      await submitSeed(picked)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e))
      setBusy(false)
    }
  }

  const ready = picked.length >= range.min

  return (
    <div className="sd">
      <div className="sd-box">
        <KanshanIcon variant={busy ? 'analyze' : 'discover'} size={112} className="sd-companion" />
        <div className="lbl">游客模式 · 种子星</div>
        <h1>先挑几个你真的感兴趣的方向</h1>
        <p className="sd-lede">
          我们会用这些方向去知乎搜真实内容，再让它们坍缩成星图。
          <em>这不是你的知乎历史</em> —— 是一颗按你此刻的选择长出来的宇宙。
          想看自己的那一颗，需要用知乎账号登录。
        </p>

        <div className="sd-grid">
          {topics.map((t) => (
            <button key={t.id} className={`sd-t${picked.includes(t.id) ? ' on' : ''}`}
              onClick={() => toggle(t.id)} aria-pressed={picked.includes(t.id)}>
              <b>{t.name}</b>
              <span>{t.hint}</span>
            </button>
          ))}
        </div>

        <div className="sd-bar">
          <button className="primary" disabled={!ready || busy} onClick={go}>
            {busy ? '正在展开选题…' : '生成我的星图'}
          </button>
          <span className="sd-count">
            已选 <b>{picked.length}</b> / 最少 {range.min}，最多 {range.max}
          </span>
        </div>
        {err && <div className="sd-err">{err}</div>}
      </div>
    </div>
  )
}
