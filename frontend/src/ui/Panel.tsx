import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { probesForStar, questionsForStar, type UniverseIndex } from '../domain/universe'
import type { ArticleProbe, Dark, Evidence, Meta, Star, Universe } from '../types'
import './Panel.css'

interface Props {
  universe: Universe
  index: UniverseIndex
  star: Star | null
  onClose: () => void
  onPickConcept: (concept: string) => void
  /** Task 8 owns ShareView rendering. This component fails closed in shared mode. */
  shared: boolean
  onEnterQuestion: (questionId: string, trigger: HTMLButtonElement) => void
  /** 当前选中行星对应内容的链接，用来在列表里标出「就是这一条」 */
  highlight?: string
}

const ENTRY_LIMIT = 8
const PUBLIC_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai',
})
const PUBLIC_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
})

function publicDate(seconds: number | undefined): { label: string; dateTime: string } | null {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(PUBLIC_DATE_KEY_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]))
  return { label: PUBLIC_DATE_FORMATTER.format(date), dateTime: `${parts.year}-${parts.month}-${parts.day}` }
}

function ProbeRelation({ probe }: { probe: ArticleProbe }) {
  const created = probe.bindings.some(({ relation }) => relation === 'created')
  const collected = probe.bindings.some(({ relation }) => relation === 'collected')
  if (created || collected) return <span className="entry-relations">
    {created && <span>我创作</span>}{collected && <span>我收藏</span>}
  </span>
  return <span className="entry-relation-neutral">
    {probe.discoverySources.includes('public_search') ? '公开发现' : '未发现可证明的个人关系'}
  </span>
}

function SemanticEntries({ index, star, onEnterQuestion }: {
  index: UniverseIndex
  star: Star
  onEnterQuestion: Props['onEnterQuestion']
}) {
  const questions = questionsForStar(index, star)
  const probes = probesForStar(index, star)
  const [questionLimit, setQuestionLimit] = useState(ENTRY_LIMIT)
  const [probeLimit, setProbeLimit] = useState(ENTRY_LIMIT)
  const questionActions = useRef(new Map<string, HTMLButtonElement>())
  const probeActions = useRef(new Map<string, HTMLAnchorElement>())
  const questionFocusId = useRef<string | null>(null)
  const probeFocusId = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!questionFocusId.current) return
    questionActions.current.get(questionFocusId.current)?.focus()
    questionFocusId.current = null
  }, [questionLimit])
  useLayoutEffect(() => {
    if (!probeFocusId.current) return
    probeActions.current.get(probeFocusId.current)?.focus()
    probeFocusId.current = null
  }, [probeLimit])
  return <>
    <section className="entry-section" aria-labelledby="panel-questions">
      <h3 id="panel-questions">问题行星</h3>
      {!questions.length && <p className="entry-empty">尚无已收录的问题行星。</p>}
      <ol className="entry-list">
        {questions.slice(0, questionLimit).map((question, position) => {
          const orbit = position + 1
          return <li className="entry-row" key={question.id}>
            <span className="entry-index">轨道 {String(orbit).padStart(2, '0')}</span>
            <strong>{question.title}</strong>
            <span className="entry-meta">{question.answerIds.length} 个已收录回答</span>
            <div className="entry-actions">
              <button ref={(node) => {
                if (node) questionActions.current.set(question.id, node)
                else questionActions.current.delete(question.id)
              }} type="button" onClick={(event) => onEnterQuestion(question.id, event.currentTarget)}>进入问题行星</button>
              <a href={question.url} target="_blank" rel="noopener noreferrer" aria-label="查看知乎原问题">原问题 ↗</a>
            </div>
          </li>
        })}
      </ol>
      {questions.length > ENTRY_LIMIT && <span className="entry-status" role="status" aria-live="polite">
        已显示 {Math.min(questionLimit, questions.length)} 项，共 {questions.length} 项
      </span>}
      {questionLimit < questions.length && <button className="entry-more" type="button" onClick={() => {
        questionFocusId.current = questions[questionLimit]?.id ?? null
        setQuestionLimit((count) => Math.min(count + ENTRY_LIMIT, questions.length))
      }}>
        加载更多问题
      </button>}
    </section>

    <section className="entry-section" aria-labelledby="panel-probes">
      <h3 id="panel-probes">文章探测器 · 旁轨材料</h3>
      {!probes.length && <p className="entry-empty">尚无已收录的文章探测器。</p>}
      <ol className="entry-list probes">
        {probes.slice(0, probeLimit).map((probe, position) => {
          const date = publicDate(probe.publishedAt)
          const counts = [
            probe.likeCount === undefined ? null : `${probe.likeCount} 赞同`,
            probe.commentCount === undefined ? null : `${probe.commentCount} 评论`,
            probe.favoriteCount === undefined ? null : `${probe.favoriteCount} 收藏`,
          ].filter((item): item is string => item !== null)
          return <li className="entry-row" key={probe.id}>
            <span className="entry-index">旁轨 {String(position + 1).padStart(2, '0')}</span>
            <strong>{probe.title}</strong>
            <span className="entry-meta">
              {probe.authorName || '作者未标注'}
              {date
                ? <> · <time dateTime={date.dateTime}>{date.label}</time></>
                : <> · <span>首发时间未知</span></>}
              {!!counts.length && <> · {counts.join(' · ')}</>}
            </span>
            <div className="entry-provenance"><ProbeRelation probe={probe} /></div>
            <a ref={(node) => {
              if (node) probeActions.current.set(probe.id, node)
              else probeActions.current.delete(probe.id)
            }} className="entry-original" href={probe.url} target="_blank" rel="noopener noreferrer" aria-label="查看知乎原文章">查看原文章 ↗</a>
          </li>
        })}
      </ol>
      {probes.length > ENTRY_LIMIT && <span className="entry-status" role="status" aria-live="polite">
        已显示 {Math.min(probeLimit, probes.length)} 项，共 {probes.length} 项
      </span>}
      {probeLimit < probes.length && <button className="entry-more" type="button" onClick={() => {
        probeFocusId.current = probes[probeLimit]?.id ?? null
        setProbeLimit((count) => Math.min(count + ENTRY_LIMIT, probes.length))
      }}>
        加载更多文章
      </button>}
      {!!probes.length && <p className="entry-note">创作或收藏只说明内容绑定关系，不代表赞同文章立场。</p>}
    </section>
  </>
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

