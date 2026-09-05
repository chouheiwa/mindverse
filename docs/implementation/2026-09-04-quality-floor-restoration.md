# 全局画质地板恢复（批次 1）

- 日期：2026-09-04（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0 的未提交状态上继续）
- 范围：**只恢复 Three.js 已有的等价能力，不新增产品效果**
- 证据：批次 0 建立的像素级 visual parity 门禁

## 1. 五项恢复

### 1.1 恒星 HDR 真的越过 bloom 阈值

旧状态是一处**参数错位**：`starSurface.fragment.fx` 的输出峰值约 1.0，而
`bloomThreshold` 被定在 **1.05** —— 恒星的任何一个像素都够不着阈值，于是
bloom 通道永远空转，恒星在画面上是一颗有花岗岩纹理的灰球。

- 阈值改为 Three `BloomEffect` 的 `luminanceThreshold = 0.68`。
- 表面着色器新增 `uHdrGain`，取 **4.0**（Three 用 `GAIN.core = 4.6` 做同一件事，见 `gl/stars.ts`），输出上限从 `2.8` 提到 `6.0`。
- 新增 `stellarRadiance.ts`：着色器辐亮度的 CPU 镜像（与 `planetVisibility.ts` 镜像行星门限是同一套做法），让"峰值是否越过阈值"成为可断言的事实而不是靠肉眼看截图。

镜像算得的结果（fixture 星 12288 K）：圆面中心亮度 **≈ 3.03**（阈值的 4.5 倍），
limb 边缘 **≈ 0.91**（仍在阈值之上）—— 于是整个圆面都有柔光，而不是只有一个亮点。
Fallback 着色器同样带上增益，避免着色器降级时恒星直接变暗。

### 1.2 分档 Bloom，全景不再关闭

新增 `babylon/cinematic.ts`，对齐 `gl/cinematic.ts`：

| 档位 | bloomWeight | 来源 | kernel（全景 / 聚焦 / 地层） | bloomScale |
|---|---:|---|---|---:|
| high | 0.72 | Three `bloom` | 32 / 64 / 48 | 0.5 |
| medium | 0.62 | Three `bloom` | 24 / 48 / 36 | 0.5 |
| low | 0.48 | Three `bloom` | 16 / 32 / 24 | 0.4 |

`babylonBloomPolicy` 现在恒返回 `enabled: true` —— 旧实现在全景直接关闭，
于是那一屏里最该发光的东西（恒星）反而是唯一不发光的。省填充率改用更窄的核，
而不是整段关掉。

**没有整屏发白**：实测 `clippedWhiteRatio`（RGB 三通道都 ≥ 250 的像素占比）
最高 0.0140，远低于门禁的 0.08 上限。

### 1.3 抗锯齿与分档 DPR

| 档位 | 桌面 DPR | 移动 DPR | MSAA | FXAA | 每 CSS 像素采样数 | Three 同档 |
|---|---:|---:|---:|---|---:|---:|
| high | **2.0** | 1.5 | 4 | 否 | 16 | 16 |
| medium | 1.75 | 1.25 | 1 | 是 | 3.06 | 4 |
| low | 1.5 | 1.0 | 1 | 是 | 2.25 | 4 |

旧实现：`pipeline.fxaaEnabled = false`、`pipeline.samples` 从未设置（=1）、
所有桌面无条件 `1.25`。现在 high 档回到 Three 的 2.0 + 4× MSAA，medium/low
分档并各自获得 FXAA。单测锁死了一条不变量：**任何档位的采样预算都不超过
Three 同档位**，所以画质恢复不是拿性能换来的。

DPR 现在必须在 `engine.setHardwareScalingLevel` 之前解析出画质档位，
构造顺序已相应调整。

### 1.4 聚焦时保留星空背景

审计里"非聚焦星全部熄灭"的说法需要更正：`coreAlpha/haloAlpha = 0` 只作用于
**被聚焦的那一颗**（它改由球体渲染，点精灵理应让位）；其余恒星走的是
`effectiveNonFocusedOpacity`，旧值 **0.18**，从未熄灭。

本批次把这个字面量换成 Three 的共享常量 `focusEmphasis.NON_FOCUSED_OPACITY = 0.12`，
两个渲染器从此共用同一个真相源，并补了一条回归测试：除 `strata` 外任何阶段
背景星光都必须 `> 0`。

### 1.5 保留既有性能机制

懒加载（`materializedPlanetsForStar`）、隐藏页停绘、30/60fps 调度、
单 Engine / 单 WebGL context 全部原样保留，没有为了画质删掉任何一项。

## 2. 顺带修正的一处度量错觉

`p95FrameTime` 记录的是 **两次渲染之间的墙钟间隔**，而 Babylon 运行时空闲时
刻意节流到 30fps —— 所以这个数被节流目标钉在 33–42 ms，与场景开销几乎无关，
而且 `elapsedRenderDelta` 上限 50 ms 让它**在数学上不可能超过相对预算**。

