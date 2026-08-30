import { useEffect, useState } from 'react'
import { getShare } from '../shareApi'
import type { ShareView } from '../types'
import { PublicShareContent } from './PublicShareContent'
import './SharedView.css'

export function SharedView({ shareId }: { shareId: string }) {
  const [attempt, setAttempt] = useState(0)
  const requestKey = `${shareId}\0${attempt}`
  const [result, setResult] = useState<
    { key: string; view: ShareView; error?: never } | { key: string; error: string; view?: never } | null
  >(null)

  useEffect(() => {
    const controller = new AbortController()
    const key = requestKey
    getShare(shareId, controller.signal).then((view) => setResult({ key, view })).catch((reason: unknown) => {
      if (!controller.signal.aborted) setResult({ key, error: reason instanceof Error ? reason.message : String(reason) })
    })
    return () => controller.abort()
  }, [shareId, requestKey])

  const current = result?.key === requestKey ? result : null

  return (
    <main className="sv-shell">
      <header className="sv-head">
        <div className="sv-kicker">知见宇宙 / 公开观测片</div>
        <h1>被选中的问题</h1>
        <p>由分享者逐项选择的公开内容，不代表完整个人宇宙。</p>
      </header>
      {current?.error ? (
        <section className="sv-state" role="alert">
          <h2>无法读取这张观测片</h2>
          <p>{current.error}</p>
          <button onClick={() => setAttempt((value) => value + 1)}>重试</button>
        </section>
      ) : current?.view ? <PublicShareContent view={current.view} /> : (
        <p className="sv-loading" role="status">正在校验公开内容…</p>
      )}
      <footer className="sv-footnote">文章探测器保留在分享者的私人宇宙中，不随此链接公开。</footer>
    </main>
  )
}
