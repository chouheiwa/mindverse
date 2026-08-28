// 落地页背景：星际气体与深空星场。
//
// 只服务落地页。星图本体与分享卡都走 WebGL（gl/），那条管线有 HDR 和 bloom，
// 画质不是这里能比的 —— 但落地页只需要一层氛围底，为它扛进 160KB 的
// three + postprocessing 不划算，首屏更重要。
//
// 配色跟着 gl/scene.ts 的星云走（深蓝紫 / 洋红紫 / 青），
// 否则从落地页点进星图会像换了个产品。
//
// 两层都在屏幕空间，一次预渲染到离屏画布，之后不参与逐帧重绘。

export interface Layer {
  canvas: HTMLCanvasElement
  /** 画布比视口大出的余量，供视差平移使用 */
  pad: number
}

/** 确定性伪随机 —— 同一份数据必须生成同一片星空。 */
function mulberry(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 星际气体：几块极低透明度的大面积辉光。 */
export function makeGas(w: number, h: number, dpr: number, seed = 20260827): Layer {
  const pad = 160
  const cv = document.createElement('canvas')
  cv.width = Math.ceil((w + pad * 2) * dpr)
  cv.height = Math.ceil((h + pad * 2) * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  const rnd = mulberry(seed)
  const cx = pad + w / 2
  const cy = pad + h * 0.47

  const clouds: [number, number, number, number, string][] = [
    [cx - 60, cy - 40, w * 0.46, h * 0.42, 'rgba(58,74,196,.70)'],
    [cx - 240, cy + 60, w * 0.30, h * 0.27, 'rgba(20,118,152,.40)'],
    [cx + 220, cy - 90, w * 0.32, h * 0.29, 'rgba(158,52,146,.42)'],
    [cx + 90, cy + 80, w * 0.38, h * 0.26, 'rgba(88,44,168,.48)'],
    [cx - 30, cy - 150, w * 0.24, h * 0.20, 'rgba(28,132,150,.22)'],
  ]
  ctx.filter = 'blur(62px)'
  for (const [x, y, rw, rh, color] of clouds) {
    const jx = x + (rnd() - 0.5) * 40
    const jy = y + (rnd() - 0.5) * 40
    const g = ctx.createRadialGradient(jx, jy, 0, jx, jy, Math.max(rw, rh) / 2)
    g.addColorStop(0, color)
    g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g
    ctx.save()
    ctx.translate(jx, jy)
    ctx.scale(1, rh / rw)
    ctx.beginPath()
    ctx.arc(0, 0, rw / 2, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
  ctx.filter = 'none'
  return { canvas: cv, pad }
}

interface FieldStar {
  x: number
  y: number
  r: number
  a: number
  ph: number
}

export interface StarField {
  deep: Layer
  /** 近景少而亮，逐帧画出来才有闪烁 */
  near: FieldStar[]
}

/** 深空星场：向中心聚集，中心密、外围疏。 */
export function makeField(w: number, h: number, dpr: number, seed = 731): StarField {
  const pad = 160
  const cv = document.createElement('canvas')
  cv.width = Math.ceil((w + pad * 2) * dpr)
  cv.height = Math.ceil((h + pad * 2) * dpr)
  const ctx = cv.getContext('2d')!
  ctx.scale(dpr, dpr)

  const rnd = mulberry(seed)
  const cx = pad + w / 2
  const cy = pad + h * 0.47
  const reach = Math.max(w, h) * 0.78

  const plot = (n: number, concentrate: number, rMin: number, rMax: number, aMin: number, aMax: number) => {
    for (let i = 0; i < n; i++) {
      const a = rnd() * Math.PI * 2
      const rr = Math.pow(rnd(), concentrate) * reach
      const x = cx + Math.cos(a) * rr * 1.32
      const y = cy + Math.sin(a) * rr * 0.54 // 盘是扁的
      if (x < 0 || x > cv.width || y < 0 || y > cv.height) continue
      const rad = rMin + rnd() * (rMax - rMin)
      ctx.fillStyle = `rgba(214,226,255,${(aMin + rnd() * (aMax - aMin)).toFixed(2)})`
      ctx.beginPath()
      ctx.arc(x, y, rad, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  plot(360, 1.5, 0.4, 0.7, 0.09, 0.3) // 远景
  plot(130, 1.2, 0.6, 1.1, 0.2, 0.52) // 中景

  const near: FieldStar[] = []
  for (let i = 0; i < 30; i++) {
    const a = rnd() * Math.PI * 2
    const rr = Math.pow(rnd(), 0.9) * reach
    near.push({
      x: w / 2 + Math.cos(a) * rr * 1.32,
      y: h * 0.47 + Math.sin(a) * rr * 0.54,
      r: 0.9 + rnd() * 0.9,
      a: 0.42 + rnd() * 0.4,
      ph: rnd() * Math.PI * 2,
    })
  }

  return { deep: { canvas: cv, pad }, near }
}
