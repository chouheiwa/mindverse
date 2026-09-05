import { describe, expect, it, vi } from 'vitest'
import { LABEL_FONT, paintLabels, type PaintableLabel } from './labelPainter'

function fakeContext() {
  const calls: string[] = []
  return {
    calls,
    context: {
      canvas: { width: 1280, height: 720 },
      font: '',
      textAlign: '' as CanvasTextAlign,
      textBaseline: '' as CanvasTextBaseline,
      lineJoin: '' as CanvasLineJoin,
      miterLimit: 0,
      lineWidth: 0,
      strokeStyle: '',
      fillStyle: '',
      clearRect: vi.fn(() => calls.push('clear')),
      measureText: vi.fn((text: string) => ({ width: text.length * 10 })),
      strokeText: vi.fn((text: string) => calls.push(`stroke:${text}`)),
      fillText: vi.fn((text: string) => calls.push(`fill:${text}`)),
    } as unknown as CanvasRenderingContext2D,
  }
}

const label = (overrides: Partial<PaintableLabel> = {}): PaintableLabel => ({
  text: 'Alpha', x: 200, y: 200, opacity: 1, tint: [0.5, 0.7, 1], ...overrides,
})

describe('paintLabels', () => {
  it('clears, sets the shared typography and strokes before filling', () => {
    const { context, calls } = fakeContext()
    paintLabels(context, { width: 1280, height: 720 }, [label()])
    expect(context.font).toBe(LABEL_FONT)
    expect(context.textAlign).toBe('center')
    expect(calls).toEqual(['clear', 'stroke:Alpha', 'fill:Alpha'])
  })

  it('drops a label whose box overlaps one already placed', () => {
    const { context, calls } = fakeContext()
    paintLabels(context, { width: 1280, height: 720 }, [
      label({ text: 'First' }), label({ text: 'Second', x: 205, y: 202 }),
    ])
    expect(calls.filter((call) => call.startsWith('fill:'))).toEqual(['fill:First'])
  })

  it('places labels that do not overlap', () => {
    const { context, calls } = fakeContext()
    paintLabels(context, { width: 1280, height: 720 }, [
      label({ text: 'First' }), label({ text: 'Second', x: 900, y: 500 }),
    ])
    expect(calls.filter((call) => call.startsWith('fill:'))).toEqual(['fill:First', 'fill:Second'])
  })

  it('skips invisible and off-canvas labels without measuring them', () => {
    const { context, calls } = fakeContext()
    paintLabels(context, { width: 1280, height: 720 }, [
      label({ text: 'Transparent', opacity: 0 }),
      label({ text: 'Left', x: -400 }),
      label({ text: 'Below', y: 1200 }),
    ])
    expect(calls).toEqual(['clear'])
  })

  it('returns how many labels it actually placed', () => {
    const { context } = fakeContext()
    const placed = paintLabels(context, { width: 1280, height: 720 }, [
      label({ text: 'First' }), label({ text: 'Second', x: 205 }), label({ text: 'Third', x: 900, y: 500 }),
    ])
    expect(placed).toBe(2)
  })
})
