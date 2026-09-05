# 探测器、尺度与地层：最后一批旧版恢复（批次 5）

- 日期：2026-09-05（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0–4 的未提交状态上继续）
- 范围：**恢复剩余可见效果与交互，不做提升项**
- 结果：跨引擎越界 **11 → 9**；探测器、行星世界半径、轨道相位、答案地层四项从「缺失」变成「有并且被门禁盯着」

## 1. 探测器：从「不支持」到一艘可检查的航行器

迁移后 `approachProbe` / `startProbeScan` 只回一句「Babylon 垂直样片尚未迁移探测器检查」，
`setProbeInspectionPose` / `focusProbePart` / `exitProbeInspection` 是空函数。现在：

| 能力 | 实现 | 依据 |
|---|---|---|
| 远景可辨识的三维机体 | `probeGeometry.ts` 的 12 个部件按 `far/medium/near` 分档，远景四件（船身、双翼、信标）就能读出「这是一艘船」 | `gl/probe.ts` 逐字同序 |
| 近景更完整的模型与材质 | 天线、推进器、双铰链、舱体接缝、扫描镜、内灯带、蚀刻编号；被检查的那一艘单独建模、逐件可拾取 | 同上 |
| 贴着轨道飞 | 机头对准轨道切线（`Quaternion.FromUnitVectorsToRef(+X, tangent)`），倾斜轨道也成立 | `gl/probe.ts` 的 `setFromUnitVectors(UNIT_X, tangent)` |
| 接近/飞行 | 先聚焦所属恒星，再按墙钟在 `PROBE_APPROACH_MS = 520` 内把镜头插值到检查机位 | `Renderer.ts::approachProbe` |
| 主动旋转观察 | 相机绕机体转（`probeCamera.ts`，与 `applyProbeInspectionCamera` 同轴序），不是机体自转 —— 只有这样平移与缩放才在同一套约定里 | 同上 |
| 扫描 | `PROBE_SCAN_MS = 900`，扫描时整机泛琥珀底光；Reduced Motion 直接完成 | 同上 |
| 点击命中 | `scene.pick` → `probe-part:<part>` → 高亮 + `onProbePartChange`，画面与面板部件列表说同一件事 | `Renderer.ts::onDoubleClick` |
| 关闭/返回 | Escape 归对话框所有；退出后镜头回到那颗恒星 | 新增 |
| 生命周期 | 批次网格、材质、灯、检查体全部在 `dispose()` 里回收；重复进出资源不增长 | e2e 断言 |

三处必须解释的取舍：

1. **灯**：`gl/probe.ts` 自带 `HemisphereLight(0xb9d4ff, 0x101522, 1.25)` + `DirectionalLight(0xffd7a0, 2.1)`。
   没有这两盏，深空里恒星是唯一光源，检查视角下机体几乎总是背光 —— 实拍就是一块黑剪影。
   Babylon 里额外用 `includedOnlyMeshes` 把它们限制在探测器网格上，因为这个渲染器的行星也跑
   `StandardMaterial`，全局加两盏灯会把整个恒星系照成白天。
2. **着色模型**：旧版用 `MeshStandardMaterial`。直接搬 `PBRMetallicRoughnessMaterial` 会让 babylon
   chunk 从 1.77 MB 涨到 2.25 MB，越过 `verify-build-boundaries` 的 1.8 MB 上限。改为把 Three 的
   metalness/roughness 折算成 Blinn-Phong（暗漫反射 + 窄而强的高光），**材质区分一件不少**：
   船体/面板/琥珀信号灯/金属/镜片/灯带/双面蚀刻。原始 metalness/roughness 仍是 `gl/probe.ts` 的原值。
3. **被检查的那一艘恒为近景**：旧版 `updateNear` 里 `inspectedCandidate` 直接 `lod = 'near'`，
   不过 LOD 阶梯。照搬。阶梯状态照常记录，于是关闭检查后它回到该在的那一档。

## 2. 尺度：两处「抄错了」的常数

| 量 | Three | 迁移后 | 现在 |
|---|---|---|---|
| 行星世界半径 | `0.085 + 0.115·answerDensity`（0.085–0.20） | `descriptor.radius × 0.38`（0.209–0.38） | **共用 `planetWorldRadius()`** |
| 行星相位 | `(idx · 137.508 + seed · 31.7)·π/180`，**idx 从 0 起** | 用了 1 起的 `orbitIndex` | **共用 `orbitPhase()`** |
| 轨道倾角 | 每条轨道 `tilt × 0.22` | 整个丢了（所有轨道共面） | **共用 `orbitPlane()`** |
| 聚焦辉光投影上限 | `uMaxPx = 520`（辉光）/ 360（星芒）/ 90（硬核） | 无上限 | **`cappedCoronaScale()`** |

