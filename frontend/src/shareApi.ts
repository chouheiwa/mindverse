import { json } from './apiCore'
import { parseShareView } from './domain/share'
import type { CreatedShare, SharePreview, ShareView } from './types'

const headers = { 'Content-Type': 'application/json' }
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
  if (typeof digest !== 'string' || !/^[a-f0-9]{64}$/.test(digest)) throw new Error('invalid share preview: invalid digest')
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
      !Number.isFinite(Date.parse(item.expiresAt))) throw new Error('invalid created share: malformed public metadata')
  return Object.freeze({ id: item.id, url: item.url, expiresAt: item.expiresAt }) as CreatedShare
}
const parseDeletion = (value: unknown): { ok: true } => {
  const item = exactDataObject(value, ['ok'], 'share deletion')
  if (item.ok !== true) throw new Error('invalid share deletion: expected success')
  return Object.freeze({ ok: true })
}

export const previewShare = (questionIds: string[], signal?: AbortSignal) =>
  json<unknown>('/api/share/preview', { method: 'POST', headers, body: JSON.stringify({ questionIds }), signal }).then(parsePreview)
export const createShare = (questionIds: string[], digest: string) =>
  json<unknown>('/api/share', { method: 'POST', headers, body: JSON.stringify({ questionIds, digest }) }).then(parseCreatedShare)
export const getShare = (id: string, signal?: AbortSignal): Promise<ShareView> =>
  json<unknown>(`/api/share/${encodeURIComponent(id)}`, { credentials: 'omit', signal }).then(parseShareView)
export const deleteShare = (id: string) =>
  json<unknown>(`/api/share/${encodeURIComponent(id)}`, { method: 'DELETE' }).then(parseDeletion)
