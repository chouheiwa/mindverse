import type { Generation, OAuthStatus, Universe } from './types'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok && !(d as { state?: string }).state) {
    throw new Error((d as { error?: string }).error || `请求失败 ${r.status}`)
  }
  return d as T
}

export const getOAuthStatus = () => json<OAuthStatus>('/api/oauth/status')
export const getGeneration = () => json<Generation>('/api/universe')
export const startGeneration = () => json<Generation>('/api/universe', { method: 'POST' })
export const wipeSession = () => json<{ ok: boolean }>('/api/session/data', { method: 'DELETE' })
export const createShare = () => json<{ id: string; url: string; expiresAt: string }>('/api/share', { method: 'POST' })

export const getShare = (id: string) =>
  json<{ id: string; createdAt: string; expiresAt: string; universe: Universe }>(`/api/share/${id}`)

/** 分享路由 /s/{id}；命中时星图由快照重建，证据只剩链接。 */
export function shareIdFromPath(): string | null {
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)/)
  return m ? m[1] : null
}

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
