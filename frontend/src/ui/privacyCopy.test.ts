// @vitest-environment node
/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { expect, test } from 'vitest'

test('landing accurately distinguishes memory-only private data from persisted explicit shares', () => {
  const source = readFileSync(new URL('./Landing.tsx', import.meta.url), 'utf8')
  expect(source).toContain('私人宇宙只存内存')
  expect(source).toContain('逐项确认')
  expect(source).toContain('公开分享')
  expect(source).not.toContain('落盘的只有算出来的结构')
})
