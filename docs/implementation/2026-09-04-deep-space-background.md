# 深空背景与恒星光学层恢复（批次 2）

- 日期：2026-09-04（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0 / 1 的未提交状态上继续）
- 范围：**等价迁移 Three 已有的背景图层，不新增产品效果**
- 结果：**panorama 的 `faint` 与 `coverage` 双双回到容差内**，两条背景越界从偏差清单消失

## 1. 图层实现

### 1.1 星云：三层壳 + 星系核心（`babylon/nebulaLayer.ts`）

与 `gl/nebula.ts` 同构，`NEBULA_SHELLS` 的半径倍率 / 噪声频率 / 域扭曲 / 亮度窗口 /
扁平度 / 尘埃带 / 自转速度七个参数逐字对齐：

| 壳 | r | freq | warp | low–high | flat | dust | spin |
|---|---:|---:|---:|---|---:|---:|---:|
| 0 | 1.00 | 3.4 | 1.10 | 0.10–0.62 | 1.45 | 0.55 | 0.0042 |
| 1 | 1.62 | 2.3 | 0.85 | 0.16–0.70 | 1.05 | 0.38 | 0.0026 |
| 2 | 2.45 | 1.5 | 0.55 | 0.24–0.80 | 0.72 | 0.20 | 0.0015 |

**一次烘焙，不逐帧算噪声**：域扭曲 fbm 单像素要跑三十来次 simplex。这里用 Babylon 的
`ProceduralTexture(isCube: true)` 把六个面各渲一次，`refreshRate = 0`
（`REFRESHRATE_RENDER_ONCE`），之后每帧只剩一次 `textureCube` 采样。
GLSL 噪声直接复用 `gl/chunks.ts` 的 `SIMPLEX3` / `FBM` —— 那个文件是纯字符串、
不 import three，所以两个渲染器共用同一份噪声，不是各写一份。
面方向由 `face` uniform + `vUV` 反解，用的是 GL 立方体查表的逆映射，跨面连续无缝。

**调色共享**：把 `gl/scene.ts` 的 `nebulaPalette` 抽成与渲染器无关的
`src/starmap/nebulaPalette.ts`（返回纯元组），Three 侧改为包一层 `THREE.Color`。
「青色边缘先拉向白再混」这条规避脏黄绿的处理也一并共享，两边不会再算出两套底色。

**尺度锚点**：星云和核心是按**张角**读出来的。用星群包围盒当尺度时，单星宇宙里
相机停在 19 个单位处却对着一枚 135 单位宽的核心盘，整屏糊成均匀奶白。
`backgroundRadiusFor(panoramaDistance) = distance / 1.62` 由全景相机距离反推
（Three 的 `targetDist = sceneRadius * 1.62`），两个渲染器的张角这才一致。

**单面渲染**：相机在壳内，只画远侧那一面。两面都画等于把星云叠加两遍。

### 1.2 尘埃与边缘微光（`babylon/dustLayer.ts`）

与 `gl/dust.ts` 同构。每一条真实内容一粒，跟着所属星群公转（顶点着色器里用共享的
`ORBIT` chunk，与 `projection.ts` 同式）；本人创作的那一粒更大更白
（size 1.9 / 1.35，饱和度下限 24）—— 画面里唯一区分「写过 / 收过」的尘埃线索。
边缘微光是没能进入任何星群的概念，带 0.55 的呼吸闪烁：它们是「差一点就成星」的东西，
闪烁本身就是语义。

`gl_PointSize` 封顶 9 px：尘埃按 1/z 能涨到上百像素，整个背景会糊成一团棉花。

模式衰减表逐值对齐（`dustModeDimension` / `soloModeDimension`）：

| | all | worm（相关星群） | worm（其余） | 其他模式 |
|---|---:|---:|---:|---:|
| 尘埃 | 1 | 0.9 | 0.07 | 0.12 |
| 边缘微光 | 0.34 | 0.08 | 0.08 | solo 模式为 1 |

**全场两个 batch**：尘埃一个、微光一个，属性一次上传。

### 1.3 恒星衍射星芒的门槛

Three 卡在 `bright >= 0.85`（`gl/stars.ts` 的 `SPIKE_THRESHOLD`）：只有持续性最高的
那十来颗会长芒。Babylon 的 `uFlareThreshold` 此前是随手写的 `2.0`，而点精灵用的是
对数亮度 `0.72 + log1p(bright * 4)` —— 换算下来相当于 `bright ≈ 0.65`，
门槛低了一大截，于是几乎每颗星都插着十字。

现在由 `STAR_FLARE_THRESHOLD = starPanoramaBrightness(0.85) ≈ 2.2016` 经同一条映射
算出来，并有单测锁住：持续性 ≤ 0.7 的星一律不长芒，均匀铺开的持续性分布里
长芒的比例低于 25%。

### 1.4 画质分档只降规格，不删图层

| 档位 | 烘焙边长 | shellGain | coreGain | 尘埃密度 |
|---|---:|---|---:|---:|
| high | 512 | [0.10, 0.075, 0.035] | 0.38 | 1.00 |
| medium | 256 | [0.085, 0.055, 0.025] | 0.30 | 0.75 |
| low | 128 | [0.06, 0.035, 0.015] | 0.22 | 0.50 |

增益取自 `gl/cinematic.ts`。抽稀用 `densitySelection` 取均匀分布的样本，
而不是砍掉尾巴 —— 后者会让一整个星群消失。单测锁住：三档的壳数恒为 3、
核心恒为 1、增益恒 > 0、尘埃与微光计数恒 > 0。

