// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('landing discloses private analysis caching and deletion separately from public shares', () => {
  const source = readFileSync(new URL('./Landing.tsx', import.meta.url), 'utf8')
  expect(source).toContain('私人宇宙只存内存')
  expect(source).toContain('概念标签会私密保存')
  expect(source).toContain('随宇宙一起删除')
  expect(source).toContain('逐项确认')
  expect(source).toContain('公开分享')
  expect(source).not.toContain('落盘的只有算出来的结构')
})
