import type { ShareAnswer, ShareQuestion, ShareView } from '../types'

type ObjectValue = Record<string, unknown>
export const SHARE_MAX_QUESTIONS = 1_000
export const SHARE_MAX_ANSWERS = 10_000
export const SHARE_MAX_QUESTION_ANSWERS = 10_000
export const SHARE_MAX_JSON_INTEGER = 9_007_199_254_740_991
export const SHARE_MAX_PUBLIC_TIMESTAMP = 253_402_300_799
const EDGE_LIMIT = SHARE_MAX_ANSWERS
interface ParseBudget { edges: number }

const fail = (path: string, message: string): never => {
  throw new Error(`invalid share at ${path}: ${message}`)
}
const object = (value: unknown, path: string): ObjectValue =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as ObjectValue : fail(path, 'expected object')
const shape = (value: unknown, path: string, required: readonly string[], optional: readonly string[] = []) => {
  const item = object(value, path)
  const allowed = new Set([...required, ...optional])
  for (const key of Reflect.ownKeys(item)) {
    const name = typeof key === 'string' ? key : fail(path, `unknown key ${String(key)}`)
    if (!allowed.has(name)) fail(path, `unknown key ${name}`)
    const descriptor = Object.getOwnPropertyDescriptor(item, name)
    if (descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${path}.${name}`, 'expected JSON data property')
    const dataDescriptor = descriptor as PropertyDescriptor & { value: unknown }
    if (dataDescriptor.value === undefined) fail(`${path}.${name}`, 'undefined is not JSON')
  }
  for (const key of required) if (!Object.hasOwn(item, key)) fail(path, `missing required key ${key}`)
  return item
}
const array = (value: unknown, path: string, limit: number, label = 'collection'): unknown[] => {
  if (!Array.isArray(value)) return fail(path, 'expected array')
  const length = Object.getOwnPropertyDescriptor(value, 'length')?.value
  if (!Number.isSafeInteger(length) || length < 0) fail(path, 'invalid collection length')
  if (length > limit) fail(path, `${label} limit exceeded`)
  const result = new Array<unknown>(length)
  let count = 0
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue
    const name = typeof key === 'string' ? key : fail(path, `unknown array key ${String(key)}`)
    if (!/^(0|[1-9]\d*)$/.test(name)) fail(path, `unknown array key ${name}`)
    const index = Number(name)
    const descriptor = Object.getOwnPropertyDescriptor(value, name)
    if (index >= length || descriptor === undefined || !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) fail(`${path}[${name}]`, 'expected JSON data property')
    result[index] = (descriptor as PropertyDescriptor & { value: unknown }).value
    count += 1
  }
  if (count !== length) fail(path, 'expected dense own data properties')
  return result
}
const text = (value: unknown, path: string) => typeof value === 'string' ? value : fail(path, 'expected string')
const integer = (value: unknown, path: string) =>
  typeof value === 'number' && Number.isSafeInteger(value) ? value : fail(path, 'expected finite safe integer')
const optionalText = (value: unknown, path: string) => value === undefined ? undefined : text(value, path)
const optionalCount = (value: unknown, path: string) => {
  if (value === undefined) return undefined
  const parsed = integer(value, path)
  return parsed >= 0 ? parsed : fail(path, 'must not be negative')
}
const stringList = (value: unknown, path: string, budget: ParseBudget) => {
  const values = array(value, path, SHARE_MAX_QUESTION_ANSWERS, 'answer reference')
  budget.edges += values.length
  if (budget.edges > EDGE_LIMIT) fail(path, 'edge budget exceeded')
  return values.map((entry, index) => text(entry, `${path}[${index}]`))
}
const digits = (value: string) => /^[1-9]\d*$/.test(value)

function parseQuestion(value: unknown, path: string, budget: ParseBudget): ShareQuestion {
  const item = shape(value, path, ['id', 'questionId', 'title', 'url', 'answerIds'])
  const questionId = text(item.questionId, `${path}.questionId`)
  const id = text(item.id, `${path}.id`)
  const title = text(item.title, `${path}.title`)
  const url = text(item.url, `${path}.url`)
  if (!digits(questionId) || id !== `question:${questionId}` || url !== `https://www.zhihu.com/question/${questionId}` || !title.trim()) {
    fail(path, 'invalid canonical question')
  }
  return { id, questionId, title, url, answerIds: stringList(item.answerIds, `${path}.answerIds`, budget) }
}

function parseAnswer(value: unknown, path: string): ShareAnswer {
  const item = shape(value, path, ['id', 'questionId', 'title', 'url'], [
    'authorId', 'authorName', 'publishedAt', 'updatedAt', 'likeCount', 'commentCount', 'favoriteCount',
  ])
  const id = text(item.id, `${path}.id`)
  const questionId = text(item.questionId, `${path}.questionId`)
  const title = text(item.title, `${path}.title`)
  const url = text(item.url, `${path}.url`)
  const answerNumber = id.match(/^answer:([1-9]\d*)$/)?.[1]
  const questionNumber = questionId.match(/^question:([1-9]\d*)$/)?.[1]
  if (!answerNumber || !questionNumber || !title.trim() || url !== `https://www.zhihu.com/question/${questionNumber}/answer/${answerNumber}`) {
    fail(path, 'invalid canonical answer')
  }
  const authorId = optionalText(item.authorId, `${path}.authorId`)
  const authorName = optionalText(item.authorName, `${path}.authorName`)
  if (authorId === '' || authorName === '') fail(path, 'empty optional author field must be omitted')
  if (authorName !== undefined && authorId === undefined) fail(path, 'unverified author display')
  if (authorId !== undefined && !/^author:[A-Za-z0-9_-]+$/.test(authorId)) fail(`${path}.authorId`, 'invalid verified author ID')
  const result: ShareAnswer = { id, questionId, title, url }
  if (authorId !== undefined) result.authorId = authorId
  if (authorName !== undefined) result.authorName = authorName
  for (const key of ['publishedAt', 'updatedAt', 'likeCount', 'commentCount', 'favoriteCount'] as const) {
    const parsed = optionalCount(item[key], `${path}.${key}`)
    if (parsed !== undefined) {
      if (parsed === 0) fail(`${path}.${key}`, 'zero value must be omitted')
      if ((key === 'publishedAt' || key === 'updatedAt') && parsed > SHARE_MAX_PUBLIC_TIMESTAMP) fail(`${path}.${key}`, 'timestamp is outside share.v1 range')
      result[key] = parsed
    }
  }
  return result
}

const deepFreeze = <T>(value: T): T => {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value)) deepFreeze(child)
  return Object.freeze(value)
}

