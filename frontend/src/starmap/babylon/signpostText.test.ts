import { expect, it } from 'vitest'
import { fitSignpostTitle } from './signpostText'

it('wraps a long Chinese question into two lines inside the sign, including ellipsis', () => {
  const lines = fitSignpostTitle('程序员通过自身努力实现自由职业的可能性到底有多大？这是一个很长的问题标题', 140, text => [...text].length * 10)
  expect(lines).toHaveLength(2)
  expect(lines.every(line => [...line].length * 10 <= 140)).toBe(true)
  expect(lines[1]).toMatch(/…$/)
})
it('keeps short titles intact and never splits emoji surrogate pairs', () => {
  expect(fitSignpostTitle('自由职业', 140, text => [...text].length * 10)).toEqual(['自由职业'])
  const lines = fitSignpostTitle('🚀'.repeat(30), 100, text => [...text].length * 10)
  expect(lines.join('')).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
})
