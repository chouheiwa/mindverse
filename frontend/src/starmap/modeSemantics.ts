import type { Mode, Universe } from '../types'

// 模式栏背后的数据语义。
//
// 迁移之后模式栏一度只剩「整屏变暗」：六个按钮里五个不产生任何新元素，
// 因为它们要强调的图层（虫洞粒子流、暗物质透镜、边缘微光、星群结构环）
// 在 Babylon 侧根本不存在。这张表把「每个模式强调哪一层数据」写成一处，
// 两个渲染器与面板文案共用同一个真相源，也让「没有一个模式是只调暗」
// 成为可断言的事实。

export const MODE_KEYS = Object.freeze(['all', 'worm', 'dark', 'nebula', 'solo', 'me'] as const)

export interface ModeLayerEmphasis {
  /** 星群结构环：真实公转半径画出来的「这是个星系」信号。 */
  readonly clusterRings: number
  /** 虫洞粒子流：唯一一条真正模态的图层。 */
  readonly wormholes: number
  /** 暗物质引力透镜。 */
  readonly darkMatter: number
  /** 内容尘埃。 */
  readonly dust: number
  /** 边缘微光：没能进入任何星群的概念。 */
  readonly soloParticles: number
  /** 被点名为「短暂而密集的爆发」的恒星。 */
  readonly nebulaStars: number
  /** 本人创作过的恒星。 */
  readonly ownStars: number
}

export interface ModeSemantics {
  readonly mode: Mode
  readonly layers: ModeLayerEmphasis
  /** 虫洞模式下保持全亮的两个星群 id。 */
  readonly wormholeClusters: readonly number[]
  /** 这个模式点名的概念名，供面板与画面对齐。 */
  readonly highlightedConcepts: readonly string[]
}

/** 非强调层的底噪。保留而不是隐藏 —— 语义是「退让」，不是「不存在」。 */
const RECESSIVE = 0.14

function emphasis(overrides: Partial<ModeLayerEmphasis>): ModeLayerEmphasis {
  return Object.freeze({
    clusterRings: RECESSIVE,
    wormholes: 0,
    darkMatter: RECESSIVE,
    dust: RECESSIVE,
    soloParticles: RECESSIVE,
    nebulaStars: RECESSIVE,
    ownStars: RECESSIVE,
    ...overrides,
  })
}

const LAYERS: Readonly<Record<Mode, ModeLayerEmphasis>> = Object.freeze({
  all: emphasis({ clusterRings: 1, dust: 1, darkMatter: RECESSIVE, soloParticles: 0.34 }),
  worm: emphasis({ wormholes: 1, clusterRings: 1, dust: 0.9 }),
  dark: emphasis({ darkMatter: 1 }),
  nebula: emphasis({ nebulaStars: 1 }),
  solo: emphasis({ soloParticles: 1 }),
  me: emphasis({ ownStars: 1 }),
})

function concepts(mode: Mode, universe: Universe): readonly string[] {
  if (mode === 'dark') return (universe.dark ?? []).map(({ c }) => c)
  if (mode === 'nebula') return (universe.nebula ?? []).map(({ c }) => c)
  if (mode === 'solo') return (universe.solo ?? []).map(({ c }) => c)
  if (mode === 'me') {
    const own = (universe.stars ?? []).filter(({ o }) => o > 0).map(({ c }) => c)
    // 一条自有内容都没有时，「好奇心结构」退回展示全部，否则会是一片空屏。
    return universe.meta?.own === 0 ? [] : own
  }
  return []
}

/**
 * @param wormIdx 当前虫洞序号；越界时不编造虫洞，返回空列表。
 */
export function describeMode(mode: Mode, universe: Universe, wormIdx: number): ModeSemantics {
  const wormhole = mode === 'worm' ? (universe.wormholes ?? [])[wormIdx] : undefined
  return Object.freeze({
    mode,
    layers: LAYERS[mode] ?? LAYERS.all,
    wormholeClusters: wormhole ? Object.freeze([wormhole.a, wormhole.b]) : Object.freeze([]),
    highlightedConcepts: Object.freeze(concepts(mode, universe)),
  })
}
