// 标签绘制。
//
// 唯一留在 Canvas 2D 上的东西 —— 文字就该用文字渲染器画。它铺在 3D 画布之上、
// 不参与 bloom，这是对的：让标签发光只会让它们变得读不清。
//
// 投影交给各自的渲染器，排版与去重叠留在这里，两个引擎才会画出同一套字。

export const LABEL_FONT = '600 13px "Noto Sans SC", -apple-system, "PingFang SC", sans-serif'

export interface PaintableLabel {
  readonly text: string
  /** CSS 像素，已是最终落笔位置。 */
  readonly x: number
  readonly y: number
  readonly opacity: number
  /** 线性 RGB；描边恒为深色，填充按色相微调。 */
  readonly tint: readonly [number, number, number]
}

export interface LabelViewport {
  readonly width: number
  readonly height: number
}

/**
 * 按传入顺序落笔，后来的与已落笔的框重叠就跳过 —— 规模优先由调用方排序保证。
 *
 * @returns 实际画出的标签数量。
 */
export function paintLabels(
  context: CanvasRenderingContext2D,
  viewport: LabelViewport,
  labels: readonly PaintableLabel[],
): number {
  context.clearRect(0, 0, viewport.width, viewport.height)
  // 描边而不是投影。shadowBlur 是把字往外糊一圈，字本身的边缘反而更软；
  // 深色描边 + 亮色填充才是在杂乱背景上保持字形锐利的做法。
  context.font = LABEL_FONT
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'
  context.lineJoin = 'round'
  context.miterLimit = 2

  const boxes: [number, number, number, number][] = []
  let placed = 0
  for (const label of labels) {
    const opacity = Math.min(1, Math.max(0, label.opacity))
    if (opacity <= 0.004) continue
    if (label.x < -80 || label.x > viewport.width + 80) continue
    if (label.y < -40 || label.y > viewport.height + 40) continue

    const width = context.measureText(label.text).width
    const box: [number, number, number, number] = [
      label.x - width / 2 - 7, label.y - 14, label.x + width / 2 + 7, label.y + 6,
    ]
    if (boxes.some((other) => box[0] < other[2] && box[2] > other[0] && box[1] < other[3] && box[3] > other[1])) {
      continue
    }
    boxes.push(box)

    const channel = (value: number) => Math.min(255, Math.round(226 + 29 * value))
    context.lineWidth = 3.5
    context.strokeStyle = `rgba(3,5,12,${(opacity * 0.92).toFixed(3)})`
    context.strokeText(label.text, label.x, label.y)
    context.fillStyle = `rgba(${channel(label.tint[0])},${channel(label.tint[1])},${channel(label.tint[2])},${opacity.toFixed(3)})`
    context.fillText(label.text, label.x, label.y)
    placed += 1
  }
  return placed
}
