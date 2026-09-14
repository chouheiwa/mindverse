import { indexUniverse, parseUniverse } from './domain/universe'
import { json } from './apiCore'
import type { Generation, OAuthStatus, WireGeneration } from './types'

export const getOAuthStatus = () => json<OAuthStatus>('/api/oauth/status')
const normalizeGeneration = ({ universe, ...generation }: WireGeneration): Generation => {
  if (universe == null) return generation
  const parsed = parseUniverse(universe)
  return { ...generation, universe: indexUniverse(parsed).universe }
}
export const getGeneration = (signal?: AbortSignal) =>
  json<WireGeneration>('/api/universe', { signal }).then(normalizeGeneration)
export const startGeneration = (signal?: AbortSignal) =>
  json<WireGeneration>('/api/universe', { method: 'POST', signal }).then(normalizeGeneration)
export const wipeSession = () => json<{ ok: boolean }>('/api/session/data', { method: 'DELETE' })

/** 生成是异步的（要跑模型），轮询直到完成。 */
export async function pollUntilDone(
  onProgress: (g: Generation) => void,
  signal?: AbortSignal,
): Promise<Generation> {
  const aborted = () => new DOMException('已取消', 'AbortError')
  const wait = (milliseconds: number) => new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(aborted())
      return
    }
    const timer = setTimeout(done, milliseconds)
    function done() {
      signal?.removeEventListener('abort', cancel)
      resolve()
    }
    function cancel() {
      clearTimeout(timer)
      signal?.removeEventListener('abort', cancel)
      reject(aborted())
    }
    signal?.addEventListener('abort', cancel, { once: true })
  })
  let g = await getGeneration(signal)
  if (signal?.aborted) throw aborted()
  if (g.state === 'done' && g.universe) return g
  if (g.state !== 'running') {
    g = await startGeneration(signal)
    if (g.error) throw new Error(g.error)
  }
  onProgress(g)
  for (let i = 0; i < 400; i++) {
    await wait(1200)
    g = await getGeneration(signal)
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
