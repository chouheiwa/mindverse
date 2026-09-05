# 相机取景与交互恢复（批次 4）

- 日期：2026-09-04（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0–3 的未提交状态上继续）
- 范围：**恢复旧 Three.js 的取景、运动与点击交互，不做提升项**
- 结果：三个状态的相机距离与 Three 逐位对齐；「恒星成为整屏背景墙」消失

## 1. 根因：取景全部改成了「按包围盒推」

| 状态 | Three | 迁移后 | 现在 |
|---|---|---|---|
| 全景 | `sceneRadius × 1.62`（从原点量、下限 60） | 星群包围盒 `extent × 2.4` | **`sceneRadius × 1.62`** |
| 恒星聚焦 | `SYSTEM_DIST = 16` | `max(bodyR×8, bodyR×14, extent×1.35)` | **按视场算 + 下限 16** |
| 行星聚焦 | `clamp(orbitR × 0.8, 2.8, 6.0)` | **`planetRadius × 4`** | **`clamp(orbitR × 0.8, 2.8, 6.0)`** |
| 视场 | 60°（刻意，边缘点精灵不变形） | Babylon 默认 0.8 rad ≈ 45.8° | **60°** |

视场不同，同一个距离占屏比例就不同 —— 所以所有距离常量都不可迁移。先把视场对齐，
Three 的那几个数才能逐字照搬。这是新增 `babylon/framing.ts` 的全部理由。

实测相机距离（strata fixture，1280×720）：

| 状态 | Three | 批次 3 | 批次 4 |
|---|---:|---:|---:|
| panorama | 97.22 | 19.20 | **97.20** |
| focused-star | 16.01 | 10.00 | **16.00** |
| planet-focus | 2.80 | ~0.56 | **2.80** |

`SYSTEM_DISTANCE_FLOOR = 16`：Three 把它写死，因为那套轨道阶梯外缘总在 8 个单位
上下。行星少的恒星系不该因为「实测外缘更小」被推近一倍 —— 那正是恒星占满画面的成因。

## 2. 关键像素指标（前 → 后，Three 为基准）

| 状态 / 指标 | Three | 批次 3 | 批次 4 | 判定 |
|---|---:|---:|---:|---|
| planet-focus `coverage` | 0.2984 | 0.5604 | **0.3717** | 偏差 0.262 → 0.073 |
| planet-focus `toneBand:faint` | 0.1748 | 0.3447 | **0.2580** | 偏差 0.170 → 0.083 |
| planet-focus `toneBand:glow` | 0.0342 | 0.1315 | **0.0482** | ✅ 进容差 |
| planet-focus `highlight` | 0.0504 | 0.0584 | **0.0507** | ✅ 几乎一致 |
| planet-focus `subject:radius` | 0.3511 | 0.4003 | **0.3225** | ✅ 进容差 |
| planet-focus 主体宽度 | 77.2 px | 221.8 px | **152.7 px** | 2.87× → 1.98× |
| focused-star `highlight` | 0.0084 | 0.0221 | **0.0082** | ✅ 几乎一致 |
| focused-star `structure:tileMax` | — | 偏差 0.298 | **偏差 0.091** | 大幅收敛 |
| panorama `coverage` | 0.0862 | 0.0757 | **0.0826** | ✅ 进容差 |
| panorama `faint` | 0.0575 | 0.0661 | **0.0723** | ✅ 进容差 |

跨引擎偏差项 **12 → 11**。`clippedWhite` 全状态 ≤ 0.0120，无过曝。

星云曝光常量随视场重新标定一次（0.55 → 0.78）：更宽的镜头看到更多两极稀薄区域，
同样增益下非背景占比掉到 Three 的 0.63 倍。

## 3. 交互路径（全部由 `swiftshader-functional` 19/19 覆盖）

| 路径 | 状态 |
|---|---|
| 悬停恒星光晕 → 指针变化、hoverProgress | ✅ |
| 点击恒星边缘 → 飞行、系统渐显、轨道与行星出现 | ✅ |
| 拖拽 > 6 px → 旋转且不选中 | ✅ |
| 空白点击 / 外拉滚轮 / Escape → 行星 → 恒星 → 全景逐级退出 | ✅ 三种输入各自通过 |
| pointercancel / lostpointercapture / 第二指 → 取消点击资格 | ✅ |
| Reduced Motion → 无长飞行直达稳定聚焦态 | ✅ |
| 进入地层、地表穿越、自由下潜、点击答案标本、关闭证据板、退出并精确恢复相机 | ✅ |
| 五次完整挂载 → 进入 → 退出 → 销毁，资源归零 | ✅ |
| resize / webglcontextlost 重挂载 | ✅ |

滚轮阶梯改为按 Three 的阈值：`planet → star` 在 `systemDistance × 0.85`、
`star → panorama` 在 `sceneRadius × 0.9`，下限三层 `PLANET_NEAR 1.2 / SYSTEM_NEAR 4.5 /
sceneRadius × 0.62`。阅读工作台打开时相机拉到 `PLANET_NEAR`，与 Three 一致。

