// 画质分级：横切关注点。
// Session 1 先用 navigator 启发粗分三档；后续 session 会在此之上加
// “首帧耗时”实测（见设计文档 §5.3），但接口 (Quality / detectQuality) 不变。
//
// 分级用途（各 session 往上加自己的行）：
//   Session 1 景深：low 不创建 DOF；medium/high 给不同 bokehScale。
//   Session 3 创世：low 跳过爆发段、粒子降至 1/4。
//   Session 4 虫洞：所有档位保留穿越（§7.9），low 降 RT 分辨率。
//   Session 5 透镜：low 关真扭曲，只留极淡环。

export type Quality = 'high' | 'medium' | 'low'

export function detectQuality(reduceMotion: boolean): Quality {
  // 降级动效偏好 = 直接 Low：用户主动要求少动效，景深也该退场
  if (reduceMotion) return 'low'

  const cores = navigator.hardwareConcurrency || 4
  // deviceMemory 非标准但主流浏览器可用；拿不到就当中等
  const mem = (navigator as { deviceMemory?: number }).deviceMemory ?? 4

  // 集显启发：逻辑核心少 / 内存小 → medium
  // 真正的首帧耗时实测留给后续；这里只保证 Low 路径能被触发到
  if (cores < 6 || mem < 4) return 'medium'
  return 'high'
}
