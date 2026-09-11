import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex } from '@noble/hashes/utils.js'
import type {
  AnswerSatellite, ArticleProbe, Cluster, CurrentStar, Dark, DiscoverySource,
  Evidence, LegacyStar, Meta, Nebula, NormalizedCurrentUniverse,
  NormalizedLegacyUniverse, QuestionPlanet, Solo, Star, Universe,
  UserContentBinding, UserContentRelation, WireCurrentStar, WireLegacyStar,
  WireUniverse, Wormhole,
} from '../types'

type ObjectValue = Record<string, unknown>

/** Above realistic personal-corpus sizes; rejects hostile payloads before traversal. */
export const UNIVERSE_COLLECTION_LIMIT = 10_000
const UNIVERSE_NODE_LIMIT = 100_000
const UNIVERSE_EDGE_LIMIT = 250_000
const UNIVERSE_PRIMITIVE_LIMIT = 250_000
/** Stops hostile JSON-like object graphs before recursive traversal can exhaust the stack. */
export const UNIVERSE_MAX_DEPTH = 128
/** Rendering cap: one star system must remain navigable and GPU-safe. */
export const UNIVERSE_QUESTION_REFS_PER_STAR_LIMIT = 512
const validatedWires = new WeakSet<object>()
const normalizedByWire = new WeakMap<object, Universe>()
const sanitizedArrays = new WeakSet<object>()
const EMPTY_RESULT: readonly never[] = Object.freeze([])

export interface UniverseIndex {
  readonly universe: Universe
  readonly starsById: ReadonlyMap<string, CurrentStar>
  readonly questionsById: ReadonlyMap<string, QuestionPlanet>
  readonly answersById: ReadonlyMap<string, AnswerSatellite>
  readonly probesById: ReadonlyMap<string, ArticleProbe>
}

/** Star-local rendering model for one globally indexed public question. */
export interface QuestionPlanetDatum {
  readonly starId: string
  readonly orbitIndex: number
  readonly question: QuestionPlanet
  readonly aggregate: QuestionPlanetAggregate
  readonly answers: readonly AnswerSatellite[]
  readonly answerCount: number
  readonly created: boolean
  readonly collected: boolean
  readonly latestPublicAt?: number
}

export interface QuestionPlanetAggregate {
  readonly answers: readonly AnswerSatellite[]
  readonly answerCount: number
  readonly created: boolean
  readonly collected: boolean
  readonly latestPublicAt?: number
}

const aggregateByIndex = new WeakMap<UniverseIndex, ReadonlyMap<string, QuestionPlanetAggregate>>()

const fail = (path: string, message: string): never => {
  throw new Error('invalid universe at ' + path + ': ' + message)
}
const object = (value: unknown, path: string): ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ObjectValue : fail(path, 'expected object')
const shape = (
  value: unknown,
  path: string,
  required: readonly string[],
  optional: readonly string[] = [],
): ObjectValue => {
  const item = object(value, path)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(item)) {
    const stringKey = typeof key === 'string' ? key : fail(path, 'unknown key ' + String(key))
    if (!allowed.has(stringKey)) fail(path, 'unknown key ' + stringKey)
    const descriptor = Object.getOwnPropertyDescriptor(item, stringKey)
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(path + '.' + stringKey, 'expected JSON data property')
    }
    if (item[stringKey] === undefined) fail(path + '.' + stringKey, 'undefined is not JSON')
  }
  for (const key of required) {
    if (!Object.hasOwn(item, key)) fail(path, 'missing required key ' + key)
  }
  return item
}
const text = (value: unknown, path: string): string =>
  typeof value === 'string' ? value : fail(path, 'expected string')
