// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, test } from 'vitest'

const css = (name: string) => readFileSync(new URL(name, import.meta.url), 'utf8')

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
})
