import type {
  AnswerSatellite, ArticleProbe, Cluster, CurrentStar, CurrentUniverse, Dark,
  DiscoverySource, Evidence, LegacyStar, LegacyUniverse, Meta, Nebula,
  QuestionPlanet, Solo, Star, Universe, UserContentBinding, UserContentRelation, Wormhole,
} from '../types'

type ObjectValue = Record<string, unknown>

export interface UniverseIndex {
  readonly universe: Universe
  readonly starsById: ReadonlyMap<string, CurrentStar>
  readonly questionsById: ReadonlyMap<string, QuestionPlanet>
  readonly answersById: ReadonlyMap<string, AnswerSatellite>
  readonly probesById: ReadonlyMap<string, ArticleProbe>
}

const fail = (path: string, message: string): never => {
  throw new Error('invalid universe at ' + path + ': ' + message)
}
const object = (value: unknown, path: string): ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ObjectValue : fail(path, 'expected object')
const text = (value: unknown, path: string): string =>
  typeof value === 'string' ? value : fail(path, 'expected string')
const numeric = (value: unknown, path: string): number =>
  typeof value === 'number' && Number.isFinite(value) ? value : fail(path, 'expected finite number')
const flag = (value: unknown, path: string): boolean =>
  typeof value === 'boolean' ? value : fail(path, 'expected boolean')
const list = (value: unknown, path: string): unknown[] =>
  value === null ? [] : Array.isArray(value) ? value : fail(path, 'expected array or null')
const optionalText = (value: unknown, path: string): string | undefined =>
  value === undefined ? undefined : text(value, path)
const optionalNumber = (value: unknown, path: string): number | undefined =>
  value === undefined ? undefined : numeric(value, path)
const textList = (value: unknown, path: string): string[] =>
  list(value, path).map((entry, index) => text(entry, path + '[' + index + ']'))
const optionalTextList = (value: unknown, path: string): string[] =>
  value === undefined ? [] : textList(value, path)
const numbers = (value: unknown, size: number, path: string): number[] => {
  const result = list(value, path).map((entry, index) => numeric(entry, path + '[' + index + ']'))
  if (result.length !== size) fail(path, 'expected ' + size + ' numbers')
  return result
}

function parseEvidence(value: unknown, path: string): Evidence {
  const item = object(value, path)
  return { t: text(item.t, path + '.t'), u: text(item.u, path + '.u'), o: numeric(item.o, path + '.o'), y: text(item.y, path + '.y') }
}

function parseLegacyStar(value: unknown, path: string): LegacyStar {
  const item = object(value, path)
  return {
    c: text(item.c, path + '.c'), g: numeric(item.g, path + '.g'),
    p: numbers(item.p, 3, path + '.p') as [number, number, number],
    n: numeric(item.n, path + '.n'), o: numeric(item.o, path + '.o'), f: numeric(item.f, path + '.f'),
    hue: numeric(item.hue, path + '.hue'), sat: numeric(item.sat, path + '.sat'),
    pe: numeric(item.pe, path + '.pe'), bu: numeric(item.bu, path + '.bu'),
    fi: text(item.fi, path + '.fi'), la: text(item.la, path + '.la'),
    ev: list(item.ev, path + '.ev').map((entry, index) => parseEvidence(entry, path + '.ev[' + index + ']')),
  }
}

function parseCurrentStar(value: unknown, path: string): CurrentStar {
  const item = object(value, path)
  const rawScope = text(item.scope, path + '.scope')
  if (rawScope !== 'private' && rawScope !== 'public') fail(path + '.scope', 'unsupported scope ' + rawScope)
  const scope = rawScope as 'private' | 'public'
  const externalQueryAllowed = flag(item.externalQueryAllowed, path + '.externalQueryAllowed')
  if (scope === 'private' && externalQueryAllowed) fail(path, 'private star cannot allow external queries')
  const id = text(item.id, path + '.id')
  if (!id) fail(path + '.id', 'must not be empty')
  return {
    ...parseLegacyStar(value, path), id, scope, externalQueryAllowed,
    questionIds: optionalTextList(item.questionIds, path + '.questionIds'),
    probeIds: optionalTextList(item.probeIds, path + '.probeIds'),
  }
}