const numeric = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'expected finite number')
const integer = (value: unknown, path: string): number => {
  const parsed = numeric(value, path)
  return Number.isSafeInteger(parsed) ? parsed : fail(path, 'expected safe integer')
}
const flag = (value: unknown, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, 'expected boolean')
const ownArrayValues = (value: unknown, path: string): unknown[] => {
  const parsed = Array.isArray(value) ? value : fail(path, 'expected array or null')
  if (sanitizedArrays.has(parsed)) return parsed
  const lengthDescriptor = Object.getOwnPropertyDescriptor(parsed, 'length') ?? fail(path + '.length', 'expected JSON data property')
  if (!Object.hasOwn(lengthDescriptor, 'value')) fail(path + '.length', 'expected JSON data property')
  const length = typeof lengthDescriptor.value === 'number' && Number.isSafeInteger(lengthDescriptor.value) && lengthDescriptor.value >= 0
    ? lengthDescriptor.value : fail(path + '.length', 'expected JSON data property')
  if (length > UNIVERSE_COLLECTION_LIMIT) fail(path, 'collection limit exceeded')
  const result = new Array<unknown>(length)
  const indices = new Set<number>()
  for (const key of Reflect.ownKeys(parsed)) {
    if (key === 'length') continue
    const stringKey = typeof key === 'string' ? key : fail(path, 'unknown array key ' + String(key))
    if (!/^(0|[1-9]\d*)$/.test(stringKey)) fail(path, 'unknown array key ' + stringKey)
    const index = Number(stringKey)
    const descriptor = Object.getOwnPropertyDescriptor(parsed, stringKey) ?? fail(path + '[' + stringKey + ']', 'expected JSON data property')
    if (index >= length || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      fail(path + '[' + stringKey + ']', 'expected JSON data property')
    }
    indices.add(index)
    result[index] = descriptor.value
  }
  if (indices.size !== length) fail(path, 'expected dense own data properties')
  return result
}
const list = (value: unknown, path: string): unknown[] => value === null ? [] : ownArrayValues(value, path)

function sanitizeInput(value: unknown): unknown {
  let nodes = 0
  let edges = 0
  let primitives = 0
  const active = new WeakSet<object>()
  const visit = (entry: unknown, path: string, depth: number): unknown => {
    if (depth > UNIVERSE_MAX_DEPTH) fail(path, 'maximum depth exceeded')
    if (typeof entry !== 'object' || entry === null) {
      primitives += 1
      if (primitives > UNIVERSE_PRIMITIVE_LIMIT) fail(path, 'primitive budget exceeded')
      return entry
    }
    nodes += 1
    if (nodes > UNIVERSE_NODE_LIMIT) fail(path, 'object graph limit exceeded')
    if (active.has(entry)) fail(path, 'cyclic value is not JSON')
    active.add(entry)

    if (Array.isArray(entry)) {
      const source = ownArrayValues(entry, path)
      edges += source.length
      if (edges > UNIVERSE_EDGE_LIMIT) fail(path, 'edge budget exceeded')
      const result = source.map((item, index) => visit(item, path + '[' + index + ']', depth + 1))
      sanitizedArrays.add(result)
      active.delete(entry)
      return result
    }

    const result = Object.create(null) as ObjectValue
    const keys = Reflect.ownKeys(entry)
    edges += keys.length
    if (edges > UNIVERSE_EDGE_LIMIT) fail(path, 'edge budget exceeded')
    for (const key of keys) {
      const stringKey = typeof key === 'string' ? key : fail(path, 'unknown key ' + String(key))
      const descriptor = Object.getOwnPropertyDescriptor(entry, stringKey) ?? fail(path + '.' + stringKey, 'expected JSON data property')
      if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
        fail(path + '.' + stringKey, 'expected JSON data property')
      }
      Object.defineProperty(result, stringKey, {
        value: visit(descriptor.value, path + '.' + stringKey, depth + 1),
        enumerable: true,
        configurable: true,
        writable: true,
      })
    }
    active.delete(entry)
    return result
  }
  return visit(value, 'universe', 0)
}
const optionalText = (value: unknown, path: string): string | undefined =>
  value === undefined ? undefined : text(value, path)
