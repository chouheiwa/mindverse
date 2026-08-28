import './Loading.css'

interface Props {
  stage: string
  progress: number
  error?: string | null
  gone: boolean
}

/**
 * 生成过程。8–15 秒不该是进度条 —— 奇点已经在屏幕上，物质正在落进去，
 * 用户不是在等，是已经在看。
 */
export function Loading({ stage, progress, error, gone }: Props) {
  const step = progress < 30 ? 0 : progress < 70 ? 1 : 2
  return (
    <>
      <div className={`ld${gone ? ' gone' : ''}`}>
        {!error && (
          <div className="ld-core" aria-hidden>
            <div className="ld-disc"><i /></div>
            <div className="ld-halo" />
            <div className="ld-sing" />
          </div>
        )}
        <div className="ld-box">
          <div className="lbl" style={{ marginBottom: 16 }}>知乎精神宇宙</div>
          <h2 className={`ld-stage${error ? ' ld-err' : ''}`}>{error || stage}</h2>
          {!error && (
            <>
              <div className="ld-steps">
                {['读取', '理解', '成形'].map((t, i) => (
                  <div key={t} className={`ld-step${i <= step ? ' on' : ''}${i === step ? ' now' : ''}`}>
                    <span className="ld-dot" />
                    <span className="lbl" style={{ letterSpacing: '.14em', color: i <= step ? 'var(--dim)' : undefined }}>{t}</span>
                  </div>
                ))}
              </div>
              <p className="ld-note">这些内容只在内存里过一遍，落盘的只有算出来的结构。</p>
            </>
          )}
        </div>
      </div>
      {!gone && !error && (
        <div className="ld-hair"><i style={{ width: `${Math.max(4, progress)}%` }} /></div>
      )}
    </>
  )
}
