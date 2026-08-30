import type { Universe } from '../types'
import { renderStill } from './gl/still'

/**
 * 宇宙身份证：540×960（9:16），按 2 倍导出即 1080×1920。
 *
 * 版式直接在 canvas 上画，不引 html2canvas —— 依赖少、可控。
 * 但英雄图不再是 2D 重画的一张缩略图：它是用实时星图那条 WebGL 管线
 * 渲的一帧静帧（gl/still.ts）。卡片和星图必须是同一个宇宙，
 * 两套画法就会长成两个产品。
 *
 * 版面主次按设计文档：虫洞是主角，好奇心结构只占底部一行。
 * 「人格名称是配角，不是卖点」—— 贴标签这件事已经被 Wrapped 做烂了。
 */

const W = 540
const H = 960
const PAD = 38

const INK = '#DDE4F2'
const DIM = '#9AA4BE'
const MUTE = '#697291'
const AMBER = '#FFC46B'
const RULE = '#161D33'

const F_D = '"Noto Serif SC", Songti SC, Georgia, serif'
const F_B = '"Noto Sans SC", -apple-system, "PingFang SC", sans-serif'
const F_M = '"IBM Plex Mono", ui-monospace, Menlo, monospace'

export interface CardOptions {
  shareId?: string
  shareHost?: string
  scale?: number
}

/** 字体没就绪就画，中文会掉成 fallback。 */
export async function drawCard(u: Universe, opts: CardOptions = {}): Promise<HTMLCanvasElement> {
  if (document.fonts?.ready) {
    try { await document.fonts.ready } catch { /* 拿不到就直接画 */ }
  }
  const scale = opts.scale ?? 2
  const cv = document.createElement('canvas')
  cv.width = W * scale
  cv.height = H * scale
  const ctx = cv.getContext('2d')!
  ctx.scale(scale, scale)
  paint(ctx, u, opts)
  return cv
}

