import { readFile, stat, unlink } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { parse, resolve, sep } from 'node:path'

export const MAX_CHUNK_BYTES = 500_000
export const THREE_CHUNK_BYTES = 850_000
export const BABYLON_CHUNK_BYTES = 1_500_000

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
  for (const imported of record.imports ?? []) walkImports(byKey, imported, reachable, includeDynamicImports)
  if (includeDynamicImports) {
    for (const imported of record.dynamicImports ?? []) walkImports(byKey, imported, reachable, true)
  }
}

const chunkEvidence = (chunk) => [
  chunk.file,
  ...(chunk.imports ?? []),
  ...(chunk.dynamicImports ?? []),
  ...chunk.moduleIds,
].join('\n')

export function validateBuildBoundaries({ renderer, manifest, chunks, assetSizes }) {
  if (renderer !== 'three' && renderer !== 'babylon') {
    throw new Error('build boundary: renderer must explicitly be three or babylon')
  }
  const records = Object.entries(manifest)
  const byKey = new Map(records)
  const chunksByFile = new Map(chunks.map((chunk) => [chunk.file, chunk]))
  const rendererSource = renderer === 'three'
    ? 'src/starmap/Renderer.ts'
    : 'src/starmap/babylon/BabylonRenderer.ts'

  const universeEntry = findEntry(records, 'universe', (key, value) =>
    key.endsWith('src/ui/Universe.tsx') || value.src?.endsWith('src/ui/Universe.tsx'))
  const rendererEntry = findEntry(records, 'virtual renderer', (key, value) =>
    key === 'virtual:mindverse-renderer' || value.src === 'virtual:mindverse-renderer')
  const sharedEntry = findEntry(records, 'SharedView', (key, value) =>
    key.endsWith('src/ui/SharedView.tsx') || value.src?.endsWith('src/ui/SharedView.tsx'))

  const publicReachable = new Set()
  walkImports(byKey, sharedEntry[0], publicReachable, true)
  const forbiddenPublicSources = /(?:^|[\\/])src[\\/](?:starmap[\\/]|ui[\\/](?:Universe|Panel|QuestionWorkspace))/
  for (const key of publicReachable) {
    const record = byKey.get(key)
    if (forbiddenPublicSources.test(key) || forbiddenPublicSources.test(record.src ?? '')) {
      throw new Error(`build boundary: public share reaches private module ${key}`)
    }
    const chunk = chunksByFile.get(record.file)
    if (!chunk) throw new Error(`build boundary: emitted chunk metadata is missing for public file ${record.file}`)
    const forbiddenModuleId = chunk.moduleIds.find((moduleId) => forbiddenPublicSources.test(moduleId))
    if (forbiddenModuleId) {
      throw new Error(`build boundary: public share reaches private module ${forbiddenModuleId} via ${record.file}`)
    }
  }

  if (!(universeEntry[1].dynamicImports ?? []).includes(rendererEntry[0])) {
    throw new Error('build boundary: private Universe must have a direct dynamic import of the selected Renderer')
  }

  const rendererChunk = chunksByFile.get(rendererEntry[1].file)
  if (!rendererChunk?.moduleIds.some((moduleId) => moduleId.replaceAll('\\', '/').endsWith(rendererSource))) {
    throw new Error(`build boundary: virtual renderer does not contain selected source ${rendererSource}`)
  }

  const babylonEvidence = /(?:@babylonjs[\\/]core|src[\\/]starmap[\\/]babylon[\\/]|(?:^|[\\/])babylon(?:[-.\\/]|$))/i
  const threeEvidence = /(?:node_modules[\\/]three[\\/]|src[\\/]starmap[\\/]Renderer\.ts|(?:^|[\\/])three(?:[-.\\/]|$))/i
  const postprocessingEvidence = /(?:node_modules[\\/]postprocessing[\\/]|(?:^|[\\/])postprocessing(?:[-.\\/]|$))/i
  if (renderer === 'three') {
    const leaked = chunks.find((chunk) => babylonEvidence.test(chunkEvidence(chunk)))
    if (leaked) throw new Error(`build boundary: Three artifact contains Babylon code or import metadata in ${leaked.file}`)
  } else {
    const leaked = chunks.find((chunk) => threeEvidence.test(chunkEvidence(chunk))
      || postprocessingEvidence.test(chunkEvidence(chunk)))
    if (leaked) throw new Error(`build boundary: Babylon artifact contains Three or postprocessing code in ${leaked.file}`)
  }

  const rendererStaticReachable = new Set()
  walkImports(byKey, rendererEntry[0], rendererStaticReachable, false)
  let engineChunkFile
  let engineChunkLimit
  if (renderer === 'three') {
    const namedThreeRecords = records.filter(([, record]) => record.name === 'three' && record.file?.endsWith('.js'))
    if (namedThreeRecords.length !== 1) {
      throw new Error(`build boundary: expected exactly one named Three vendor JavaScript record, found ${namedThreeRecords.length}`)
    }
    const [threeKey, threeRecord] = namedThreeRecords[0]
    const chunksWithThreeModules = chunks.filter((chunk) => chunk.moduleIds.some((moduleId) =>
      /(?:^|[\\/])node_modules[\\/]three[\\/]/.test(moduleId)))
    if (chunksWithThreeModules.length === 0) throw new Error('build boundary: named Three vendor has no Three module metadata')
    if (chunksWithThreeModules.length !== 1) {
      throw new Error(`build boundary: Three modules must belong to one chunk, found ${chunksWithThreeModules.length}`)
    }
    if (chunksWithThreeModules[0].file !== threeRecord.file) {
      throw new Error('build boundary: named Three vendor does not match Three module metadata')
    }
    if (!rendererStaticReachable.has(threeKey)) {
      throw new Error('build boundary: Renderer static closure does not contain the Three vendor chunk')
    }
    engineChunkFile = threeRecord.file
    engineChunkLimit = THREE_CHUNK_BYTES
  } else {
    const namedBabylonRecords = records.filter(([, record]) => record.name === 'babylon' && record.file?.endsWith('.js'))
    if (namedBabylonRecords.length !== 1) {
      throw new Error(`build boundary: expected exactly one named Babylon vendor JavaScript record, found ${namedBabylonRecords.length}`)
    }
    const [babylonKey, babylonRecord] = namedBabylonRecords[0]
    const chunksWithBabylonModules = chunks.filter((chunk) => chunk.moduleIds.some((moduleId) =>
      /(?:^|[\\/])node_modules[\\/]@babylonjs[\\/]core[\\/]/.test(moduleId)))
    if (chunksWithBabylonModules.length === 0) throw new Error('build boundary: named Babylon vendor has no Babylon module metadata')
    if (chunksWithBabylonModules.length !== 1 || chunksWithBabylonModules[0].file !== babylonRecord.file) {
      throw new Error('build boundary: Babylon modules must belong to the named Babylon vendor chunk')
    }
    if (!rendererStaticReachable.has(babylonKey)) {
      throw new Error('build boundary: BabylonRenderer static closure does not contain the Babylon vendor chunk')
    }
    engineChunkFile = babylonRecord.file
    engineChunkLimit = BABYLON_CHUNK_BYTES
  }

  for (const chunk of chunks) {
    if (!chunk.file.endsWith('.js')) continue
    const bytes = assetSizes[chunk.file]
    if (!Number.isFinite(bytes)) throw new Error(`build boundary: output size is missing for ${chunk.file}`)
    const limit = chunk.file === engineChunkFile ? engineChunkLimit : MAX_CHUNK_BYTES
    if (bytes > limit) throw new Error(`build boundary: ${chunk.file} is ${bytes} bytes (limit ${limit})`)
  }

  return {
    renderer,
    publicChunkCount: publicReachable.size,
    ...(renderer === 'three' ? { threeChunkFile: engineChunkFile } : { babylonChunkFile: engineChunkFile }),
  }
}

