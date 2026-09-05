import * as THREE from 'three'
import type { Universe } from '../../types'
import { nebulaPaletteRgb } from '../nebulaPalette'

// 实时星图与分享卡静帧共用的场景参数。
//
// 两边必须共用同一份取值，否则卡片和星图会长成两个宇宙。

/** 视场角。60° 比 three 默认的 75° 稳一点，边缘的点精灵不会被拉变形。 */
export const FOV = 60

/** 核心相对星系半径的直径；宁可小一些，不和近景恒星争主体。 */
export const NEBULA_CORE_DIAMETER_SCALE = 2.25

/** 进入恒星系后背景额外退让，与距离退让叠加。 */
export function nebulaFocusGain(focused: boolean): number {
  return focused ? 0.38 : 1
}

/**
 * 场景包围半径。
 *
 * 相机距离、景深范围、星云壳层尺度全部由它导出 —— 后端布局的尺度改了，
 * 这里一行都不用动。
 */
export function sceneRadius(u: Universe): number {
  let m = 0
  for (const s of u.stars) m = Math.max(m, Math.hypot(s.p[0], s.p[1], s.p[2]))
  for (const c of u.clusters) m = Math.max(m, Math.hypot(c.c[0], c.c[1], c.c[2]))
  return Math.max(60, m)
}

/**
 * 星云配色。
 *
 * 底色取自本人最大的几个星群 —— 背景也是数据的一部分，两个人的宇宙不该是
 * 同一种蓝。但不能直接拿恒星色当星云色：黑体色只有橙和蓝白两端，真星云有
 * 洋红和青，所以是拿星群色去染三种星云本色，而不是反过来。
 */
export function nebulaPalette(u: Universe): [THREE.Color, THREE.Color, THREE.Color] {
  const [body, highlight, rim] = nebulaPaletteRgb(u.clusters)
  return [
    new THREE.Color(body![0], body![1], body![2]),
    new THREE.Color(highlight![0], highlight![1], highlight![2]),
    new THREE.Color(rim![0], rim![1], rim![2]),
  ]
}