**进入行星体验**：宇宙层在进入地层时整体 `setEnabled(false)`、雾开启，答案纪年是一个
真实的三维洞窟（深度 HUD、地表裂隙、层界、答案标本、「返回行星表面」出口），不是
宇宙上叠文字。该场景在批次 0 之前已存在；本批次验证它在新取景与新过渡下仍然完整，
并在 functional 门禁里附上了截图证据。

## 4. 过程中门禁抓到的三个真问题

1. **相机飞行在慢硬件上饿死**：飞行按累加的、被 50 ms 封顶的帧间隔推进，SwiftShader
   上一帧几百毫秒，`approachProgress` 卡在 0.935 永不到 1，UI 一直停在「接近中」。
   改为按墙钟推进，**并限制每帧最多推进八分之一**（否则一帧直接跳到终点，接近过程
   的系统渐显根本画不出来）。两条互相矛盾的 functional 用例同时转绿。
2. **聚焦行星拿不到细节着色器**：`MEDIUM_TO_HIGH = 0.22` 是配着「行星半径 × 4」调的。
   取景恢复后外圈行星为了把恒星留在画面里退到 6 个单位外、占屏不到十分之一 ——
   而那正是最需要细节的时刻。改成「被选中的行星恒取最细表面」，比再调一个阈值诚实。
3. **对齐 Three 开场机位反而更糟**：`arcRotateFromYawPitch` 把 Three 的 yaw 0.5 /
   pitch -0.2 正确换算成 alpha 1.07 / beta 1.37，但采用后恒星挤到相机与行星之间，
   planet-focus 覆盖率 0.37 → 0.69、行星整个躲进恒星边缘。已保留换算函数与单测，
   但机位维持能把恒星摆在行星背后当光源的方位，并在代码里写明实测依据。

## 5. draw call / 帧耗 / 资源释放

| | panorama | focused-star | planet-focus |
|---|---:|---:|---:|
| mesh | 10 | 16 | 18 |
| texture | 3 | 3 | 3 |

懒加载未回退（10 → 18 随聚焦增长）；纹理恒为 3 张一次性烘焙的立方体贴图。

| 指标 | 批次 3 | 批次 4 |
|---|---:|---:|
| medium 单帧真实渲染开销 | last 0.3 / max 8.3 ms | last 1.1 / **max 9.4 ms** |
| low 单帧真实渲染开销 | last 0.3 / max 10.3 ms | last 0.7 / **max 7.1 ms** |
| p95 调度间隔 | 42.3 / 42.4 ms | 43.0 / 43.1 ms |

视场从 45.8° 拓到 60° 会多画约 30% 的像素，实测单帧开销仍在 7–10 ms，远低于
30fps 节流目标。单 Engine / 单 context、隐藏页停绘、五次挂载资源归零均未变。

## 6. 被我改动过的门禁阈值（需要复核）

| 门禁 | 原值 | 现值 | 理由 |
|---|---:|---:|---|
| `thermal planets` 的 `bodyDiameter` | ≥ 180 px | **≥ 45 px** | 180 px 编码的是「行星半径 × 4」那套占满三分之一屏的回归取景。恢复后最外圈样本约 54 px / 900；Three 自己的 planet-focus 主体是 77 px / 720，而且那是**最内圈**轨道。45 px（短边 5%）只保证「还是个天体不是一个点」，不再编码某个相机距离 |
| `planetLod` 的 `MEDIUM_TO_HIGH` | 0.22 | 取消 | 改为「被选中即最细」 |

这两处都是**跟着回归一起被调出来的阈值**，不是为了让改动通过而放松的门禁 ——
但它们确实是我下调的，请复核这个判断。

## 7. 验证

| 检查 | 结果 |
|---|---|
| `npx oxlint` | 通过 |
| `npx tsc -b` / `tsc -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | **75 files / 811 tests** 通过（批次 3 后是 74 / 785） |
| `playwright --project=swiftshader-functional` | **19/19** 通过 |
| `playwright --project=metal-performance --grep "four deterministic stellar states"` | 通过 |
| `playwright --project=metal-performance --grep "thermal planets"` | 通过 |
| `playwright --project=visual-parity --grep mode`（模式栏） | 2/2 通过 |
| `npm run compare:visual-parity` | **红（预期）**，11 项 |

## 8. 仍未恢复的差异

| 越界 | 说明 |
|---|---|
| 三个状态的 `structure:tileMax` / `tileRms` | 两套独立烘焙的噪声场云团落点必然不同，门禁指标的固有下限 |
| panorama `subject:centroid` (0.080) / `subject:radius` (0.316) | 同上；Three 的星云图案落在画面另一侧，质量分布因此不同 |
| planet-focus `subject:centroid` (0.357) | 相机方位仍与 Three 不同（见 §4.3）：换成 Three 的方位会把恒星挤到行星前面 |
| planet-focus `coverage` (0.073) / `faint` (0.083) | 恒星在近景里仍比 Three 大一圈 —— Babylon 的 `bodyR` 与 Three 的恒星球体尺度未对齐，属于恒星几何而非取景 |
| focused-star `structure:tileMax` (0.091) | 同上 |
| 探测器 | 批次 5 |
