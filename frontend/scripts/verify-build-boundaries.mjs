import { readFile, stat, unlink } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

export const MAX_CHUNK_BYTES = 500_000
export const THREE_CHUNK_BYTES = 850_000

const findEntry = (records, label, predicate) => {
  const entry = records.find(([key, value]) => predicate(key, value))
  if (!entry) throw new Error(`build boundary: ${label} manifest entry is missing`)
  return entry
}

const walkImports = (byKey, key, reachable, includeDynamicImports) => {
  if (reachable.has(key)) return
  reachable.add(key)
  const record = byKey.get(key)
  if (!record) throw new Error(`build boundary: missing imported manifest record ${key}`)
  for (const imported of record.imports ?? []) {
    walkImports(byKey, imported, reachable, includeDynamicImports)
  }
  if (includeDynamicImports) {
    for (const imported of record.dynamicImports ?? []) {
      walkImports(byKey, imported, reachable, true)
    }
  }
}

export function validateBuildBoundaries({ manifest, chunks, assetSizes }) {
  const records = Object.entries(manifest)
  const byKey = new Map(records)

  const universeEntry = findEntry(records, 'universe', (key, value) =>
    key.endsWith('src/ui/Universe.tsx') || value.src?.endsWith('src/ui/Universe.tsx'))
  const rendererEntry = findEntry(records, 'Renderer', (key, value) =>
    key.endsWith('src/starmap/Renderer.ts') || value.src?.endsWith('src/starmap/Renderer.ts'))
  const sharedEntry = findEntry(records, 'SharedView', (key, value) =>
    key.endsWith('src/ui/SharedView.tsx') || value.src?.endsWith('src/ui/SharedView.tsx'))

  const publicReachable = new Set()
  walkImports(byKey, sharedEntry[0], publicReachable, true)
  const forbiddenPublicSources = /(?:^|\/)src\/(?:starmap\/|ui\/(?:Universe|Panel|QuestionWorkspace))/
  for (const key of publicReachable) {
    const record = byKey.get(key)
    if (forbiddenPublicSources.test(key) || forbiddenPublicSources.test(record.src ?? '')) {
      throw new Error(`build boundary: public share reaches private module ${key}`)
    }
  }

  if (!(universeEntry[1].dynamicImports ?? []).includes(rendererEntry[0])) {
    throw new Error('build boundary: private Universe must have a direct dynamic import of Renderer')
  }

  const namedThreeRecords = records.filter(([, record]) =>
    record.name === 'three' && record.file?.endsWith('.js'))
  if (namedThreeRecords.length !== 1) {
    throw new Error(
      `build boundary: expected exactly one named Three vendor JavaScript record, found ${namedThreeRecords.length}`,
    )
  }
  const [threeKey, threeRecord] = namedThreeRecords[0]

  const isThreeModule = (moduleId) => /(?:^|[\\/])node_modules[\\/]three[\\/]/.test(moduleId)
  const chunksWithThreeModules = chunks.filter((chunk) => chunk.moduleIds.some(isThreeModule))
  if (chunksWithThreeModules.length === 0) {
    throw new Error('build boundary: named Three vendor has no Three module metadata')
  }
  if (chunksWithThreeModules.length !== 1) {
    throw new Error(
      `build boundary: Three modules must belong to one chunk, found ${chunksWithThreeModules.length}`,
    )
  }
  if (chunksWithThreeModules[0].file !== threeRecord.file) {
    throw new Error('build boundary: named Three vendor does not match Three module metadata')
  }

  const rendererStaticReachable = new Set()
  walkImports(byKey, rendererEntry[0], rendererStaticReachable, false)
  if (!rendererStaticReachable.has(threeKey)) {
    throw new Error('build boundary: Renderer static closure does not contain the Three vendor chunk')
  }

  for (const chunk of chunks) {
    if (!chunk.file.endsWith('.js')) continue
    const bytes = assetSizes[chunk.file]
    if (!Number.isFinite(bytes)) {
      throw new Error(`build boundary: output size is missing for ${chunk.file}`)
    }
    const limit = chunk.file === threeRecord.file ? THREE_CHUNK_BYTES : MAX_CHUNK_BYTES
    if (bytes > limit) {
      throw new Error(`build boundary: ${chunk.file} is ${bytes} bytes (limit ${limit})`)
    }
  }

  return {
    publicChunkCount: publicReachable.size,
    threeChunkFile: threeRecord.file,
  }
}

async function main() {
  const outputDir = new URL('../../web/', import.meta.url)
  const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', outputDir), 'utf8'))
  const metadataPath = new URL('.vite/build-metadata.json', outputDir)
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  await unlink(metadataPath)
  const assetSizes = {}
  for (const chunk of metadata.chunks) {
    if (chunk.file.endsWith('.js')) {
      assetSizes[chunk.file] = (await stat(new URL(chunk.file, outputDir))).size
    }
  }

  const result = validateBuildBoundaries({ manifest, chunks: metadata.chunks, assetSizes })
  process.stdout.write(
    `build boundaries verified: ${result.publicChunkCount} public chunks; one Three vendor chunk within ${THREE_CHUNK_BYTES} bytes; ordinary JavaScript chunks within ${MAX_CHUNK_BYTES} bytes\n`,
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) await main()