const optionalInteger = (value: unknown, path: string): number | undefined =>
  value === undefined ? undefined : integer(value, path)
const textList = (value: unknown, path: string): string[] =>
  list(value, path).map((entry, index) => text(entry, path + '[' + index + ']'))
const optionalTextList = (value: unknown, path: string): string[] =>
  value === undefined ? [] : textList(value, path)
const numbers = (value: unknown, size: number, path: string): number[] => {
  const result = list(value, path).map((entry, index) => numeric(entry, path + '[' + index + ']'))
  if (result.length !== size) fail(path, 'expected ' + size + ' numbers')
  return result
}

const integers = (value: unknown, size: number, path: string): number[] => {
  const result = list(value, path).map((entry, index) => integer(entry, path + '[' + index + ']'))
  if (result.length !== size) fail(path, 'expected ' + size + ' integers')
  return result
}

const normalizeConcept = (concept: string): string =>
  concept.split(/\p{White_Space}+/u).filter(Boolean).join(' ').replace(/[A-Z]/g, (char) => char.toLowerCase())

const stableStarID = (scope: 'private' | 'public', concept: string, path: string): string => {
  const normalized = normalizeConcept(concept)
  if (!normalized) fail(path, 'empty normalized concept')
  const digest = bytesToHex(sha256(new TextEncoder().encode(normalized))).slice(0, 16)
  return 'star:v1:' + scope + ':' + digest
}

function parseEvidence(value: unknown, path: string): Evidence {
  const item = shape(value, path, ['t', 'u', 'o', 'y'])
  return { t: text(item.t, path + '.t'), u: text(item.u, path + '.u'), o: integer(item.o, path + '.o'), y: text(item.y, path + '.y') }
}

const starKeys = ['c', 'g', 'p', 'n', 'o', 'f', 'hue', 'sat', 'pe', 'bu', 'fi', 'la', 'ev'] as const

function parseStarBase(item: ObjectValue, path: string): LegacyStar {
  return {
    c: text(item.c, path + '.c'), g: integer(item.g, path + '.g'),
    p: numbers(item.p, 3, path + '.p') as [number, number, number],
    n: integer(item.n, path + '.n'), o: integer(item.o, path + '.o'), f: integer(item.f, path + '.f'),
    hue: integer(item.hue, path + '.hue'), sat: integer(item.sat, path + '.sat'),
    pe: numeric(item.pe, path + '.pe'), bu: numeric(item.bu, path + '.bu'),
    fi: text(item.fi, path + '.fi'), la: text(item.la, path + '.la'),
    ev: list(item.ev, path + '.ev').map((entry, index) => parseEvidence(entry, path + '.ev[' + index + ']')),
  }
}

function parseLegacyStar(value: unknown, path: string): LegacyStar {
  return parseStarBase(shape(value, path, starKeys), path)
}

function parseCurrentStar(value: unknown, path: string): CurrentStar {
  const item = shape(
    value,
    path,
    [...starKeys, 'id', 'scope', 'externalQueryAllowed'],
    ['questionIds', 'probeIds'],
  )
  const rawScope = text(item.scope, path + '.scope')
  if (rawScope !== 'private' && rawScope !== 'public') fail(path + '.scope', 'unsupported scope ' + rawScope)
  const scope = rawScope as 'private' | 'public'
  const externalQueryAllowed = flag(item.externalQueryAllowed, path + '.externalQueryAllowed')
  if (scope === 'private' && externalQueryAllowed) fail(path, 'private star cannot allow external queries')
  const id = text(item.id, path + '.id')
  const base = parseStarBase(item, path)
  const expectedID = stableStarID(scope, base.c, path + '.c')
  if (id !== expectedID) fail(path + '.id', 'stable ID does not match scope and concept')
  return {
    ...base, id, scope, externalQueryAllowed,
    questionIds: optionalTextList(item.questionIds, path + '.questionIds'),
    probeIds: optionalTextList(item.probeIds, path + '.probeIds'),
  }
}

