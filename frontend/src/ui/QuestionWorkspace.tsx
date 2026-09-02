import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { UniverseIndex } from '../domain/universe'
import { buildQuestionWorkspaceModel, type PersonalWorkspaceAnswer, type WorkspaceAnswer } from './questionWorkspaceModel'
import { useModalDialogLifecycle } from './modalDialogLifecycle'
import './QuestionWorkspace.css'

type Mode = 'personal' | 'retrospective' | 'prism'
const PAGE_SIZE = 50
const MOBILE_QUERY = '(max-width: 760px)'
const PUBLIC_DATE_FORMATTER = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric', month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai',
})
const PUBLIC_DATE_KEY_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Shanghai',
})

const formatDate = (seconds: number | undefined) => {
  if (seconds === undefined || !Number.isFinite(seconds) || seconds <= 0) return null
  const date = new Date(seconds * 1000)
  if (!Number.isFinite(date.getTime())) return null
  const parts = Object.fromEntries(PUBLIC_DATE_KEY_FORMATTER.formatToParts(date).map(({ type, value }) => [type, value]))
  return { label: PUBLIC_DATE_FORMATTER.format(date), dateTime: `${parts.year}-${parts.month}-${parts.day}` }
}

function OriginalAnswer({ answer }: { answer: WorkspaceAnswer }) {
  const date = formatDate(answer.publishedAt)
  return (
    <li className="qw-answer">
      <div className="qw-answer-meta">
        <span>{answer.authorName || '作者未标注'}</span>
        {date ? <time dateTime={date.dateTime}>{date.label}</time> : <span>首发时间未知</span>}
      </div>
      {'summary' in answer && answer.summary && <p>{answer.summary}</p>}
      <a href={answer.url} target="_blank" rel="noopener noreferrer"
        aria-label={`查看原回答${answer.authorName ? ` · ${answer.authorName}` : ''}`}>
        {answer.authorName ? `查看 ${answer.authorName} 的原回答` : '查看原回答'}
      </a>
    </li>
  )
}

function PaginatedOriginals({ answers, className = 'qw-originals' }: {
  answers: readonly WorkspaceAnswer[]
  className?: string
}) {
  const [visible, setVisible] = useState(PAGE_SIZE)
  const shown = Math.min(visible, answers.length)
  const statusRef = useRef<HTMLSpanElement>(null)
  const focusStatusRef = useRef(false)
  useLayoutEffect(() => {
    if (!focusStatusRef.current) return
    focusStatusRef.current = false
    statusRef.current?.focus()
  }, [shown])
  return <>
    <ol className={className}>{answers.slice(0, shown).map((answer) => <OriginalAnswer key={answer.id} answer={answer} />)}</ol>
    <div className="qw-page">
      <span ref={statusRef} role="status" tabIndex={-1}>{shown === answers.length ? `已显示全部 ${answers.length} 条` : `已显示 ${shown} / ${answers.length} 条`}</span>
      {shown < answers.length && <button type="button" className="qw-more" onClick={() => {
        focusStatusRef.current = true
        setVisible((count) => count + PAGE_SIZE)
      }}>加载更多</button>}
    </div>
  </>
}

function useMobileTabs(): boolean {
  const [mobile, setMobile] = useState(() => typeof matchMedia !== 'undefined' && matchMedia(MOBILE_QUERY).matches)
  useEffect(() => {
    if (typeof matchMedia === 'undefined') return
    const media = matchMedia(MOBILE_QUERY)
    const onChange = (event: MediaQueryListEvent) => setMobile(event.matches)
    if (typeof media.addEventListener === 'function') media.addEventListener('change', onChange)
    else media.addListener(onChange)
    return () => {
      if (typeof media.removeEventListener === 'function') media.removeEventListener('change', onChange)
      else media.removeListener(onChange)
    }
  }, [])
  return mobile
}

function PersonalPanel({ answers }: { answers: readonly PersonalWorkspaceAnswer[] }) {
  const created = answers.filter((answer) => answer.relations.includes('created'))
  const collected = answers.filter((answer) => answer.relations.includes('collected'))
  return (
    <div className="qw-personal">
      {!answers.length && (
        <p className="qw-guidance">这里还没有可证明的个人轨道。只有 OAuth 返回的创作或收藏绑定，才能说明你与回答的关系；公开搜索、收藏列表发现或本人内容发现都不能单独证明个人关系。</p>
      )}
      <section aria-labelledby="qw-created">
        <p className="qw-kicker">RELATION · CREATED</p>
        <h2 id="qw-created">我创作</h2>
        {created.length ? <PaginatedOriginals answers={created} />
          : <p className="qw-empty">当前样本中没有带有“创作”绑定的回答。</p>}
      </section>
      <section aria-labelledby="qw-collected">
        <p className="qw-kicker">RELATION · COLLECTED</p>
        <h2 id="qw-collected">我收藏</h2>
        {collected.length ? <PaginatedOriginals answers={collected} />
          : <p className="qw-empty">当前样本中没有带有“收藏”绑定的回答。收藏只表示保存过，不推断你的态度。</p>}
      </section>
    </div>
  )
}