### 1.5 曝光校准（唯一一处非 Three 原值）

壳层增益逐字取自 Three，但同一组线性值在两条管线里落点不同：Three 烘进 HalfFloat
立方体贴图并走 postprocessing 的 Neutral 曲线，Babylon 烘进 8 位贴图并走
KHR PBR Neutral（exposure 0.92）。实测同增益下 Babylon 的非背景像素占比是 Three 的
约 1.9 倍。差的是管线不是参数，所以补一个显式命名的标量
`NEBULA_EXPOSURE = 0.55`，而不是去改那三组有出处的增益。单测锁住它是
「Three 增益 × 一个可见常量」的形式。

## 2. 截图指标（1280×720，`three-parity-v1` 为基准）

| 状态 / 指标 | Three | 批次 1 后 | 批次 2 后 | 判定 |
|---|---:|---:|---:|---|
| panorama `faint` | 0.0575 | 0.0165 | **0.0661** | ✅ 偏差 0.0409 → **0.0086** |
| panorama `coverage` | 0.0862 | 0.0260 | **0.0757** | ✅ 偏差 0.0602 → **0.0105** |
| panorama `clippedWhite` | 0.0000 | 0.0000 | **0.0000** | ✅ 无过曝 |
| panorama `chroma` | 0.0641 | 0.0321 | **0.0456** | ✅ 收敛 |
| focused-star `faint` | 0.1271 | 0.1342 | **0.1342** | ✅ 容差内 |
| focused-star `coverage` | 0.1792 | 0.2031 | **0.2022** | ✅ 容差内 |
| planet-focus `clippedWhite` | 0.0000 | 0.0073 | **0.0073** | ✅ 远低于 0.08 上限 |

跨引擎偏差项：**14 → 12**，消失的两条正是任务点名的
`panorama toneBand:faint` 与 `panorama coverage`。

## 3. draw call / 纹理 / 帧耗

场景清单（由 parity 文档新增的 `meshes` / `textures` 字段实测）：

| 状态 | Three meshes | Three textures | Babylon meshes | Babylon textures |
|---|---:|---:|---:|---:|
| panorama | 17 | 13 | **10** | **3** |
| focused-star | 17 | 13 | 16 | 3 |
| planet-focus | 17 | 13 | 18 | 3 |

- 新增 draw call：星云 **4**（3 层壳 + 1 枚核心盘），尘埃 **2**（尘埃 + 微光各一批）。
- 新增纹理：**3 张**立方体贴图，构造时各烘一次（3 × 6 = 18 个 pass，一次性），之后为零。
  Three 常驻 13 张，Babylon 是 3 张。
- Babylon 的 mesh 数随聚焦从 10 涨到 18，**懒加载没有回退**；Three 恒为 17。

帧耗（500 星密集全景，1440×900）：

| 指标 | 批次 1 | 批次 2 |
|---|---:|---:|
| medium 单帧真实渲染开销 | max 8.0 ms | **max 6.0 ms** |
| low 单帧真实渲染开销 | max 5.9 ms | **max 6.9 ms** |
| medium p95 调度间隔 | 42.7 ms | 42.2 ms |
| low p95 调度间隔 | 42.1 ms | 42.4 ms |

三层背景加进来之后单帧开销仍在 6–7 ms，60fps 的 16.7 ms 预算里绰绰有余 ——
烘焙是一次性的，每帧只多了 6 个 draw call 和一次立方体采样。
30fps 空闲节流、隐藏页停绘、单 Engine / 单 context 均未改动。

## 4. 验证

| 检查 | 结果 |
|---|---|
| `npx oxlint` | 通过 |
| `npx tsc -b` / `tsc -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | **69 files / 745 tests** 通过（批次 1 后是 66 / 725，本批 +3 文件 +20 例） |
| `playwright --project=visual-parity`（Three & Babylon） | 各 2/2 通过 |
| `playwright --project=metal-performance --grep "four deterministic stellar states"` | 通过 |
| `playwright --project=metal-performance --grep "five deterministic thermal planets"` | 通过 |
| `playwright --project=swiftshader-functional` | 19/19 通过 |
| `npm run compare:visual-parity` | **红（预期）** —— 剩余为构图与图案差异 |

TDD 顺序：先写 `nebulaPalette` / `nebulaLayer` / `dustLayer` / 星芒门槛四组断言，
确认 3 个模块导入失败 + 2 条断言 RED，再实现到全绿；随后由实拍指标发现两处
（背景尺度锚点、壳层双面渲染）问题，各自补一条断言再修。

## 5. 剩余差异

| 越界 | 归属 |
|---|---|
| 三个状态的 `structure:tileMax` / `tileRms` | 两套独立烘焙的噪声场云团落点必然不同，逐格亮度不可能对齐；这是门禁指标的固有下限，不是缺失图层 |
| panorama `subject:centroid` / `subject:radius` | 同上（云团分布）+ Three 还画了星群名标签，Babylon 的标签层仍未恢复 |
| planet-focus `coverage` / `faint` / `glow` / `centroid` | 取景仍由行星半径导出（批次 4）；行星与恒星占满画面，与背景无关 |
| focused-star `structure` | 恒星比 Three 大一圈，同属取景 |
| 星群名标签 | `labelCanvas` 仍只 resize 不绘制 —— 归批次 2 的尾巴或批次 5 |
| 星群轨道环 / 虫洞 / 暗物质叠加 | 未在本批次范围内 |
| 探测器 | 批次 5 |