function parseMeta(value: unknown, path: string): Meta {
  const item = shape(value, path, ['items', 'concepts', 'clusters', 'own', 'fav', 'span', 'medz', 'p10z', 'source', 'splits'])
  return {
    items: integer(item.items, path + '.items'), concepts: integer(item.concepts, path + '.concepts'),
    clusters: integer(item.clusters, path + '.clusters'), own: integer(item.own, path + '.own'),
    fav: integer(item.fav, path + '.fav'), span: integers(item.span, 2, path + '.span') as [number, number],
    medz: numeric(item.medz, path + '.medz'), p10z: numeric(item.p10z, path + '.p10z'),
    source: text(item.source, path + '.source'), splits: integer(item.splits, path + '.splits'),
  }
}

function parseCluster(value: unknown, path: string): Cluster {
  const item = shape(value, path, ['g', 'name', 'lead', 'c', 'n', 'o', 'f', 'hue', 'sat', 'mem'])
  return {
    g: integer(item.g, path + '.g'), name: text(item.name, path + '.name'), lead: text(item.lead, path + '.lead'),
    c: numbers(item.c, 3, path + '.c') as [number, number, number],
    n: integer(item.n, path + '.n'), o: integer(item.o, path + '.o'), f: integer(item.f, path + '.f'),
    hue: integer(item.hue, path + '.hue'), sat: integer(item.sat, path + '.sat'),
    mem: textList(item.mem, path + '.mem'),
  }
}

function parseWormhole(value: unknown, path: string): Wormhole {
  const item = shape(value, path, ['a', 'b', 'an', 'bn', 'obs', 'exp', 'z', 'ev'])
  return {
    a: integer(item.a, path + '.a'), b: integer(item.b, path + '.b'),
    an: text(item.an, path + '.an'), bn: text(item.bn, path + '.bn'),
    obs: integer(item.obs, path + '.obs'), exp: numeric(item.exp, path + '.exp'), z: numeric(item.z, path + '.z'),
    ev: list(item.ev, path + '.ev').map((entry, index) => {
      const evPath = path + '.ev[' + index + ']'
      const ev = shape(entry, evPath, ['t', 'u', 'a', 'b'])
      return { t: text(ev.t, evPath + '.t'), u: text(ev.u, evPath + '.u'), a: text(ev.a, evPath + '.a'), b: text(ev.b, evPath + '.b') }
    }),
  }
}

function parseSolo(value: unknown, path: string): Solo {
  const item = shape(value, path, ['c', 'n', 't', 'u', 'g', 'p'])
  return { c: text(item.c, path + '.c'), n: integer(item.n, path + '.n'), t: text(item.t, path + '.t'), u: text(item.u, path + '.u'), g: textList(item.g, path + '.g'), p: numbers(item.p, 3, path + '.p') as [number, number, number] }
}
function parseDark(value: unknown, path: string): Dark {
  const item = shape(value, path, ['c', 'n', 'f', 'o', 'gap', 'first', 'last', 'ev'])
  return {
    c: text(item.c, path + '.c'), n: integer(item.n, path + '.n'), f: integer(item.f, path + '.f'),
    o: integer(item.o, path + '.o'), gap: integer(item.gap, path + '.gap'),
    first: text(item.first, path + '.first'), last: text(item.last, path + '.last'),
    ev: list(item.ev, path + '.ev').map((entry, index) => parseEvidence(entry, path + '.ev[' + index + ']')),
  }
}
function parseNebula(value: unknown, path: string): Nebula {
  const item = shape(value, path, ['c', 'n', 'burst', 'first', 'last'])
  return { c: text(item.c, path + '.c'), n: integer(item.n, path + '.n'), burst: numeric(item.burst, path + '.burst'), first: text(item.first, path + '.first'), last: text(item.last, path + '.last') }
}

const relations: readonly UserContentRelation[] = ['created', 'collected']
const discoveries: readonly DiscoverySource[] = ['public_search', 'favorite_list', 'own_content']

