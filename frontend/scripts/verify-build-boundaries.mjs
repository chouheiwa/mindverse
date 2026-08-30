import { readFile, stat } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const outputDir = fileURLToPath(new URL('../../web/', import.meta.url))
const manifestPath = new URL('../../web/.vite/manifest.json', import.meta.url)
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))
const records = Object.entries(manifest)
const byKey = new Map(records)

const sharedEntry = records.find(([key, value]) =>
  key.endsWith('src/ui/SharedView.tsx') || value.src?.endsWith('src/ui/SharedView.tsx'))
if (!sharedEntry) throw new Error('build boundary: SharedView manifest entry is missing')

const reachable = new Set()
const walkStaticImports = (key) => {
  if (reachable.has(key)) return
  reachable.add(key)
  const record = byKey.get(key)
  if (!record) throw new Error(`build boundary: missing imported manifest record ${key}`)
  for (const imported of record.imports ?? []) walkStaticImports(imported)
}
walkStaticImports(sharedEntry[0])

const forbiddenPublicSources = /(?:^|\/)src\/(?:starmap\/|ui\/(?:Universe|Panel|QuestionWorkspace))/
for (const key of reachable) {
  const record = byKey.get(key)
  if (forbiddenPublicSources.test(key) || forbiddenPublicSources.test(record.src ?? '')) {
    throw new Error(`build boundary: public share statically reaches private module ${key}`)
  }
}

const MAX_CHUNK_BYTES = 500_000
for (const [, record] of records) {
  if (!record.file?.endsWith('.js')) continue
  const bytes = (await stat(resolve(outputDir, record.file))).size
  if (bytes > MAX_CHUNK_BYTES) {
    throw new Error(`build boundary: ${record.file} is ${bytes} bytes (limit ${MAX_CHUNK_BYTES})`)
  }
}

process.stdout.write(`build boundaries verified: ${reachable.size} public chunks; no JavaScript chunk exceeds ${MAX_CHUNK_BYTES} bytes\n`)