function EvidenceList({ items, highlight, fresh }: {
  items: Evidence[]; highlight?: string; fresh: (y: string) => number
}) {
  return (
    <>
      {items.map((e, i) => (
        <a className={`evp${highlight && e.u === highlight ? ' on' : ''}`} key={i}
          href={e.u} target="_blank" rel="noopener noreferrer">
          {/* 个人内容档案的旧关系标记，不映射为 3D 问题行星。 */}
          <span className={`pdot${e.o ? ' own' : ''}`}
            style={{ opacity: 0.34 + 0.66 * fresh(e.y) }} />
          <span className="evp-t">{e.t}</span>
          <span className="evp-y">{e.y}</span>
        </a>
      ))}
    </>
  )
}

export function Panel({ universe, index, star, onClose, onPickConcept, onEnterQuestion, shared, highlight }: Props) {
  const cluster = star ? universe.clusters.find((c) => c.g === star.g) : null
  const dark: Dark | undefined = star ? universe.dark.find((d) => d.c === star.c) : undefined
  const nebula = star ? universe.nebula.find((n) => n.c === star.c) : undefined
  const rest = star ? star.n - star.ev.length : 0
  // 与 gl/bodies.ts 同一套口径：按全宇宙跨度归一化，跨星系之间才可比
  const fresh = useMemo(() => {
    const lo = new Date(universe.meta.span[0] * 1000).getFullYear()
    const hi = Math.max(new Date(universe.meta.span[1] * 1000).getFullYear() + 1, lo + 1)
    return (y: string) => Math.min(1, Math.max(0, (frac(y) - lo) / (hi - lo)))
  }, [universe.meta])

  if (!star || shared) return null

  return (
    <aside className="pnl open">
      <button className="pnl-close" onClick={onClose} aria-label="关闭">×</button>
      <div className="stagger">
          <div>
            <h2>{star.c}</h2>
            <div className="pnl-strip">
              {star.n} 条内容<u>·</u>{star.o} 创作<u>·</u>{star.f} 收藏<u>·</u>属于「{cluster?.name}」星群
            </div>
          </div>

          <p className="pnl-lead">
            {dark ? (
              <>关于「{star.c}」你留下了 <b>{star.n}</b> 条，最后一条停在 {star.la}，
                <em>已经 {dark.gap} 个月没有新的了</em>。这颗星熄灭了。</>
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

          <SemanticEntries key={'id' in star ? star.id : star.c} index={index} star={star}
            onEnterQuestion={onEnterQuestion} />

          <div>
            <h3>构成它的个人内容档案</h3>
            <div className="lgd">
              <span>点越亮 = 收得越近</span>
              {star.o > 0 && <span><i className="pdot own" />暖色圈 = 我写过的</span>}
            </div>
            <EvidenceList items={star.ev} highlight={highlight} fresh={fresh} />
            {rest > 0 && <div className="rest">另有 {rest} 条未在此列出</div>}
          </div>

          {cluster && cluster.mem.length > 1 && (
            <div>
              <h3>同星群的其他天体</h3>
              <div className="chips">
                {cluster.mem.filter((m) => m !== star.c).map((m) => (
                  <button type="button" key={m} onClick={() => onPickConcept(m)}>{m}</button>
                ))}
              </div>
            </div>
          )}
      </div>
    </aside>
  )
}