function RetrospectivePanel({ chronicle }: {
  chronicle: Extract<ReturnType<typeof buildQuestionWorkspaceModel>, { status: 'ready' }>['chronicle']
}) {
  if (chronicle.status === 'insufficient') {
    return (
      <div className="qw-retrospective">
        <section className="qw-thresholds" aria-labelledby="qw-threshold-title">
          <p className="qw-kicker">EVIDENCE GATE</p>
          <h2 id="qw-threshold-title">尚不足以建立跨年回溯</h2>
          <dl>
            <div><dt>可用首发时间</dt><dd>{chronicle.actual.eligibleAnswers} / {chronicle.requirements.eligibleAnswers}</dd></div>
            <div><dt>稳定作者</dt><dd>{chronicle.actual.stableAuthors} / {chronicle.requirements.stableAuthors}</dd></div>
            <div><dt>时间跨度</dt><dd>{chronicle.actual.spanDays} 天（需至少 {chronicle.requirements.calendarYears} 个 UTC 日历年）</dd></div>
          </dl>
          <p>只采用有效的首发时间；更新时间和采集时间不会替代或拉长跨度。</p>
        </section>
        <section aria-labelledby="qw-original-title">
          <h2 id="qw-original-title">当前样本原文</h2>
          {chronicle.flatItems.length
            ? <PaginatedOriginals answers={chronicle.flatItems} />
            : <p className="qw-empty">这个问题尚无当前可访问的已收录回答，可先核验原问题。</p>}
        </section>
      </div>
    )
  }
  return (
    <div className="qw-retrospective">
      <section aria-labelledby="qw-chronicle-title">
        <p className="qw-kicker">RETROSPECTIVE · CURRENT SAMPLE</p>
        <h2 id="qw-chronicle-title">答案纪年 · 当前样本回溯</h2>
        <PaginatedOriginals answers={chronicle.flatItems} className="qw-timeline" />
      </section>
    </div>
  )
}

function PrismPanel() {
  return (
    <section className="qw-abstain" aria-labelledby="qw-prism-title">
      <p className="qw-kicker">PRISM · ABSTAINED</p>
      <h2 id="qw-prism-title">证据不足，暂不生成观点结构</h2>
      <p>当前证据无法可靠辨认观点主张、分歧与支持关系。这里不会为了视觉完整性填入 AI 推测的立场；请沿原文自行核验。</p>
    </section>
  )
}

export interface QuestionWorkspaceProps {
  index: UniverseIndex
  questionId: string
  shared?: boolean
  readOnly?: boolean
  orbitIndex?: number
  onBack: () => void
  onRestoreCamera: () => void
  /** Orbit the live, already-selected 3D planet behind this observatory. */
  onOrbit?: (deltaX: number, deltaY: number) => void
  onEnterStrata?: (questionId: string) => void
  strataActive?: boolean
  getReturnFocus?: () => HTMLElement | null
}