export function resolveBuildOutputDir(argument, cwd = process.cwd()) {
  if (typeof argument !== 'string' || argument.trim() === '') {
    throw new Error('build boundary: explicit output directory is required')
  }
  const outputDir = resolve(cwd, argument)
  if (outputDir === parse(outputDir).root) throw new Error('build boundary: filesystem root cannot be used as output directory')
  return outputDir
}

async function main() {
  const outputPath = resolveBuildOutputDir(process.argv[2])
  const outputDir = pathToFileURL(outputPath.endsWith(sep) ? outputPath : outputPath + sep)
  const manifest = JSON.parse(await readFile(new URL('.vite/manifest.json', outputDir), 'utf8'))
  const metadataPath = new URL('.vite/build-metadata.json', outputDir)
  const metadata = JSON.parse(await readFile(metadataPath, 'utf8'))
  await unlink(metadataPath)
  const assetSizes = {}
  for (const chunk of metadata.chunks) {
    if (chunk.file.endsWith('.js')) assetSizes[chunk.file] = (await stat(new URL(chunk.file, outputDir))).size
  }

  const result = validateBuildBoundaries({ renderer: metadata.renderer, manifest, chunks: metadata.chunks, assetSizes })
  const engineLimit = result.renderer === 'three' ? THREE_CHUNK_BYTES : BABYLON_CHUNK_BYTES
  process.stdout.write(
    `build boundaries verified: ${result.renderer}; ${result.publicChunkCount} public chunks; one engine vendor chunk within ${engineLimit} bytes; ordinary JavaScript chunks within ${MAX_CHUNK_BYTES} bytes\n`,
  )
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : undefined
if (invokedPath === import.meta.url) await main()
