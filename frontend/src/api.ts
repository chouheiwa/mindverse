import { indexUniverse, parseUniverse } from './domain/universe'
import { json } from './apiCore'
import type { Generation, OAuthStatus, WireGeneration } from './types'

export const getOAuthStatus = () => json<OAuthStatus>('/api/oauth/status')
const normalizeGeneration = ({ universe, ...generation }: WireGeneration): Generation => {
  if (universe == null) return generation
  const parsed = parseUniverse(universe)
  return { ...generation, universe: indexUniverse(parsed).universe }
}
export const getGeneration = () => json<WireGeneration>('/api/universe').then(normalizeGeneration)
export const startGeneration = () => json<WireGeneration>('/api/universe', { method: 'POST' }).then(normalizeGeneration)
export const wipeSession = () => json<{ ok: boolean }>('/api/session/data', { method: 'DELETE' })

/** 生成是异步的（要跑模型），轮询直到完成。 */
export async function pollUntilDone(
  onProgress: (g: Generation) => void,
  signal?: AbortSignal,
): Promise<Generation> {
  let g = await getGeneration()
  if (g.state === 'done' && g.universe) return g
  if (g.state !== 'running') {
    g = await startGeneration()
    if (g.error) throw new Error(g.error)
  }
  for (let i = 0; i < 400; i++) {
    if (signal?.aborted) throw new Error('已取消')
    await new Promise((r) => setTimeout(r, 1200))
    g = await getGeneration()
    if (g.state === 'failed') throw new Error(g.error || '生成失败')
    if (g.state === 'done' && g.universe) return g
    onProgress(g)
  }
  throw new Error('生成超时')
}

export interface SeedTopic { id: string; name: string; hint: string }

export const getSeedTopics = () =>
  json<{ topics: SeedTopic[]; min: number; max: number }>('/api/seed/topics')

/** 提交挑选的方向；服务端用知乎搜索把它们展开成真实语料。 */
export const submitSeed = (picks: string[]) =>
  json<{ items: number; calls: number }>('/api/seed', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ picks }),
  })