export function QuestionWorkspace({ index, questionId, shared = false, readOnly = false, orbitIndex,
  onBack, onRestoreCamera, onOrbit, onEnterStrata, strataActive = false, getReturnFocus }: QuestionWorkspaceProps) {
  const isPublic = shared || readOnly
  const mobileTabs = useMobileTabs()
  const tabs: readonly Mode[] = isPublic ? ['retrospective', 'prism'] : ['personal', 'retrospective', 'prism']
  const [mode, setMode] = useState<Mode>(isPublic ? 'retrospective' : 'personal')
  const activeMode: Mode = isPublic && mode === 'personal' ? 'retrospective' : mode
  const model = useMemo(() => buildQuestionWorkspaceModel(index, questionId, { shared, readOnly }), [index, questionId, shared, readOnly])
  const dialogRef = useRef<HTMLDialogElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const tabRefs = useRef(new Map<Mode, HTMLButtonElement>())
  const previousPublicRef = useRef(isPublic)
  const closedRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; x: number; y: number } | null>(null)
  const modal = useModalDialogLifecycle(dialogRef, { getReturnFocus, initialFocusRef: headingRef })

  useLayoutEffect(() => {
    if (previousPublicRef.current === isPublic) return
    previousPublicRef.current = isPublic
    tabRefs.current.get(activeMode)?.focus()
  }, [activeMode, isPublic])

  const close = () => {
    if (closedRef.current) return
    closedRef.current = true
    onRestoreCamera()
    onBack()
  }

  const selectTab = (next: Mode, focus = false) => {
    setMode(next)
    if (focus) queueMicrotask(() => tabRefs.current.get(next)?.focus())
  }

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const current = tabs.indexOf(activeMode)
    let next: number | undefined
    if (event.key === 'ArrowRight' || (!mobileTabs && event.key === 'ArrowDown')) next = (current + 1) % tabs.length
    if (event.key === 'ArrowLeft' || (!mobileTabs && event.key === 'ArrowUp')) next = (current - 1 + tabs.length) % tabs.length
    if (event.key === 'Home') next = 0
    if (event.key === 'End') next = tabs.length - 1
    if (next === undefined) return
    event.preventDefault()
    selectTab(tabs[next], true)
  }

  const onDialogKeyDown = (event: React.KeyboardEvent<HTMLDialogElement>) => {
    modal.onKeyDown(event)
    if (event.key === 'Escape' && !modal.nativeModalRef.current) {
      event.preventDefault()
      close()
    }
  }

  const labels: Record<Mode, string> = { personal: '个人轨道', retrospective: '回溯', prism: '棱镜' }
  return (
    <dialog ref={dialogRef} className="qw" aria-modal="true" aria-labelledby="qw-title" onKeyDown={onDialogKeyDown}
      onCancel={(event) => { event.preventDefault(); close() }}>
      <header className="qw-head">
        <button type="button" className="qw-back" onClick={close} aria-label="返回问题航道">← 返回问题航道</button>
        <span>QUESTION OBSERVATORY{orbitIndex ? ` · ORBIT ${String(orbitIndex).padStart(2, '0')}` : ''}</span>
        {model.status === 'ready' && <a href={model.question.url} target="_blank" rel="noopener noreferrer">知乎原问题</a>}
      </header>
      {model.status === 'error' ? (
        <main className="qw-error"><h1 id="qw-title" ref={headingRef} tabIndex={-1}>无法建立问题工作台</h1><p>{model.message}</p></main>
      ) : (
        <main className="qw-main">
          <section className="qw-planet-stage" aria-label="问题行星近景"
            onPointerDown={(event) => {
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
              event.currentTarget.setPointerCapture?.(event.pointerId)
            }}
            onPointerMove={(event) => {
              const previous = dragRef.current
              if (!previous || previous.pointerId !== event.pointerId) return
              const deltaX = event.clientX - previous.x
              const deltaY = event.clientY - previous.y
              if (deltaX !== 0 || deltaY !== 0) onOrbit?.(deltaX, deltaY)
              dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY }
            }}
            onPointerUp={(event) => {
              if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null
              event.currentTarget.releasePointerCapture?.(event.pointerId)
            }}
            onPointerCancel={() => { dragRef.current = null }}>
            <div className="qw-reticle" aria-hidden="true"><i /><i /><i /></div>
            <div className="qw-planet-readout">
              <span>LIVE OBJECT · QUESTION</span>
              <b>{model.answerCount} 条可核验回答</b>
            </div>
            <div className="qw-planet-controls">
              <span>拖动旋转 · 观察表面</span>
              <button type="button" disabled={strataActive || !onEnterStrata}
                onClick={() => onEnterStrata?.(questionId)}>
                {strataActive ? '正在进入答案地层' : '打开答案地层'}
              </button>
            </div>
            <p className="qw-strata-disclaimer">
              当前仍可访问的答案按首发时间排列，不代表当年观点或社区份额；列表存在幸存者偏差与版本偏差。
            </p>
          </section>
          <div className="qw-titleblock">
            <p>当前样本 · <span>{model.answerCount} 个当前可访问回答</span></p>
            <h1 id="qw-title" ref={headingRef} tabIndex={-1}>{model.question.title}</h1>
            <p className="qw-provenance">仅呈现此问题在本次规范化索引中仍可访问的回答；不声称覆盖知乎全部历史内容。</p>
          </div>
          <nav className="qw-rail" aria-label="问题观察模式">
            <div role="tablist" aria-orientation={mobileTabs ? 'horizontal' : 'vertical'}>
              {tabs.map((tab, position) => <button key={tab} ref={(node) => {
                if (node) tabRefs.current.set(tab, node)
                else tabRefs.current.delete(tab)
              }}
                type="button" role="tab" id={`qw-tab-${tab}`} aria-label={labels[tab]} aria-controls={`qw-panel-${tab}`}
                aria-selected={activeMode === tab} tabIndex={activeMode === tab ? 0 : -1}
                onKeyDown={onTabKeyDown} onClick={(event) => { selectTab(tab); event.currentTarget.focus() }}>
                <span>{String(position + 1).padStart(2, '0')}</span>{labels[tab]}
              </button>)}
            </div>
          </nav>
          <div className="qw-reading" role="tabpanel" id={`qw-panel-${activeMode}`} aria-labelledby={`qw-tab-${activeMode}`}>
            {activeMode === 'personal' && model.personal && <PersonalPanel answers={model.personal.items} />}
            {activeMode === 'retrospective' && <RetrospectivePanel chronicle={model.chronicle} />}
            {activeMode === 'prism' && <PrismPanel />}
          </div>
        </main>
      )}
    </dialog>
  )
}
