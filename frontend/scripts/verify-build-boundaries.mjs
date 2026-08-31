import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const outputDir = fileURLToPath(new URL('../../web/', import.meta.url))
const manifestPath = new URL('../../web/.vite/manifest.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const records = Object.entries(manifest)
const byKey = new Map(records)

const universeEntry = records.find(([key, value]) =>
  key === 'universe.html' || value.src === 'universe.html')
if (!universeEntry) throw new Error('build boundary: universe manifest entry is missing')

const rendererEntry = records.find(([key, value]) =>
  key.endsWith('src/starmap/Renderer.ts') || value.src?.endsWith('src/starmap/Renderer.ts'))
if (!rendererEntry) throw new Error('build boundary: Renderer manifest entry is missing')

const sharedEntry = records.find(([key, value]) =>
  key.endsWith('src/ui/SharedView.tsx') || value.src?.endsWith('src/ui/SharedView.tsx'))
if (!sharedEntry) throw new Error('build boundary: SharedView manifest entry is missing')

const walkImports = (key, reachable, includeDynamicImports) => {
  if (reachable.has(key)) return
  reachable.add(key)
  const record = byKey.get(key)
  if (!record) throw new Error(`build boundary: missing imported manifest record ${key}`)
  for (const imported of record.imports ?? []) walkImports(imported, reachable, includeDynamicImports)
  if (includeDynamicImports) {
    for (const imported of record.dynamicImports ?? []) walkImports(imported, reachable, true)
  }
}

const publicReachable = new Set()
walkImports(sharedEntry[0], publicReachable, false)

const forbiddenPublicSources = /(?:^|\/)src\/(?:starmap\/|ui\/(?:Universe|Panel|QuestionWorkspace))/
for (const key of publicReachable) {
  const record = byKey.get(key)
  if (forbiddenPublicSources.test(key) || forbiddenPublicSources.test(record.src ?? '')) {
    throw new Error(`build boundary: public share statically reaches private module ${key}`)
  }
}

const universeDynamicReachable = new Set()
for (const imported of universeEntry[1].dynamicImports ?? []) {
  walkImports(imported, universeDynamicReachable, true)
}
if (!universeDynamicReachable.has(rendererEntry[0])) {
  throw new Error('build boundary: universe does not dynamically reach Renderer')
}

const threeChunks = records.filter(([, record]) => record.name === 'three' && record.file?.endsWith('.js'))
if (threeChunks.length !== 1) {
  throw new Error(`build boundary: expected exactly one Three vendor JavaScript chunk, found ${threeChunks.length}`)
}

const MAX_CHUNK_BYTES = 500_000
const THREE_CHUNK_BYTES = 850_000
const threeChunkFile = threeChunks[0][1].file
for (const [, record] of records) {
  if (!record.file?.endsWith('.js')) continue
  const bytes = (await stat(resolve(outputDir, record.file))).size
  const limit = record.file === threeChunkFile ? THREE_CHUNK_BYTES : MAX_CHUNK_BYTES
  if (bytes > limit) {
    throw new Error(`build boundary: ${record.file} is ${bytes} bytes (limit ${limit})`)
  }
}

process.stdout.write(
  `build boundaries verified: ${publicReachable.size} public chunks; one Three vendor chunk within ${THREE_CHUNK_BYTES} bytes; ordinary JavaScript chunks within ${MAX_CHUNK_BYTES} bytes\n`,
)