`BabylonRuntime` 新增了真正的开销采样（`scene.render()` 内部耗时），
并接入 `resources.renderCostMs / maxRenderCostMs` 与性能基线 JSON。
这只是新增观测，没有改动任何调度行为。

## 3. 指标

### 3.1 帧统计（`babylon-stellar-v1`，1440×900，dense 500 星 fixture）

| 状态 | highlight 前 | highlight 后 | clippedWhite 后 |
|---|---:|---:|---:|
| panorama | 0.0008 | 0.0008 | 0.0000 |
| approach-midpoint | 0.0007 | **0.0194** | 0.0026 |
| focused-star | 0.0015 | **0.0219** | 0.0070 |
| planet-focus | 0.0014 | **0.0854** | 0.0140 |

`highlight` = 亮度 ≥ 0.85 的像素占比。恒星 HDR 恢复后提升 15–61 倍，
而过曝像素仍远低于 0.08 的门禁上限。全景状态几乎不变：该 fixture 的全景里
只有一颗极小的恒星，可提升的余量本就有限。

### 3.2 跨引擎 parity（1280×720，`three-parity-v1` 为基准）

| 状态 / 指标 | Three | Babylon 前 | Babylon 后 | 判定 |
|---|---:|---:|---:|---|
| planet-focus `highlight` | 0.0504 | 0.0020 | **0.0576** | ✅ 收敛（此前差 25 倍） |
| planet-focus `bright` | 0.0390 | 0.0696 | **0.0260** | ✅ 收敛 |
| planet-focus `chroma` | 0.0519 | 0.1030 | **0.0944** | ✅ 收敛进容差 |
| focused-star `glow` | 0.0365 | — | **0.0362** | ✅ 几乎一致 |
| focused-star `faint` | 0.1271 | — | **0.1362** | ✅ 接近 |
| focused-star `coverage` | 0.1793 | — | **0.2031** | ✅ 接近 |
| panorama `faint` | 0.0575 | 0.0165 | 0.0165 | ❌ 星云未恢复（批次 2） |
| panorama `coverage` | 0.0862 | 0.0260 | 0.0260 | ❌ 同上 |
| planet-focus `coverage` | 0.2984 | 0.5584 | 0.5600 | ❌ 取景（批次 4） |

`compare:visual-parity` 仍然整体判红 —— 这是本批次预期内的结果：
剩余偏差全部来自**尚未恢复的星云/尘埃层（批次 2）**与**行星聚焦取景（批次 4）**。
`toneBand:highlight`、`toneBand:bright`、`chroma` 三项已从偏差清单中消失。

### 3.3 性能

| 指标 | 前 | 后 |
|---|---:|---:|
| medium p95 调度间隔 | 42.1 ms | 42.7 ms |
| low p95 调度间隔 | 41.9 ms | 42.1 ms |
| medium 单帧真实渲染开销 | 未测 | last 0.4 ms / max **8.0 ms** |
| low 单帧真实渲染开销 | 未测 | last 0.4 ms / max **5.9 ms** |

调度间隔基本持平（30fps 节流目标仍然达成）；真实渲染开销在 60fps 的
16.7 ms 预算里只占 0.4–8 ms。恢复 bloom + FXAA 没有把渲染推出预算。

## 4. 验证

| 检查 | 结果 |
|---|---|
| `npx oxlint` | 通过 |
| `npx tsc -b` / `tsc -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | **66 files / 725 tests** 通过（批次 0 后是 64 / 704，本批 +2 文件 +21 例） |
| `playwright --project=metal-performance --grep "four deterministic stellar states"` | 通过 |
| `playwright --project=metal-performance --grep "five deterministic thermal planets"` | 通过 |
| `playwright --project=swiftshader-functional` | 见 worker_done |
| `npm run compare:visual-parity` | **红（预期）** —— 剩余星云/取景差异 |

TDD 顺序：先写 `cinematic.test.ts`、`stellarRadiance.test.ts`、背景星光回归、
渲染开销计量共 4 组新断言，确认 7 条断言 + 3 个模块导入失败（RED），再实现到全绿。

## 5. 剩余差异（交给后续批次）

- **星云 / 尘埃 / 星群环 / 标签**（批次 2）：`panorama` 的 `faint` 与 `coverage` 仍是 Three 的 1/3。
- **行星聚焦取景**（批次 4）：`coverage` 0.56 vs 0.30、质心位移 0.32；恒星在 Babylon 里比 Three 大一圈，`focused-star` 的 `highlight` 因此偏高（0.0219 vs 0.0084）。
- **恒星衍射星芒**：Three 在球体阶段仍保留 flare 精灵，Babylon 的聚焦球体没有；属于图层缺失，归批次 2/5。
- **绝对性能预算**：`MINDVERSE_REFERENCE_DEVICE=1` 仍无法通过，因为它闸的是被节流钉死的调度间隔而非真实开销。真实开销已可观测（max 8 ms），建议后续把绝对预算改挂在 `maxRenderCostMs` 上。
