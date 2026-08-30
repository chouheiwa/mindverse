import * as THREE from 'three'
import type { Universe } from '../../types'
import { starColor } from './blackbody'

// 实时星图与分享卡静帧共用的场景参数。
//
// 两边必须共用同一份取值，否则卡片和星图会长成两个宇宙。

/** 视场角。60° 比 three 默认的 75° 稳一点，边缘的点精灵不会被拉变形。 */
export const FOV = 60

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
  const top = [...u.clusters].sort((a, b) => b.n - a.n).slice(0, 3)
  const tint = (i: number) => {
    const c = top[i] ?? top[0]
    if (!c) return new THREE.Color(0.6, 0.7, 1)
    const [r, g, b] = starColor(c.hue, c.sat)
    return new THREE.Color(r, g, b)
  }
  // 边缘那层是青色，而青与琥珀是补色，直接按 26% 混会混出脏黄绿。
  // 色温主轴换成时间之后，第三大星群完全可能是暖色（实测：演化路径 hue32），
  // 画面边缘就会出现一圈橙青撕裂，看着像色差而不像设计。
  // 先把它拉向白再混：保留亮度上的呼应，不引进对冲的色相。
  const pale = tint(2).clone().lerp(new THREE.Color(1, 1, 1), 0.62)
  return [
    new THREE.Color(0.12, 0.19, 0.66).lerp(tint(0), 0.26),  // 深蓝紫，主体
    new THREE.Color(0.54, 0.16, 0.60).lerp(tint(1), 0.30),  // 洋红紫，亮部
    new THREE.Color(0.04, 0.42, 0.48).lerp(pale, 0.26),     // 青，边缘
  ]
}
