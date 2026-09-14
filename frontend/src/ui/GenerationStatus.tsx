import { useEffect, useState } from 'react'
import type { GenerationDetails } from '../types'
import './GenerationStatus.css'
import { estimateText } from '../domain/generationEstimate'


function sourceURL(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && !url.username && !url.password && !url.port
      && ['www.zhihu.com', 'zhihu.com', 'zhuanlan.zhihu.com'].includes(url.hostname)
  } catch { return false }
}

export function GenerationStatus({ details: d }: { details: GenerationDetails }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])
  const elapsed = Math.max(0, Math.floor((now - d.startedAt) / 1000))
  const previews = (d.preview ?? []).filter(p => sourceURL(p.url)).slice(-3)
  const count = d.phase === 'collect' ? `已读取 ${d.collected} 条内容`
    : d.phase === 'name' ? `已命名 ${d.done} / ${d.total} 个星群`
    : d.phase === 'analyze' || d.phase === 'normalize' ? `已处理 ${d.done} / ${d.total} 条待分析内容`
    : `已读取 ${d.collected} 条内容`
  return <section className="gs" aria-label="实际生成进展">
    <div className="gs-readout">
      <div aria-live="polite" aria-atomic="true">
        <p className="gs-count">{count}</p>
        <p className="gs-note">{d.phase === 'collect' && d.foldersTotal > 0
          ? `收藏夹 ${d.foldersDone} / ${d.foldersTotal} · 本次采集范围内`
          : `已复用 ${d.cached} 条历史分析`}
          {d.failed > 0 && ` · ${d.failed} 条尚未获得有效标注`}</p>
      </div>
      <div className="gs-timing">
        <p>{estimateText(d, now)}</p>
        <p className="gs-note">已用 {Math.floor(elapsed / 60)} 分 {elapsed % 60} 秒 · 随实际速度更新</p>
      </div>
    </div>
    {previews.length > 0 ? <div className="gs-findings">
      <p className="gs-caption">已经发现的线索 <span>初步概念，仍在整理</span></p>
      <ul>{previews.map(p => <li key={p.url}>
        <span className="gs-concepts">{p.concepts.slice(0, 3).join(' · ')}</span>
        <a href={p.url} target="_blank" rel="noopener noreferrer">{p.title || '查看对应原文'}<span aria-hidden="true"> ↗</span></a>
      </li>)}</ul>
    </div> : <p className="gs-expectation">完成后，你可以从概念恒星进入问题行星，沿回答回到知乎原文。</p>}
  </section>
}
