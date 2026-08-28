import { useEffect, useRef, useState } from 'react'
import { getOAuthStatus } from '../api'
import type { OAuthStatus } from '../types'
import { makeGas, makeField } from '../starmap/layers'
import './Landing.css'

/** 落地页背景：和星图同一套图层，让入口就已经在宇宙里。 */
function useBackdrop(ref: React.RefObject<HTMLCanvasElement | null>) {
  useEffect(() => {
    const cv = ref.current
    if (!cv) return
    let raf = 0
    let gas = makeGas(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2))
    let field = makeField(innerWidth, innerHeight, Math.min(devicePixelRatio || 1, 2))
    const ctx = cv.getContext('2d')!
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches

    const size = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      cv.width = innerWidth * dpr
      cv.height = innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      gas = makeGas(innerWidth, innerHeight, dpr)
      field = makeField(innerWidth, innerHeight, dpr)
    }
    size()

    const draw = (t: number) => {
      const dpr = Math.min(devicePixelRatio || 1, 2)
      ctx.clearRect(0, 0, innerWidth, innerHeight)
      const drift = reduce ? 0 : Math.sin(t / 26000) * 22
      // 铺一层底，再加性叠一层：单层在这么深的底色上会被吃掉，两层才有「发光的气体」
      ctx.drawImage(gas.canvas, -gas.pad + drift, -gas.pad,
        gas.canvas.width / dpr, gas.canvas.height / dpr)
      ctx.globalCompositeOperation = 'lighter'
      ctx.globalAlpha = 0.55
      ctx.drawImage(gas.canvas, -gas.pad + drift, -gas.pad,
        gas.canvas.width / dpr, gas.canvas.height / dpr)
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(field.deep.canvas, -field.deep.pad + drift * 1.6, -field.deep.pad,
        field.deep.canvas.width / dpr, field.deep.canvas.height / dpr)
      ctx.globalCompositeOperation = 'lighter'
      for (const s of field.near) {
        const tw = reduce ? 1 : 0.55 + 0.45 * Math.sin(t / 1400 + s.ph)
        ctx.fillStyle = `rgba(226,234,255,${(s.a * tw * 0.8).toFixed(3)})`
        ctx.beginPath()
        ctx.arc(s.x + drift * 2, s.y, s.r, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }
    raf = requestAnimationFrame(draw)
    addEventListener('resize', size)
    return () => { cancelAnimationFrame(raf); removeEventListener('resize', size) }
  }, [ref])
}

export function Landing() {
  const cv = useRef<HTMLCanvasElement>(null)
  useBackdrop(cv)
  const [st, setSt] = useState<OAuthStatus | null>(null)
  const [err, setErr] = useState(false)

  useEffect(() => { getOAuthStatus().then(setSt).catch(() => setErr(true)) }, [])

  const warn = st?.warnings?.length ? st.warnings.map((w) => w.message).join(' ') : null
  const blocked = !st || st.localOnly || !st.configured
  let note = '点击后会跳转到知乎的授权页，最终的确认按钮由你本人点击。'
  if (err) note = '无法连接服务'
  else if (!st) note = '正在检查登录状态…'
  else if (st.authorized) note = `已授权${st.profile?.name ? '：' + st.profile.name : ''}`
  else if (st.localOnly) note = '当前是本地地址，只能预览页面 —— 知乎登录需要先把应用部署到公网 HTTPS 并登记回调地址。'
  else if (!st.configured) note = 'OAuth 凭证尚未配置完整（App ID / App Key / Access Secret）。'

  return (
    <div className="lp">
      <canvas ref={cv} className="lp-canvas" />
      <div className="vignette" />
      <div className="grain" />
      <div className="lbl lp-eyebrow">知乎黑客松 2026 · 灵魂匹配局</div>

      <div className="lp-wrap">
        <div>
          <h1>你以为你在<br />关注很多件事</h1>
          <p className="lp-lede">
            把你的知乎收藏和创作放进来，它们会坍缩成一片星空。
            然后我们带你穿过其中一道裂缝 —— 那里通常写着
            <em>你这些年其实一直在追同一个问题</em>。
          </p>

          <div className="lp-actions">
            <button className="primary" disabled={blocked && !st?.authorized}
              onClick={() => location.href = st?.authorized ? '/universe.html' : '/auth/start'}>
              {st?.authorized ? '进入我的宇宙' : '用知乎账号进入'}
            </button>
            <button onClick={() => location.href = '/universe.html?seed=1'}>游客模式</button>
            <button onClick={() => location.href = '/universe.html'}>先看示例宇宙</button>
          </div>
          <div className={`lp-note${warn || (st && blocked) ? ' warn' : ''}`}>{warn || note}</div>

          <div className="lp-promises">
            <div>
              <h3>不存原文</h3>
              <p>内容只在内存里过一遍，落盘的只有算出来的结构。</p>
            </div>
            <div>
              <h3>不贴人格标签</h3>
              <p>给你的是两个算出来的数字，每条结论都能点回原文。</p>
            </div>
            <div>
              <h3>随时可删</h3>
              <p>星图里有「立即删除我的宇宙」，即时生效。</p>
            </div>
          </div>
        </div>

        <div className="lp-preview">
          <div className="lp-legend">
            <span><i style={{ width: 7, height: 7, borderRadius: '50%', background: '#FFF',
              boxShadow: '0 0 8px rgba(195,208,255,.7)', display: 'block' }} />你写过的</span>
            <span><i style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)',
              boxShadow: '0 0 8px rgba(255,196,107,.6)', display: 'block' }} />你只收藏过的</span>
            <span><svg width="18" height="7"><path d="M0 4 L18 4" stroke="#FFC46B" strokeWidth="1.4"
              strokeDasharray="3 5" /></svg>虫洞</span>
          </div>
        </div>
      </div>
    </div>
  )
}