function parseBinding(value: unknown, path: string): UserContentBinding {
  const item = shape(value, path, ['relation'], ['at', 'folders'])
  const relation = text(item.relation, path + '.relation')
  if (!relations.includes(relation as UserContentRelation)) fail(path + '.relation', 'unsupported relation ' + relation)
  const result: UserContentBinding = {
    relation: relation as UserContentRelation,
    folders: optionalTextList(item.folders, path + '.folders'),
  }
  const at = optionalInteger(item.at, path + '.at')
  if (at !== undefined) {
    if (at < 0) fail(path + '.at', 'must not be negative')
    result.at = at
  }
  return result
}

function parseQuestion(value: unknown, path: string): QuestionPlanet {
  const item = shape(value, path, ['id', 'questionId', 'title', 'url'], ['answerIds'])
  return {
    id: text(item.id, path + '.id'), questionId: text(item.questionId, path + '.questionId'),
    title: text(item.title, path + '.title'), url: text(item.url, path + '.url'),
    answerIds: optionalTextList(item.answerIds, path + '.answerIds'),
  }
}

const artifactRequired = ['id', 'title', 'url'] as const
const artifactOptional = [
  'summary', 'authorId', 'authorName', 'publishedAt', 'updatedAt', 'observedAt',
  'likeCount', 'commentCount', 'favoriteCount', 'bindings', 'discoverySources',
] as const

function parseArtifact(value: unknown, path: string, isAnswer = false): ArticleProbe {
  const item = shape(
    value,
    path,
    isAnswer ? [...artifactRequired, 'questionId'] : artifactRequired,
    artifactOptional,
  )
  const result: ArticleProbe = {
    id: text(item.id, path + '.id'),
    title: text(item.title, path + '.title'),
    url: text(item.url, path + '.url'),
    bindings: (item.bindings === undefined ? [] : list(item.bindings, path + '.bindings'))
      .map((entry, index) => parseBinding(entry, path + '.bindings[' + index + ']')),
    discoverySources: optionalTextList(item.discoverySources, path + '.discoverySources').map((source, index) => {
      if (!discoveries.includes(source as DiscoverySource)) fail(path + '.discoverySources[' + index + ']', 'unsupported source ' + source)
      return source as DiscoverySource
    }),
  }
  for (const key of ['summary', 'authorId', 'authorName'] as const) {
    const parsed = optionalText(item[key], path + '.' + key)
    if (parsed !== undefined) result[key] = parsed
  }
  for (const key of ['publishedAt', 'updatedAt', 'observedAt', 'likeCount', 'commentCount', 'favoriteCount'] as const) {
    const parsed = optionalInteger(item[key], path + '.' + key)
    if (parsed !== undefined) {
      if (parsed < 0) fail(path + '.' + key, 'must not be negative')
      result[key] = parsed
    }
  }
  if (result.authorId !== undefined && result.authorId !== '' && !/^author:[A-Za-z0-9_-]+$/.test(result.authorId)) {
    fail(path + '.authorId', 'invalid verified author ID')
  }
  return result
}

function parseAnswer(value: unknown, path: string): AnswerSatellite {
  const item = object(value, path)
  return { ...parseArtifact(value, path, true), questionId: text(item.questionId, path + '.questionId') }
}

function parseCore<S extends Star>(root: ObjectValue, starParser: (value: unknown, path: string) => S) {
  return {
    meta: parseMeta(root.meta, 'meta'),
    clusters: list(root.clusters, 'clusters').map((entry, index) => parseCluster(entry, 'clusters[' + index + ']')),
    stars: list(root.stars, 'stars').map((entry, index) => starParser(entry, 'stars[' + index + ']')),
    particles: list(root.particles, 'particles').map((entry, index) => numbers(entry, 5, 'particles[' + index + ']') as [number, number, number, number, number]),
    wormholes: list(root.wormholes, 'wormholes').map((entry, index) => parseWormhole(entry, 'wormholes[' + index + ']')),
    solo: list(root.solo, 'solo').map((entry, index) => parseSolo(entry, 'solo[' + index + ']')),
    dark: list(root.dark, 'dark').map((entry, index) => parseDark(entry, 'dark[' + index + ']')),
    nebula: list(root.nebula, 'nebula').map((entry, index) => parseNebula(entry, 'nebula[' + index + ']')),
  }
}