export function parseShareView(value: unknown): ShareView {
  const root = shape(value, 'share', ['schemaVersion', 'questions', 'answers'], ['legacy'])
  if (root.schemaVersion !== 'share.v1') fail('share.schemaVersion', 'unsupported version')
  if (Object.hasOwn(root, 'legacy') && root.legacy !== true) fail('share.legacy', 'false must be omitted')
  const budget: ParseBudget = { edges: 0 }
  const questions = array(root.questions, 'share.questions', SHARE_MAX_QUESTIONS, 'question').map((item, index) => parseQuestion(item, `share.questions[${index}]`, budget))
  const answers = array(root.answers, 'share.answers', SHARE_MAX_ANSWERS, 'answer').map((item, index) => parseAnswer(item, `share.answers[${index}]`))
  if (root.legacy === true && (questions.length !== 0 || answers.length !== 0)) fail('share.legacy', 'legacy view cannot expose content')
  const questionsById = new Map<string, ShareQuestion>()
  questions.forEach((question, index) => {
    if (index > 0 && questions[index - 1].id >= question.id) fail('share.questions', 'must be unique and strictly sorted')
    questionsById.set(question.id, question)
  })
  const answersById = new Map<string, ShareAnswer>()
  answers.forEach((answer, index) => {
    if (index > 0 && answers[index - 1].id >= answer.id) fail('share.answers', 'must be unique and strictly sorted')
    if (!questionsById.has(answer.questionId)) fail(`share.answers[${index}].questionId`, 'unknown question')
    answersById.set(answer.id, answer)
  })
  const referenced = new Set<string>()
  questions.forEach((question, questionIndex) => question.answerIds.forEach((answerId, index) => {
    if (index > 0 && question.answerIds[index - 1] >= answerId) fail(`share.questions[${questionIndex}].answerIds`, 'must be unique and strictly sorted')
    const answer = answersById.get(answerId)
    if (!answer || answer.questionId !== question.id) fail(`share.questions[${questionIndex}].answerIds[${index}]`, 'invalid answer reference')
    referenced.add(answerId)
  }))
  if (referenced.size !== answers.length) fail('share.answers', 'unreferenced answer')
  return deepFreeze({
    schemaVersion: 'share.v1',
    ...(root.legacy === true ? { legacy: true as const } : {}),
    questions,
    answers,
  })
}

class ReadonlyMapFacade<K, V> implements ReadonlyMap<K, V> {
  readonly #source: Map<K, V>
  constructor(source: Map<K, V>) { this.#source = source; Object.freeze(this) }
  get size() { return this.#source.size }
  get [Symbol.toStringTag]() { return 'ReadonlyMap' }
  has(key: K) { return this.#source.has(key) }
  get(key: K) { return this.#source.get(key) }
  entries() { return this.#source.entries() }
  keys() { return this.#source.keys() }
  values() { return this.#source.values() }
  [Symbol.iterator]() { return this.#source[Symbol.iterator]() }
  forEach(callback: (value: V, key: K, map: ReadonlyMap<K, V>) => void, thisArg?: unknown) {
    this.#source.forEach((value, key) => callback.call(thisArg, value, key, this))
  }
}

export function indexShareView(view: ShareView) {
  return Object.freeze({
    view,
    questionsById: new ReadonlyMapFacade(new Map(view.questions.map((question) => [question.id, question]))),
    answersById: new ReadonlyMapFacade(new Map(view.answers.map((answer) => [answer.id, answer]))),
  })
}
