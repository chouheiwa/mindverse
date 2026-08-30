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
    expect(css('./QuestionEntryShell.css')).toMatch(/\.qes-back[^}]*min-height:\s*44px/s)
  })

  test('defines focus-visible and reduced-motion treatments', () => {
    const card = css('./QuestionPlanetCard.css')
    expect(card).toMatch(/:focus-visible/)
    expect(card).toMatch(/prefers-reduced-motion:\s*reduce/)
    expect(css('./QuestionEntryShell.css')).toMatch(/prefers-reduced-motion:\s*reduce/)
  })

  test('uses a bounded horizontal question dock on mobile and preserves panel scroll clearance', () => {
    const lane = css('./QuestionLane.css')
    const panel = css('./Panel.css')
    expect(lane).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.ql\s*\{[^}]*height:\s*92px/)
    expect(lane).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.ql ol\s*\{[^}]*display:\s*flex[^}]*overflow-x:\s*auto/)
    expect(lane).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.ql li\s*\{[^}]*flex:\s*0 0/)
    expect(panel).toMatch(/@media \(max-width:\s*760px\)[\s\S]*\.pnl\.open\s*\{[^}]*padding-bottom:\s*330px/)
  })
})