function uniqueMap<T extends { id: string }>(items: readonly T[], path: string): Map<string, T> {
  const result = new Map<string, T>()
  items.forEach((item, index) => {
    if (result.has(item.id)) fail(path + '[' + index + '].id', 'duplicate ID ' + item.id)
    result.set(item.id, item)
  })
  return result
}

function validateRefs(ids: readonly string[], available: ReadonlyMap<string, unknown>, path: string): void {
  ids.forEach((id, index) => {
    if (index > 0 && ids[index - 1] >= id) fail(path, 'references must be unique and strictly sorted')
    if (!available.has(id)) fail(path + '[' + index + ']', 'unknown reference ' + id)
  })
}

function validateCurrent(universe: NormalizedCurrentUniverse): void {
  uniqueMap(universe.stars, 'stars')
  const questions = uniqueMap(universe.questions, 'questions')
  const answers = uniqueMap(universe.answers, 'answers')
  const probes = uniqueMap(universe.probes, 'probes')
  const referencedAnswers = new Set<string>()
  universe.questions.forEach((item, index) => {
    if (!/^question:[1-9]\d*$/.test(item.id) || item.questionId !== item.id.slice(9) ||
        item.url !== 'https://www.zhihu.com/question/' + item.questionId || !item.title.trim()) {
      fail('questions[' + index + ']', 'invalid public question shape')
    }
    validateRefs(item.answerIds ?? [], answers, 'questions[' + index + '].answerIds')
    for (const answerId of item.answerIds ?? []) {
      if (answers.get(answerId)?.questionId !== item.id) fail('questions[' + index + '].answerIds', 'answer belongs to another question')
      referencedAnswers.add(answerId)
    }
  })
  universe.answers.forEach((item, index) => {
    const answerId = item.id.match(/^answer:([1-9]\d*)$/)?.[1]
    const questionId = item.questionId.match(/^question:([1-9]\d*)$/)?.[1]
    if (!answerId || !questionId || !questions.has(item.questionId) || !item.title.trim() ||
        item.url !== 'https://www.zhihu.com/question/' + questionId + '/answer/' + answerId) {
      fail('answers[' + index + ']', 'invalid public answer shape')
    }
    if (!referencedAnswers.has(item.id)) fail('answers[' + index + ']', 'answer is not referenced by its question')
  })
  universe.probes.forEach((item, index) => {
    const articleId = item.id.match(/^article:([1-9]\d*)$/)?.[1]
    if (!articleId || !item.title.trim() || item.url !== 'https://zhuanlan.zhihu.com/p/' + articleId) {
      fail('probes[' + index + ']', 'invalid public probe shape')
    }
  })
  universe.stars.forEach((item, index) => {
    if (item.questionIds.length > UNIVERSE_QUESTION_REFS_PER_STAR_LIMIT) {
      fail('stars[' + index + '].questionIds', 'rendering limit exceeded')
    }
    validateRefs(item.questionIds, questions, 'stars[' + index + '].questionIds')
    validateRefs(item.probeIds, probes, 'stars[' + index + '].probeIds')
  })
}

function normalizedCurrent(root: ObjectValue): NormalizedCurrentUniverse {
  return {
    schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
    ...parseCore(root, parseCurrentStar),
    questions: list(root.questions, 'questions').map((entry, index) => parseQuestion(entry, 'questions[' + index + ']')),
    answers: list(root.answers, 'answers').map((entry, index) => parseAnswer(entry, 'answers[' + index + ']')),
    probes: list(root.probes, 'probes').map((entry, index) => parseArtifact(entry, 'probes[' + index + ']')),
  }
}