function parseMeta(value: unknown, path: string): Meta {
  const item = object(value, path)
  return {
    items: numeric(item.items, path + '.items'), concepts: numeric(item.concepts, path + '.concepts'),
    clusters: numeric(item.clusters, path + '.clusters'), own: numeric(item.own, path + '.own'),
    fav: numeric(item.fav, path + '.fav'), span: numbers(item.span, 2, path + '.span') as [number, number],
    medz: numeric(item.medz, path + '.medz'), p10z: numeric(item.p10z, path + '.p10z'),
    source: text(item.source, path + '.source'), splits: numeric(item.splits, path + '.splits'),
  }
}

function parseCluster(value: unknown, path: string): Cluster {
  const item = object(value, path)
  return {
    g: numeric(item.g, path + '.g'), name: text(item.name, path + '.name'), lead: text(item.lead, path + '.lead'),
    c: numbers(item.c, 3, path + '.c') as [number, number, number],
    n: numeric(item.n, path + '.n'), o: numeric(item.o, path + '.o'), f: numeric(item.f, path + '.f'),
    hue: numeric(item.hue, path + '.hue'), sat: numeric(item.sat, path + '.sat'),
    mem: textList(item.mem, path + '.mem'),
  }
}

function parseWormhole(value: unknown, path: string): Wormhole {
  const item = object(value, path)
  return {
    a: numeric(item.a, path + '.a'), b: numeric(item.b, path + '.b'),
    an: text(item.an, path + '.an'), bn: text(item.bn, path + '.bn'),
    obs: numeric(item.obs, path + '.obs'), exp: numeric(item.exp, path + '.exp'), z: numeric(item.z, path + '.z'),
    ev: list(item.ev, path + '.ev').map((entry, index) => {
      const evPath = path + '.ev[' + index + ']'
      const ev = object(entry, evPath)
      return { t: text(ev.t, evPath + '.t'), u: text(ev.u, evPath + '.u'), a: text(ev.a, evPath + '.a'), b: text(ev.b, evPath + '.b') }
    }),
  }
}

function parseSolo(value: unknown, path: string): Solo {
  const item = object(value, path)
  return { c: text(item.c, path + '.c'), n: numeric(item.n, path + '.n'), t: text(item.t, path + '.t'), u: text(item.u, path + '.u'), g: textList(item.g, path + '.g'), p: numbers(item.p, 3, path + '.p') as [number, number, number] }
}
function parseDark(value: unknown, path: string): Dark {
  const item = object(value, path)
  return {
    c: text(item.c, path + '.c'), n: numeric(item.n, path + '.n'), f: numeric(item.f, path + '.f'),
    o: numeric(item.o, path + '.o'), gap: numeric(item.gap, path + '.gap'),
    first: text(item.first, path + '.first'), last: text(item.last, path + '.last'),
    ev: list(item.ev, path + '.ev').map((entry, index) => parseEvidence(entry, path + '.ev[' + index + ']')),
  }
}
function parseNebula(value: unknown, path: string): Nebula {
  const item = object(value, path)
  return { c: text(item.c, path + '.c'), n: numeric(item.n, path + '.n'), burst: numeric(item.burst, path + '.burst'), first: text(item.first, path + '.first'), last: text(item.last, path + '.last') }
}

const relations: readonly UserContentRelation[] = ['created', 'collected']
const discoveries: readonly DiscoverySource[] = ['public_search', 'favorite_list', 'own_content']

function parseBinding(value: unknown, path: string): UserContentBinding {
  const item = object(value, path)
  const relation = text(item.relation, path + '.relation')
  if (!relations.includes(relation as UserContentRelation)) fail(path + '.relation', 'unsupported relation ' + relation)
  const result: UserContentBinding = { relation: relation as UserContentRelation }
  const at = optionalNumber(item.at, path + '.at')
  if (at !== undefined) {
    if (at < 0) fail(path + '.at', 'must not be negative')
    result.at = at
  }
  if (item.folders !== undefined) result.folders = textList(item.folders, path + '.folders')
  return result
}

function parseQuestion(value: unknown, path: string): QuestionPlanet {
  const item = object(value, path)
  const result: QuestionPlanet = {
    id: text(item.id, path + '.id'), questionId: text(item.questionId, path + '.questionId'),
    title: text(item.title, path + '.title'), url: text(item.url, path + '.url'),
  }
  if (item.answerIds !== undefined) result.answerIds = textList(item.answerIds, path + '.answerIds')
  return result
}