function paint(ctx: CanvasRenderingContext2D, u: Universe, opts: CardOptions) {
  ctx.fillStyle = '#04060F'
  ctx.fillRect(0, 0, W, H)

  // ── 上半部：星图本体的一帧，不是另画一张缩略图 ──
  const BAND = 470
  const still = renderStill(u, W, BAND)
  ctx.drawImage(still.canvas, 0, 0)

  // 上下两道压暗：顶栏和下方正文都压在这张图上，得读得清
  const top = ctx.createLinearGradient(0, 0, 0, 110)
  top.addColorStop(0, 'rgba(4,6,15,.82)')
  top.addColorStop(1, 'rgba(4,6,15,0)')
  ctx.fillStyle = top
  ctx.fillRect(0, 0, W, 110)

  const bottom = ctx.createLinearGradient(0, BAND - 230, 0, BAND)
  bottom.addColorStop(0, 'rgba(4,6,15,0)')
  bottom.addColorStop(0.62, 'rgba(4,6,15,.86)')
  bottom.addColorStop(1, '#04060F')
  ctx.fillStyle = bottom
  ctx.fillRect(0, BAND - 230, W, 230)

  let y = PAD + 10

  // 顶部标识
  label(ctx, '知乎精神宇宙', PAD, y)
  ctx.font = `500 10px ${F_M}`
  ctx.fillStyle = '#4B5674'
  ctx.textAlign = 'right'
  ctx.fillText(opts.shareId ? `NO. ${opts.shareId}` : 'PREVIEW', W - PAD, y)
  ctx.textAlign = 'left'

  // ── 星群名压在星图上 ──
  drawStillLabels(ctx, still.labels, 96, 250)
  y += 34 + 250 + 26

  // ── 虫洞：整张卡的主角 ──
  const w = u.wormholes[0]
  if (w) {
    label(ctx, '意外的连接', PAD, y, AMBER)
    y += 24
    ctx.fillStyle = INK
    ctx.font = `700 29px ${F_D}`
    y = wrap(ctx, '我以为我在关注两件不相干的事', PAD, y + 14, W - PAD * 2, 43)

    y += 16
    ctx.font = `300 14px ${F_B}`
    y = rich(ctx, [
      { t: `「${w.an}」和「${w.bn}」在我全部足迹里`, c: DIM },
      { t: `只相遇过 ${w.obs} 次`, c: INK, m: true },
      { t: '，随机情况下本该相遇 ', c: DIM },
      { t: `${w.exp}`, c: INK, m: true },
      { t: ' 次。', c: DIM },
    ], PAD, y, W - PAD * 2, 25)
  } else {
    label(ctx, '我的星图', PAD, y)
    y += 24
    ctx.fillStyle = INK
    ctx.font = `700 29px ${F_D}`
    y = wrap(ctx, '这是我的好奇心结成的形状', PAD, y + 14, W - PAD * 2, 43)
  }

  // ── 最亮的三颗 ──
  y += 26
  rule(ctx, y)
  y += 22
  label(ctx, '最亮的三颗', PAD, y)
  y += 22

  const brightest = [...u.stars]
    .sort((a, b) => b.pe * Math.log(1 + b.n) - a.pe * Math.log(1 + a.n))
    .slice(0, 3)
  for (let i = 0; i < brightest.length; i++) {
    const s = brightest[i]
    const cy = y + 8
    const r = 7 - i * 0.8
    ctx.save()
    ctx.shadowColor = `hsla(${s.hue},80%,72%,.8)`
    ctx.shadowBlur = 12 - i * 2
    ctx.fillStyle = `hsl(${s.hue},${Math.max(8, s.sat)}%,${92 - i * 5}%)`
    ctx.beginPath()
    ctx.arc(PAD + r / 2, cy, r / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()

    ctx.fillStyle = INK
    ctx.font = `400 15px ${F_B}`
    ctx.fillText(s.c, PAD + 20, cy + 5)

    ctx.fillStyle = MUTE
    ctx.font = `400 11px ${F_M}`
    ctx.textAlign = 'right'
    ctx.fillText(months(s), W - PAD, cy + 4)
    ctx.textAlign = 'left'
    y += 26
  }

  // ── 熄灭的星：一行，但是最扎心的一行 ──
  const d = u.dark[0]
  if (d) {
    y += 8
    ctx.fillStyle = 'rgba(255,196,107,.05)'
    ctx.fillRect(PAD, y, W - PAD * 2, 58)
    ctx.fillStyle = 'rgba(255,196,107,.5)'
    ctx.fillRect(PAD, y, 2, 58)
    ctx.font = `300 13.5px ${F_B}`
    rich(ctx, [
      { t: '还有一片不再发光的地方 —— ', c: DIM },
      { t: `「${d.c}」留下 ${d.n} 条，已经 ${d.gap} 个月没有新的了。`, c: AMBER },
    ], PAD + 16, y + 22, W - PAD * 2 - 32, 22)
  }

  // ── 宇宙边缘：只出现过一两次的概念，最可能通向别处 ──
  const solo = u.solo[0]
  if (solo) {
    y += 74
    rule(ctx, y - 20)
    label(ctx, '宇宙边缘', PAD, y)
    y += 22
    ctx.save()
    ctx.shadowColor = 'rgba(155,176,255,.7)'
    ctx.shadowBlur = 9
    ctx.fillStyle = '#9BB0FF'
    ctx.beginPath()
    ctx.arc(PAD + 3, y + 3, 2.6, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
    ctx.font = `300 13.5px ${F_B}`
    rich(ctx, [
      { t: '「', c: DIM },
      { t: solo.c, c: INK },
      { t: `」在我全部足迹里只出现过 ${solo.n} 次 —— 少到连成星的资格都没有。`, c: DIM },
    ], PAD + 20, y + 8, W - PAD * 2 - 20, 22)
  }

  // ── 底部：人格是配角 ──
  const fy = H - PAD - 64
  rule(ctx, fy - 22)
  label(ctx, '好奇心结构', PAD, fy)
  ctx.fillStyle = INK
  ctx.font = `700 17px ${F_D}`
  ctx.fillText(quadrant(u), PAD, fy + 26)
  ctx.fillStyle = MUTE
  ctx.font = `400 10.5px ${F_M}`
  ctx.fillText(`扎实度 ${u.meta.medz}　·　跨界 ${u.meta.p10z}`, PAD, fy + 46)

  ctx.textAlign = 'right'
  ctx.fillStyle = MUTE
  ctx.font = `400 10.5px ${F_M}`
  ctx.fillText('每颗星都能点回原文', W - PAD, fy + 26)
  ctx.fillStyle = '#9BB0FF'
  const host = opts.shareHost ?? location.host
  ctx.fillText(opts.shareId ? `${host}/s/${opts.shareId}` : host, W - PAD, fy + 46)
  ctx.textAlign = 'left'
}

// ── 排版工具 ──

function label(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color = MUTE) {
  ctx.fillStyle = color
  ctx.font = `500 10px ${F_M}`
  ctx.fillText(spaced(text), x, y)
}

/** canvas 没有 letter-spacing，手动插空格模拟字距。 */
function spaced(s: string) {
  return s.split('').join(' ')
}

function rule(ctx: CanvasRenderingContext2D, y: number) {
  ctx.fillStyle = RULE
  ctx.fillRect(PAD, y, W - PAD * 2, 1)
}

function wrap(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxW: number, lh: number) {
  let line = ''
  for (const ch of text) {
    if (ctx.measureText(line + ch).width > maxW && line) {
      ctx.fillText(line, x, y)
      y += lh
      line = ch
    } else {
      line += ch
    }
  }
  if (line) { ctx.fillText(line, x, y); y += lh }
  return y
}

interface Span { t: string; c: string; m?: boolean }

/** 富文本行：按字符逐个测宽换行，中文没有词边界。 */
function rich(ctx: CanvasRenderingContext2D, spans: Span[], x: number, y: number, maxW: number, lh: number) {
  let cx = x
  const base = ctx.font
  for (const sp of spans) {
    ctx.font = sp.m ? base.replace(F_B, F_M) : base
    ctx.fillStyle = sp.c
    for (const ch of sp.t) {
      const wch = ctx.measureText(ch).width
      if (cx + wch > x + maxW) { cx = x; y += lh }
      ctx.fillText(ch, cx, y)
      cx += wch
    }
  }
  ctx.font = base
  return y + lh
}

function months(s: { fi: string; la: string }) {
  const [fy, fm] = s.fi.split('.').map(Number)
  const [ly, lm] = s.la.split('.').map(Number)
  const n = (ly - fy) * 12 + (lm - fm) + 1
  return `亮了 ${n} 个月`
}

/** 象限由两个算出来的数字决定，不是模型贴的标签。 */
function quadrant(u: Universe): string {
  const solid = u.meta.medz > -1.2
  const cross = u.meta.p10z < -2.5
  if (solid && cross) return '造桥的人'
  if (solid) return '深井'
  if (cross) return '游荡者'
  return '拾荒者'
}

/**
 * 星群名。
 *
 * 落点由 gl/still.ts 用渲染那一帧的同一台相机投影出来，所以文字是真的贴在
 * 星群上，而不是照着一套二次投影另摆一遍 —— 后者必然对不齐。
 * 按规模优先、重叠即跳过，和星图里的规则一致。
 */
function drawStillLabels(
  ctx: CanvasRenderingContext2D,
  labels: { name: string; x: number; y: number }[],
  top: number,
  bottom: number,
) {
  ctx.save()
  ctx.font = `500 12px ${F_B}`
  ctx.textAlign = 'center'
  ctx.shadowColor = 'rgba(4,7,18,.95)'
  ctx.shadowBlur = 8

  const boxes: [number, number, number, number][] = []
  let drawn = 0
  for (const l of labels) {
    if (drawn >= 6) break
    if (l.y < top || l.y > bottom) continue
    const ly = l.y - 14
    const w = ctx.measureText(l.name).width
    if (l.x - w / 2 < PAD || l.x + w / 2 > W - PAD) continue
    const box: [number, number, number, number] = [l.x - w / 2 - 6, ly - 13, l.x + w / 2 + 6, ly + 6]
    if (boxes.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1])) continue
    boxes.push(box)
    ctx.fillStyle = 'rgba(232,238,252,.88)'
    ctx.fillText(l.name, l.x, ly)
    drawn++
  }
  ctx.restore()
}