行星半径大了 1.9–2.5 倍，是「近景主体尺寸对不上」的直接原因；相位差 137.5°，是「恒星跑到画面
另一侧」的直接原因。两处都不是风格差异，是同一颗行星被画成了两个尺寸、摆在了两个位置。

投影公式的校准：把 Three 的 planet-focus 参数（r = 0.1734、d = 2.8、H = 720）代进
`tan(asin(r/d))·H/tan(fov/2)` 得 **77.2 px**，与 `three-parity-v1` 实拍主体宽度 **77 px** 吻合。
这条式子因此可以当门禁用（见 §4）。

修好之后，批次 4 放弃过的**旧版开场机位**（yaw 0.5 / pitch −0.2 → alpha 1.071 / beta 1.371）可以采用了：
当时「恒星挤到相机与行星之间」是上面两个 bug 的症状，不是机位的问题。

## 3. 答案地层：实拍审计发现它是一片黑

批次 4 报告写着「答案纪年是一个真实的三维洞窟」，功能测试也全绿。**实拍不是这样**：

```
修复前 12 带亮度剖面（深度 3.5 m）：0.0529 0.0536 0.0544 0.0554 0.0564 0.0575 0.0588 0.0602 0.0616
```

单调、落差 0.0087、零次穿越 —— 一整块 0.055 亮度的褐色。功能测试之所以全绿，是因为它们量的是
「标本包围盒投影得出来吗」「点得中吗」「HUD 写了多少米」，没有一条量画面。

根因有三层：

1. 所有层用同一个 `emissive = base × 0.36`，相邻层对比度恒为 1；
2. 点光 `intensity 0.72 / range 9`，而竖井半径 4.8、灯放在 ±2.4 —— 对面岩壁几乎收不到光；
3. **层厚是 4–18 个世界单位，竖井半径只有 4.8**：在 60° 视场下一屏纵向只有 5.5 个单位，
   横着看永远只看得到一层。层与层的分界根本不进画面。

对应三处修复（`strataPalette.ts` / `strataLaminations.ts`，各自带单测）：

- 相邻层交替明暗（0.62 / 0.30 增益），任意两层的自发光亮度比 > 1.6；
- 层界加厚 0.10 → 0.26，自发光提到比层面亮一倍以上 —— 它是年代刻度本身；
- **层内部的纹层**写进顶点色：按局部 Y 采样一条三频叠加的沉积剖面，
  用顶点色而不是纹理，既不增加 draw call，也不会在掠射角上被各向异性过滤糊平。

```
修复后 9 带亮度剖面：0.1291 0.1164 0.1359 0.1186 0.1381 0.1310 0.1381 0.1403 0.1476
```

峰值 0.062 → 0.148，穿越 0 → 3 次。新增 e2e 门禁 `the answer strata is a lit, layered world
rather than a black void` 同时盯住「亮」和「分层」，把修复前的实测值写进注释当反例。

## 4. 被复核的两处门禁阈值

### `thermal planets` 的 `bodyDiameter`

批次 4 把它从 180 px 降到 45 px，我在报告里标了「请复核」。复核结论：**45 这个数本身也是编码了
一次取景，只是编码得比 180 松**。现在改成由投影数学算出预期值，逐例比较：

| 用例 | 轨道半径 | 相机距离 | 预期直径 | 允许区间 |
|---|---:|---:|---:|---|
| magma (orbit 1) | 2.10 | 2.80 | 47.3 px | 40.2 – 66.3 |
| desert (orbit 2) | 3.25 | 2.80 | 47.3 px | 40.2 – 66.3 |
| rock (orbit 3) | 4.40 | 3.52 | 37.7 px | 32.0 – 52.7 |
| tundra (orbit 4) | 5.55 | 4.44 | 29.8 px | 25.4 – 41.8 |
| ice (orbit 8) | 10.15 | 6.00 | 22.1 px | 18.8 – 30.9 |

上界留到 1.4 倍，是因为 `bodyDiameter` 量的是含大气壳（半径 ×1.095 起）的包围盒。
这比任何固定像素地板都**严**：行星半径改大改小、取景回归，都会立刻被抓住。

### `planetLod` 的阈值

批次 4 取消了 `MEDIUM_TO_HIGH`，改成「被选中即最细」。复核发现更根本的问题：迁移版整条阶梯
用的是**占屏比例**，而 Three 用的是**投影半径像素**——同一颗行星在 720p 和 1440p 上会落到不同的档。

现在未聚焦行星走 `gl/planetMaterials.ts` 逐字的像素阶梯（≥18 升 medium、<12 退 far、≥84 升 near、
≤72 退 medium），并有一条单测把两套实现在 12 个采样点上逐档对齐。

