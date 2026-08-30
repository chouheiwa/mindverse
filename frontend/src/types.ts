// 与 Go 侧 internal/engine 的 JSON tag 对齐。Legacy 仅保留旧紧凑字段。
export interface Evidence { t: string; u: string; o: number; y: string }
export interface LegacyStar {
  c: string; g: number; p: [number, number, number]; n: number; o: number; f: number
  hue: number; sat: number; pe: number; bu: number; fi: string; la: string; ev: Evidence[]
}
export type ConceptScope = 'private' | 'public'
export interface CurrentStar extends LegacyStar {
  id: string
  scope: ConceptScope
  externalQueryAllowed: boolean
  questionIds: string[]
  probeIds: string[]
}
export type Star = LegacyStar | CurrentStar
export type NullableSlice<T> = T[] | null
export type WireLegacyStar = Omit<LegacyStar, 'ev'> & { ev: NullableSlice<Evidence> }
export type WireCurrentStar = Omit<CurrentStar, 'ev' | 'questionIds' | 'probeIds'> & {
  ev: NullableSlice<Evidence>
  questionIds?: NullableSlice<string>
  probeIds?: NullableSlice<string>
}
export interface Cluster {
  g: number; name: string; lead: string; c: [number, number, number]
  n: number; o: number; f: number; hue: number; sat: number; mem: string[]
}
export interface WormholeEvidence { t: string; u: string; a: string; b: string }
export interface Wormhole {
  a: number; b: number; an: string; bn: string; obs: number; exp: number; z: number
  ev: WormholeEvidence[]
}
export interface Solo { c: string; n: number; t: string; u: string; g: string[]; p: [number, number, number] }
export type WireSolo = Omit<Solo, 'g'> & { g: NullableSlice<string> }
export interface Dark {
  c: string; n: number; f: number; o: number; gap: number
  first: string; last: string; ev: Evidence[]
}
export interface Nebula { c: string; n: number; burst: number; first: string; last: string }
export interface Meta {
  items: number; concepts: number; clusters: number; own: number; fav: number
  span: [number, number]; medz: number; p10z: number; source: string; splits: number
}
export type UserContentRelation = 'created' | 'collected'
export interface UserContentBinding {
  relation: UserContentRelation
  at?: number
  folders: string[]
}
export type DiscoverySource = 'public_search' | 'favorite_list' | 'own_content'
export interface QuestionPlanet {
  id: string; questionId: string; title: string; url: string; answerIds: string[]
}
export interface PublicArtifact {
  id: string
  title: string
  summary?: string
  url: string
  authorId?: string
  authorName?: string
  publishedAt?: number
  updatedAt?: number
  observedAt?: number
  likeCount?: number
  commentCount?: number
  favoriteCount?: number
  bindings: UserContentBinding[]
  discoverySources: DiscoverySource[]
}
export interface AnswerSatellite extends PublicArtifact { questionId: string }
export type ArticleProbe = PublicArtifact
export type WireUserContentBinding = Omit<UserContentBinding, 'folders'> & {
  folders?: NullableSlice<string>
}
export type WireQuestionPlanet = Omit<QuestionPlanet, 'answerIds'> & {
  answerIds?: NullableSlice<string>
}
export type WirePublicArtifact = Omit<PublicArtifact, 'bindings' | 'discoverySources'> & {
  bindings?: NullableSlice<WireUserContentBinding>
  discoverySources?: NullableSlice<DiscoverySource>
}
export type WireAnswerSatellite = WirePublicArtifact & { questionId: string }
export type WireArticleProbe = WirePublicArtifact
interface UniverseCore<S extends Star> {
  meta: Meta
  clusters: Cluster[]
  stars: S[]
  particles: [number, number, number, number, number][]
  wormholes: Wormhole[]
  solo: Solo[]
  dark: Dark[]
  nebula: Nebula[]
}
interface WireUniverseCore<S extends WireLegacyStar> {
  meta: Meta
  clusters: NullableSlice<Omit<Cluster, 'mem'> & { mem: NullableSlice<string> }>
  stars: NullableSlice<S>
  particles: NullableSlice<[number, number, number, number, number]>
  wormholes: NullableSlice<Omit<Wormhole, 'ev'> & { ev: NullableSlice<WormholeEvidence> }>
  solo: NullableSlice<WireSolo>
  dark: NullableSlice<Omit<Dark, 'ev'> & { ev: NullableSlice<Evidence> }>
  nebula: NullableSlice<Nebula>
}
export interface CurrentUniverse extends WireUniverseCore<WireCurrentStar> {
  schemaVersion: 'universe.v1'
  analysisVersion: 'engine.v1'
  questions: NullableSlice<WireQuestionPlanet>
  answers: NullableSlice<WireAnswerSatellite>
  probes: NullableSlice<WireArticleProbe>
}
export interface LegacyUniverse extends WireUniverseCore<WireLegacyStar> {
  schemaVersion?: never
  analysisVersion?: never
  questions?: never
  answers?: never
  probes?: never
}
export type WireUniverse = CurrentUniverse | LegacyUniverse
export interface NormalizedCurrentUniverse extends UniverseCore<CurrentStar> {
  schemaVersion: 'universe.v1'
  analysisVersion: 'engine.v1'
  questions: QuestionPlanet[]
  answers: AnswerSatellite[]
  probes: ArticleProbe[]
}
export interface NormalizedLegacyUniverse extends UniverseCore<LegacyStar> {
  schemaVersion?: never
  analysisVersion?: never
}
export type Universe = NormalizedCurrentUniverse | NormalizedLegacyUniverse
export type GenState = 'idle' | 'running' | 'done' | 'failed'
export interface Generation {
  state: GenState; stage: string; progress: number; error?: string; universe?: Universe
  filtered: number; source: string; calls: number
}
export interface OAuthStatus {
  configured: boolean; localOnly: boolean; authorized: boolean; appId: string; redirectUri: string
  profile: { name: string; avatar_url: string; headline: string; url: string } | null
  stateVerified: boolean; csrfClaimAllowed: boolean; source: string
  warnings: { code: string; message: string }[]
}
export type Mode = 'all' | 'worm' | 'dark' | 'nebula' | 'solo' | 'me'