function parseArtifact(value: unknown, path: string): ArticleProbe {
  const item = object(value, path)
  const result: ArticleProbe = { id: text(item.id, path + '.id'), title: text(item.title, path + '.title'), url: text(item.url, path + '.url') }
  for (const key of ['summary', 'authorId', 'authorName'] as const) {
    const parsed = optionalText(item[key], path + '.' + key)
    if (parsed !== undefined) result[key] = parsed
  }
  for (const key of ['publishedAt', 'updatedAt', 'observedAt', 'likeCount', 'commentCount', 'favoriteCount'] as const) {
    const parsed = optionalNumber(item[key], path + '.' + key)
    if (parsed !== undefined) {
      if (parsed < 0) fail(path + '.' + key, 'must not be negative')
      result[key] = parsed
    }
  }
  if (item.bindings !== undefined) result.bindings = list(item.bindings, path + '.bindings').map((entry, index) => parseBinding(entry, path + '.bindings[' + index + ']'))
  if (item.discoverySources !== undefined) {
    result.discoverySources = textList(item.discoverySources, path + '.discoverySources').map((source, index) => {
      if (!discoveries.includes(source as DiscoverySource)) fail(path + '.discoverySources[' + index + ']', 'unsupported source ' + source)
      return source as DiscoverySource
    })
  }
  return result
}

function parseAnswer(value: unknown, path: string): AnswerSatellite {
  const item = object(value, path)
  return { ...parseArtifact(value, path), questionId: text(item.questionId, path + '.questionId') }
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

function validateCurrent(universe: CurrentUniverse): void {
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
    validateRefs(item.questionIds, questions, 'stars[' + index + '].questionIds')
    validateRefs(item.probeIds, probes, 'stars[' + index + '].probeIds')
  })
}

export function parseUniverse(value: unknown): Universe {
  const root = object(value, 'universe')
  const hasSchema = root.schemaVersion !== undefined
  const hasAnalysis = root.analysisVersion !== undefined
  if (!hasSchema && !hasAnalysis) {
    if (root.questions !== undefined || root.answers !== undefined || root.probes !== undefined) {
      fail('universe', 'legacy universe cannot contain current entities')
    }
    return parseCore(root, parseLegacyStar) as LegacyUniverse
  }
  if (root.schemaVersion !== 'universe.v1' || root.analysisVersion !== 'engine.v1') {
    fail('universe', 'unsupported versions ' + String(root.schemaVersion) + '/' + String(root.analysisVersion))
  }
  const universe: CurrentUniverse = {
    schemaVersion: 'universe.v1', analysisVersion: 'engine.v1',
    ...parseCore(root, parseCurrentStar),
    questions: list(root.questions, 'questions').map((entry, index) => parseQuestion(entry, 'questions[' + index + ']')),
    answers: list(root.answers, 'answers').map((entry, index) => parseAnswer(entry, 'answers[' + index + ']')),
    probes: list(root.probes, 'probes').map((entry, index) => parseArtifact(entry, 'probes[' + index + ']')),
  }
  validateCurrent(universe)
  return universe
}

export function indexUniverse(universe: Universe): UniverseIndex {
  if (universe.schemaVersion !== 'universe.v1') {
    return { universe, starsById: new Map(), questionsById: new Map(), answersById: new Map(), probesById: new Map() }
  }
  return {
    universe,
    starsById: uniqueMap(universe.stars, 'stars'),
    questionsById: uniqueMap(universe.questions, 'questions'),
    answersById: uniqueMap(universe.answers, 'answers'),
    probesById: uniqueMap(universe.probes, 'probes'),
  }
}

export function questionsForStar(index: UniverseIndex, star: Star): QuestionPlanet[] {
  if (!('questionIds' in star)) return []
  return star.questionIds.map((id) => index.questionsById.get(id)).filter((item): item is QuestionPlanet => item !== undefined)
}
export function probesForStar(index: UniverseIndex, star: Star): ArticleProbe[] {
  if (!('probeIds' in star)) return []
  return star.probeIds.map((id) => index.probesById.get(id)).filter((item): item is ArticleProbe => item !== undefined)
}
export function publicStarsForShare(index: UniverseIndex): CurrentStar[] {
  return [...index.starsById.values()]
    .filter((star) => star.scope === 'public' && star.externalQueryAllowed)
    .sort((left, right) => left.id.localeCompare(right.id))
}