「被选中即最细」保留，并写明**它是一处记录在案的偏差**：Three 的 near 档要 84 px 投影半径，
而按旧版取景聚焦行星只有 20–39 px，旧版是在阅读工作台把镜头拉到 `PLANET_NEAR = 1.2` 时才跨线的。
这里提前一档 —— 近景里主体只有一个，它就是画面本身。这不是放宽阈值，未聚焦行星一格没让。

## 5. 实测指标

跨引擎（1280×720，`three-parity-v1` 为基准）：

| 状态 | 指标 | Three | Babylon | 判定 |
|---|---|---:|---:|---|
| panorama | coverage | 0.0862 | 0.0859 | ✅ |
| panorama | faint / glow / bright / highlight | 0.0574 / 0.0227 / 0.0044 / 0.0016 | 0.0755 / 0.0060 / 0.0033 / 0.0011 | ✅ 全部进容差 |
| focused-star | coverage | 0.1793 | 0.1498 | ✅ |
| focused-star | faint / glow / bright / highlight | 0.1271 / 0.0365 / 0.0073 / 0.0084 | 0.1089 / 0.0240 / 0.0083 / 0.0086 | ✅ |
| planet-focus | coverage | 0.2984 | 0.2543 | ❌ 偏差 0.0441 |
| planet-focus | faint / glow / bright / highlight | 0.1748 / 0.0341 / 0.0390 / 0.0504 | 0.1637 / 0.0226 / 0.0193 / 0.0486 | ✅ |

相机距离 97.20 / 16.00 / 2.80（Three 97.24 / 16.00 / 2.80）。mesh 34 / 40 / 42，texture 恒为 3。

Metal 单帧真实渲染开销（500 星稠密 fixture）：

| 档 | p95 调度间隔 | 单帧 last / max | 绝对预算 |
|---|---:|---:|---:|
| medium | 42.5 ms | 0.80 / **6.90 ms** | 20 ms |
| low | 42.8 ms | 1.30 / **7.90 ms** | 33.3 ms |

`clippedWhite` 各状态 ≤ 0.0172，无过曝。babylon chunk 1.78 MB（上限 1.8 MB）。

## 6. 验证

