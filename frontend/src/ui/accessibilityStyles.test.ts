// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

const luminance = (hex: string) => {
  const channels = hex.match(/[\da-f]{2}/gi)?.map((part) => Number.parseInt(part, 16) / 255) ?? []
  const linear = channels.map((channel) => channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4)
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2]
}

const contrast = (foreground: string, background: string) => {
  const [light, dark] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (light + 0.05) / (dark + 0.05)
}

describe('question navigation accessibility styles', () => {
  test('keeps primary and close targets at least 44px', () => {
    const card = css('./QuestionPlanetCard.css')
    expect(card).toMatch(/\.qpc-close[^}]*width:\s*44px[^}]*height:\s*44px/s)
    expect(card).toMatch(/\.qpc-enter[^}]*min-height:\s*44px/s)
    expect(css('./QuestionWorkspace.css')).toMatch(/\.qw-back[^}]*min-height:\s*44px/s)
    expect(css('./QuestionWorkspace.css')).toMatch(/\.qw-more[^}]*min-height:\s*44px/s)
  })

  test('defines focus-visible and reduced-motion treatments', () => {
    const card = css('./QuestionPlanetCard.css')
    expect(card).toMatch(/:focus-visible/)
    expect(card).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(css('./QuestionWorkspace.css')).toMatch(/prefers-reduced-motion:\s*reduce/)
  })

  test('removes the duplicate desktop question lane on mobile and preserves panel scroll clearance', () => {
    const lane = css('./QuestionLane.css')
    const panel = css('./Panel.css')
    expect(lane).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\[data-desktop-question-lane\]\s*\{[^}]*display:\s*none/)
    expect(panel).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.pnl\.open\s*\{[^}]*padding-bottom:\s*calc\(var\(--bar-h\) \+ 32px\)/)
  })

  test('uses the AA text token for panel empty and note copy', () => {
    expect(css('./Panel.css')).toMatch(/\.entry-empty, \.entry-note\s*\{[^}]*color:\s*var\(--dim\)/s)
  })

  test('keeps the global instrument label legible and the muted token AA on the ground', () => {
    const theme = css('../theme.css')
    const token = theme.match(/--mute:\s*(#[\dA-F]{6})/i)?.[1]
    const ground = theme.match(/--ground:\s*(#[\dA-F]{6})/i)?.[1]
    expect(token).toBeDefined()
    expect(ground).toBeDefined()
    expect(contrast(token!, ground!)).toBeGreaterThanOrEqual(4.5)
    expect(theme).toMatch(/\.lbl\s*\{[^}]*font-size:\s*(?:12|1[3-9]|[2-9]\d)px[^}]*color:\s*var\(--(?:dim|readout)\)/s)
  })

  test('keeps the legacy planet close control touch-sized on mobile-capable layouts', () => {
    expect(css('./PlanetCard.css')).toMatch(/\.pc-x\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s)
  })

  test('does not use the low-contrast mute token for small InfoPanel metadata', () => {
    const infoPanel = readFileSync(new URL('./InfoPanel.tsx', import.meta.url), 'utf8')
    expect(infoPanel).not.toMatch(/fontSize:\s*(?:10|11),\s*color:\s*'var\(--mute\)'/)
  })

  test('keeps the sharing dialog actions visible at 320px and its targets at least 44px', () => {
    const share = css('./SharePreview.css')
    expect(share).toMatch(/\.sp-dialog\s*\{[^}]*display:\s*grid[^}]*grid-template-rows:\s*auto minmax\(0,\s*1fr\) auto/s)
    expect(share).toMatch(/\.sp-dialog:not\(\[open\]\)\s*\{[^}]*display:\s*none/s)
    expect(share).toMatch(/\.sp-grid\s*\{[^}]*min-height:\s*0/s)
    expect(share).toMatch(/\.sp-close\s*\{[^}]*min-width:\s*44px[^}]*min-height:\s*44px/s)
    expect(share).toMatch(/\.sp-created button, \.sp-created a\s*\{[^}]*min-height:\s*44px/s)
  })
})
