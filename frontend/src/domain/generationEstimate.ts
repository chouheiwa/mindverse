import type { GenerationDetails } from '../types'

export function estimateText(d: GenerationDetails, now: number): string {
  if (!d.estimateHigh) return d.phase === 'normalize' || d.phase === 'layout'
    ? '正在整理结果，时间尚不确定' : '正在估算本阶段时间'
  const age = Math.max(0, (now - d.updatedAt) / 1000)
  if (age >= d.estimateHigh) return '比预计更久，仍在等待服务响应'
  const low = Math.max(1, Math.ceil(d.estimateLow - age))
  const high = Math.max(low, Math.ceil(d.estimateHigh - age))
  if (high >= 120) {
    const a = Math.ceil(low / 60), b = Math.ceil(high / 60)
    return `本阶段预计还需 ${a === b ? a : `${a}–${b}`} 分钟`
  }
  return `本阶段预计还需 ${low === high ? low : `${low}–${high}`} 秒`
}
