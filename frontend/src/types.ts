// 与 Go 侧 internal/engine 的 JSON tag 逐字对齐。
// 任何一边改字段，这里必须同步 —— 星图的每个视觉参数都绑在这些字段上。

export interface Evidence { t: string; u: string; o: number; y: string }

export interface Star {
  c: string          // 概念名
  g: number          // 所属星群
  p: [number, number, number]
  n: number          // 关联条目数 → 半径
  o: number          // 我写过
  f: number          // 我收藏
  hue: number        // 光谱：32 琥珀 / 218 蓝白
  sat: number        // 饱和度，中点近乎纯白
  pe: number         // 持续性 → 亮度
  bu: number         // 集中度 → 闪烁幅度
  fi: string
  la: string
  ev: Evidence[]
}

export interface Cluster {
  g: number
  name: string
  lead: string
  c: [number, number, number]
  n: number
  o: number
  f: number
  hue: number
  sat: number
  mem: string[]
}

export interface WormholeEvidence { t: string; u: string; a: string; b: string }

export interface Wormhole {
  a: number; b: number
  an: string; bn: string
  obs: number        // 实际跨越次数
  exp: number        // 随机预期
  z: number
  ev: WormholeEvidence[]
}

export interface Solo { c: string; n: number; t: string; u: string; g: string[]; p: [number, number, number] }
export interface Dark { c: string; f: number; o: number; first: string; last: string; ev: Evidence[] }
export interface Nebula { c: string; n: number; burst: number; first: string; last: string }

export interface Meta {
  items: number; concepts: number; clusters: number
  own: number; fav: number
  span: [number, number]
  medz: number; p10z: number
  source: string; splits: number
}

export interface Universe {
  meta: Meta
  clusters: Cluster[]
  stars: Star[]
  particles: [number, number, number, number, number][]  // x,y,z,星群,是否本人创作
  wormholes: Wormhole[]
  solo: Solo[]
  dark: Dark[]
  nebula: Nebula[]
}

export type GenState = 'idle' | 'running' | 'done' | 'failed'

export interface Generation {
  state: GenState
  stage: string
  progress: number
  error?: string
  universe?: Universe
  filtered: number     // 因敏感类目未参与分析的条数，必须如实展示
  source: string
  calls: number
}

export interface OAuthStatus {
  configured: boolean
  localOnly: boolean
  authorized: boolean
  appId: string
  redirectUri: string
  profile: { name: string; avatar_url: string; headline: string; url: string } | null
  stateVerified: boolean
  csrfClaimAllowed: boolean
  source: string
  warnings: { code: string; message: string }[]
}

export type Mode = 'all' | 'worm' | 'dark' | 'nebula' | 'solo' | 'me'