| 检查 | 结果 |
|---|---|
| `npx oxlint src e2e scripts` | 通过 |
| `npx tsc -b` / `tsc -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | **83 files / 867 tests** 通过（批次 4 后是 75 / 811） |
| `playwright --project=swiftshader-functional` | **21/21** 通过（新增探测器航程、地层可见性两条） |
| `playwright --project=metal-performance` | **6/6** 通过（含重新推导的 thermal 门禁） |
| `playwright --project=visual-parity` | 3 通过 / 1 跳过（模式栏门禁依赖 Babylon 的帧计数器，Three 构建下无从执行） |
| `npm run compare:visual-parity` | **红（预期）**，9 项 |

## 7. 「旧版可恢复项清零」清单

分两类：**程序化噪声不可能逐像素相同**（合上，不再追）与**真正缺失**（必须归零）。

### 7.1 真正缺失项 — 全部归零

| # | 缺失项 | 批次 | 现状 | 证据 |
|---|---|---|---|---|
| 1 | 视觉门禁只比冻结 JSON 标量，不比 PNG | 0 | ✅ | `frameParity.mjs` 22 条单测；三状态真实像素门禁 |
| 2 | 恒星 HDR 峰值与 bloom 阈值错位 | 1 | ✅ | `stellarRadiance.ts` CPU 镜像 + 单测 |
| 3 | high 全景直接关 Bloom；无抗锯齿；DPR 统一砍到 1.25 | 1 | ✅ | `cinematic.ts` 三档参数 + `babylonBloomPolicy` 恒 enabled |
| 4 | 聚焦时非聚焦星全部熄灭 | 1 | ✅ | 共享 `NON_FOCUSED_OPACITY = 0.12` |
| 5 | 三层星云壳 + 星系核心 | 2 | ✅ | `nebulaLayer.ts`，一次烘焙立方体贴图 |
| 6 | 星际尘埃（每条内容一粒）与边缘微光 | 2 | ✅ | `dustLayer.ts` 两批点云 |
| 7 | 恒星 core/halo/flare 的 LOD 与有阈值的衍射星芒 | 2 | ✅ | `STAR_FLARE_THRESHOLD` + 单测 |
| 8 | 模式栏六个按钮只是统一调暗 | 3 | ✅ | `modeSemantics.ts`；e2e 断言六帧两两不同（sha256） |
| 9 | 星群轨道环/结构环、虫洞、暗物质叠层、标签 | 3 | ✅ | `clusterRingLayer` / `overlayLayer` / `labelLayer` |
| 10 | 取景全部改成「按包围盒推」，恒星成整屏背景墙 | 4 | ✅ | `framing.ts`；相机距离逐位对齐 |
| 11 | 点击/飞行/退出/滚轮/拖拽/无障碍 | 4 | ✅ | functional 21/21 |
| 12 | **探测器整体不支持** | 5 | ✅ | 本文 §1；e2e 航程门禁 |
| 13 | **行星世界半径大 1.9–2.5 倍** | 5 | ✅ | 共享 `planetWorldRadius()`；`PlanetVisual` 单测 |
| 14 | **行星轨道相位差 137.5°（编号 0 起 vs 1 起）** | 5 | ✅ | 共享 `orbitPhase()`；planet-focus 质心 y 0.2779 → 0.2614 |
| 15 | **轨道倾角整个丢失（所有轨道共面）** | 5 | ✅ | 共享 `orbitPlane()` + 单测 |
| 16 | **聚焦辉光没有投影上限** | 5 | ✅ | `cappedCoronaScale()` 移植 `uMaxPx = 520` |
| 17 | **答案地层是一片黑，没有纵向年代层** | 5 | ✅ | 本文 §3；新增可见性门禁 |
| 18 | **`planetLod` 用占屏比例而非投影像素** | 5 | ✅ | 与 `gl/planetMaterials` 逐档对齐的单测 |
| 19 | **thermal 门禁是一个固定像素地板** | 5 | ✅ | 改为投影数学预测值 ±(0.85–1.4) |

### 7.2 程序化噪声：不可能逐像素相同，合上

| 越界 | 说明 |
|---|---|
| 三个状态的 `structure:tileMax` / `tileRms` | 两套独立烘焙的噪声场，云团落点必然不同。门禁指标的固有下限 |
| panorama `subject:centroid` (0.079) / `subject:radius` (0.301) | 同上：Three 的星云图案落在画面另一侧，质量分布因此不同 |

### 7.3 已定位、有实测、但本批**未落地**的一项

**Babylon 场景是左手坐标系，而所有共享几何（`starData`、轨道向量、星群轴）都是按 Three 的
右手系写的 —— 整个宇宙左右镜像。**

这是 `planet-focus subject:centroid` (0.181) 与 `coverage` (0.044) 剩下的那部分的成因。实测：

| | 当前 | 加 `scene.useRightHandedSystem = true` |
|---|---:|---:|
| 越界总数 | 9 | **7** |
| planet-focus `centroid` | 0.181 | ✅ 进容差 |
| planet-focus `coverage` | 0.044 | ✅ 进容差 |
| planet-focus `structure:tileMax` | 0.928 | 0.294 |
| planet-focus `structure:tileRms` | 0.277 | 0.047 |
| focused-star `coverage` | ✅ | ✅ |

**没有落地的原因**：翻转之后 `swiftshader-functional` 的
`Babylon vertical slice renders, orbits, crosses the surface and preserves cave camera pose`
会**间歇性**失败 —— 洞窟里点答案标本时 `scene.pick` 有时打空（`lastPick` 停在 `star`）。
三次复跑一次通过两次失败；等相机停稳再点也没有消除。翻转手性会同时改变每一层的绕序、
背面剔除与遮挡关系（星云壳是 `BACKSIDE`、洞窟是从内部看、公告板另有一套约定），逐层复核
不是收尾批次该做的事，而**为了一项像素指标去换一个会间歇性失效的用户交互，方向是反的**。

给下一批的完整交接：改动就是 `BabylonRenderer` 建场景处的一行
`scene.useRightHandedSystem = true`；需要连带复核 `nebulaLayer` 的 `sideOrientation`、
洞窟内表面的 `backFaceCulling`、`Mesh.BILLBOARDMODE_ALL` 的朝向，以及 `scene.pick` 打空的真因。

## 8. 仍红的 9 项及其理由

| 状态 | 越界 | 归类 | 理由 |
|---|---|---|---|
| panorama | `structure:tileMax` 0.248 | 程序化噪声 | §7.2 |
| panorama | `structure:tileRms` 0.033 | 程序化噪声 | §7.2 |
| panorama | `subject:centroid` 0.079 | 程序化噪声 | §7.2 |
| panorama | `subject:radius` 0.301 | 程序化噪声 | §7.2 |
| focused-star | `structure:tileMax` 0.087 | 程序化噪声 | §7.2 |
| planet-focus | `structure:tileMax` 0.928 | 手性镜像 | §7.3，实测翻转后 0.294 |
| planet-focus | `structure:tileRms` 0.277 | 手性镜像 | §7.3，实测翻转后 0.047 |
| planet-focus | `subject:centroid` 0.181 | 手性镜像 | §7.3，实测翻转后进容差 |
| planet-focus | `coverage` 0.044 | 手性镜像 | §7.3，实测翻转后进容差 |

没有一项是靠放宽容差消掉的：本批**收紧**了 thermal `bodyDiameter`（固定地板 → 投影预测值
±0.85–1.4），并给答案地层新加了一条此前不存在的可见性门禁。
