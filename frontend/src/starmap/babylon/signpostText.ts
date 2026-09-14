/** Fit two lines using actual glyph widths; reserve space for an ellipsis on overflow. */
export function fitSignpostTitle(text: string, width: number, measure: (text: string) => number): string[] {
  const glyphs = Array.from(text.replace(/\s+/g, ' ').trim())
  const lines: string[] = []
  let offset = 0
  while (offset < glyphs.length && lines.length < 2) {
    let line = ''
    while (offset < glyphs.length) {
      const next = line + glyphs[offset]!
      const suffix = lines.length === 1 && offset < glyphs.length - 1 ? '…' : ''
      if (measure(next + suffix) > width) break
      line = next
      offset += 1
    }
    if (!line) break
    lines.push(line + (lines.length === 1 && offset < glyphs.length ? '…' : ''))
  }
  return lines
}