export function parseUniverse(value: unknown): WireUniverse {
  const sanitized = sanitizeInput(value)
  const candidate = object(sanitized, 'universe')
  const hasSchema = Object.hasOwn(candidate, 'schemaVersion')
  const hasAnalysis = Object.hasOwn(candidate, 'analysisVersion')
  if (!hasSchema && !hasAnalysis) {
    const root = shape(candidate, 'universe', ['meta', 'clusters', 'stars', 'particles', 'wormholes', 'solo', 'dark', 'nebula'])
    const normalized = deepFreeze(parseCore(root, parseLegacyStar) as NormalizedLegacyUniverse)
    const wire = deepFreeze(sanitized as WireUniverse)
    validatedWires.add(wire as object)
    normalizedByWire.set(wire as object, normalized)
    return wire
  }
  const root = shape(candidate, 'universe', [
    'schemaVersion', 'analysisVersion', 'meta', 'clusters', 'stars', 'particles',
    'wormholes', 'solo', 'dark', 'nebula', 'questions', 'answers', 'probes',
  ])
  if (root.schemaVersion !== 'universe.v1' || root.analysisVersion !== 'engine.v1') {
    fail('universe', 'unsupported versions ' + String(root.schemaVersion) + '/' + String(root.analysisVersion))
  }
  const universe = normalizedCurrent(root)
  validateCurrent(universe)
  const wire = deepFreeze(sanitized as WireUniverse)
  validatedWires.add(wire as object)
  normalizedByWire.set(wire as object, deepFreeze(universe))
  return wire
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

class ReadonlyMapFacade<K, V> implements ReadonlyMap<K, V> {
  readonly #source: Map<K, V>

  constructor(source: Map<K, V>) {
    this.#source = source
    Object.freeze(this)
  }

  get size(): number { return this.#source.size }
  get [Symbol.toStringTag](): string { return 'ReadonlyMap' }
  has(key: K): boolean { return this.#source.has(key) }
  get(key: K): V | undefined { return this.#source.get(key) }
  entries(): MapIterator<[K, V]> { return this.#source.entries() }
  keys(): MapIterator<K> { return this.#source.keys() }
  values(): MapIterator<V> { return this.#source.values() }
  [Symbol.iterator](): MapIterator<[K, V]> { return this.#source[Symbol.iterator]() }
  forEach(callbackfn: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown): void {
    this.#source.forEach((value, key) => callbackfn.call(thisArg, value, key, this))
  }
}

const readonlyMap = <K, V>(source: Map<K, V>): ReadonlyMap<K, V> => new ReadonlyMapFacade(source)

export function indexUniverse(input: WireUniverse | Universe): UniverseIndex {
  const wire = typeof input === 'object' && input !== null && validatedWires.has(input as object)
    ? input as WireUniverse
    : parseUniverse(input)
  const normalized = normalizedByWire.get(wire as object) ?? fail('universe', 'validated normalization unavailable')
  if (wire.schemaVersion !== 'universe.v1') {
    return Object.freeze({
      universe: normalized,
      starsById: readonlyMap(new Map()),
      questionsById: readonlyMap(new Map()),
      answersById: readonlyMap(new Map()),
      probesById: readonlyMap(new Map()),
    })
  }
  if (normalized.schemaVersion !== 'universe.v1') fail('universe', 'normalization version mismatch')
  const current = normalized as NormalizedCurrentUniverse
  return Object.freeze({
    universe: current,
    starsById: readonlyMap(uniqueMap(current.stars, 'stars')),
    questionsById: readonlyMap(uniqueMap(current.questions, 'questions')),
    answersById: readonlyMap(uniqueMap(current.answers, 'answers')),
    probesById: readonlyMap(uniqueMap(current.probes, 'probes')),
  })
}

export function questionsForStar(index: UniverseIndex, star: Star | WireCurrentStar | WireLegacyStar): readonly QuestionPlanet[] {
  if (!('questionIds' in star) || !star.questionIds?.length) return EMPTY_RESULT
  const seen = new Set<string>()
  return Object.freeze(star.questionIds.flatMap((id) => {
    if (seen.has(id)) return []
    seen.add(id)
    const question = index.questionsById.get(id)
    return question ? [question] : []
  }))
}

/**
 * Select admitted question planets for one current star.
 *
 * Relations come only from the question's referenced answer bindings. Discovery
 * metadata and private observation timestamps do not describe a personal relation
 * or public freshness, so neither participates in these aggregates.
 */
export function selectPlanetData(
  index: UniverseIndex,
  star: Star | WireCurrentStar | WireLegacyStar,
): readonly QuestionPlanetDatum[] {
  if (!('id' in star) || !('questionIds' in star) || !star.questionIds?.length) return EMPTY_RESULT
  let aggregates = aggregateByIndex.get(index)
  if (!aggregates) {
    const built = new Map<string, QuestionPlanetAggregate>()
    for (const question of index.questionsById.values()) {
      const answers = Object.freeze(question.answerIds
        .map((answerId) => index.answersById.get(answerId))
        .filter((answer): answer is AnswerSatellite => answer !== undefined))
      let created = false
      let collected = false
      let latestPublicAt: number | undefined
      for (const answer of answers) {
        for (const binding of answer.bindings) {
          if (binding.relation === 'created') created = true
          if (binding.relation === 'collected') collected = true
        }
        for (const at of [answer.publishedAt, answer.updatedAt]) {
          if (at !== undefined && (latestPublicAt === undefined || at > latestPublicAt)) latestPublicAt = at
        }
      }
      built.set(question.id, Object.freeze({
        answers,
        answerCount: question.answerIds.length,
        created,
        collected,
        ...(latestPublicAt === undefined ? {} : { latestPublicAt }),
      }))
    }
    aggregates = readonlyMap(built)
    aggregateByIndex.set(index, aggregates)
  }
  // 轨道位置是重要性的表达：按回答数排名，前八名各占一条轨道，其余进小行星带。
  // 同分保持恒星里原有的顺序。
  const admitted = star.questionIds
    .map((questionId) => ({ question: index.questionsById.get(questionId), aggregate: aggregates.get(questionId) }))
    .filter((entry): entry is { question: QuestionPlanet; aggregate: QuestionPlanetAggregate } =>
      entry.question !== undefined && entry.aggregate !== undefined)
    .sort((left, right) => right.aggregate.answerCount - left.aggregate.answerCount)
  const result: QuestionPlanetDatum[] = []
  for (const [rank, { question, aggregate }] of admitted.entries()) {
    const datum: QuestionPlanetDatum = {
      starId: star.id,
      orbitIndex: rank + 1,
      question,
      aggregate,
      answers: aggregate.answers,
      answerCount: aggregate.answerCount,
      created: aggregate.created,
      collected: aggregate.collected,
      ...(aggregate.latestPublicAt === undefined ? {} : { latestPublicAt: aggregate.latestPublicAt }),
    }
    result.push(Object.freeze(datum))
  }
  return Object.freeze(result)
}
export function probesForStar(index: UniverseIndex, star: Star | WireCurrentStar | WireLegacyStar): readonly ArticleProbe[] {
  if (!('probeIds' in star) || !star.probeIds?.length) return EMPTY_RESULT
  const seen = new Set<string>()
  return Object.freeze(star.probeIds.flatMap((id) => {
    if (seen.has(id)) return []
    seen.add(id)
    const probe = index.probesById.get(id)
    return probe ? [probe] : []
  }))
}
export function publicStarsForShare(index: UniverseIndex): readonly CurrentStar[] {
  return Object.freeze([...index.starsById.values()]
    .filter((star) => star.scope === 'public' && star.externalQueryAllowed)
    .sort((left, right) => left.id.localeCompare(right.id)))
}
