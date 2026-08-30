export type UniverseRoute = { kind: 'share'; id: string } | { kind: 'private' }

export function shareIdFromPath(pathname: string = location.pathname): string | null {
  const match = pathname.match(/^\/s\/([A-Za-z0-9_-]+)$/)
  return match ? match[1] : null
}

export function universeRoute(pathname: string = location.pathname): UniverseRoute {
  const id = shareIdFromPath(pathname)
  return id ? { kind: 'share', id } : { kind: 'private' }
}
