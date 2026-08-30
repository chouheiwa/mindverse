import { indexUniverse, parseUniverse } from './domain/universe'
import { parseShareView } from './domain/share'
import type { CreatedShare, Generation, OAuthStatus, SharePreview, ShareView, WireGeneration } from './types'

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { credentials: 'same-origin', ...init })
  const d = await r.json().catch(() => ({}))
  if (!r.ok && !(d as { state?: string }).state) {
    throw new Error((d as { error?: string }).error || `请求失败 ${r.status}`)
  }
  return d as T
}

export const getOAuthStatus = () => json<OAuthStatus>('/api/oauth/status')
const normalizeGeneration = ({ universe, ...generation }: WireGeneration): Generation => {
  if (universe == null) return generation
  const parsed = parseUniverse(universe)
  return { ...generation, universe: indexUniverse(parsed).universe }
}
export const getGeneration = () => json<WireGeneration>('/api/universe').then(normalizeGeneration)
export const startGeneration = () => json<WireGeneration>('/api/universe', { method: 'POST' }).then(normalizeGeneration)
export const wipeSession = () => json<{ ok: boolean }>('/api/session/data', { method: 'DELETE' })
const shareHeaders = { 'Content-Type': 'application/json' }
const exactDataObject = (value: unknown, keys: readonly string[], label: string): Record<string, unknown> => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(`invalid ${label}: expected object`)
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.includes(key)) throw new Error(`invalid ${label}: unknown key ${String(key)}`)
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value') || descriptor.value === undefined) {
      throw new Error(`invalid ${label}: expected JSON data property`)
    }
  }
  for (const key of keys) if (!Object.hasOwn(value, key)) throw new Error(`invalid ${label}: missing ${key}`)
  return value as Record<string, unknown>
}
const parsePreview = (value: unknown): SharePreview => {
  const envelope = exactDataObject(value, ['schemaVersion', 'questions', 'answers', 'digest'], 'share preview')
  const digest = envelope.digest
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) {
    throw new Error('invalid share preview: invalid digest')
  }
  const wire = Object.create(null) as Record<string, unknown>
  for (const key of ['schemaVersion', 'questions', 'answers']) {
    Object.defineProperty(wire, key, { value: envelope[key], enumerable: true })
  }
  return Object.freeze({ ...parseShareView(wire), digest })
}
const parseCreatedShare = (value: unknown): CreatedShare => {
  const item = exactDataObject(value, ['id', 'url', 'expiresAt'], 'created share')
  if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id) || item.url !== `/s/${item.id}` ||
      typeof item.expiresAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(item.expiresAt) ||
      !Number.isFinite(Date.parse(item.expiresAt))) {
    throw new Error('invalid created share: malformed public metadata')
  }
  return Object.freeze({ id: item.id, url: item.url, expiresAt: item.expiresAt }) as CreatedShare
}
export const previewShare = (questionIds: string[], signal?: AbortSignal) =>
  json<unknown>('/api/share/preview', {
    method: 'POST', headers: shareHeaders, body: JSON.stringify({ questionIds }), signal,
  }).then(parsePreview)
export const createShare = (questionIds: string[], digest: string) =>
  json<unknown>('/api/share', {
    method: 'POST', headers: shareHeaders, body: JSON.stringify({ questionIds, digest }),
  }).then(parseCreatedShare)
export const getShare = (id: string, signal?: AbortSignal): Promise<ShareView> =>
  json<unknown>(`/api/share/${encodeURIComponent(id)}`, { signal }).then(parseShareView)
export const deleteShare = (id: string) =>
  json<{ ok: boolean }>(`/api/share/${encodeURIComponent(id)}`, { method: 'DELETE' })

export function shareIdFromPath(): string | null {
  const m = location.pathname.match(/^\/s\/([A-Za-z0-9_-]+)$/)
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
