# 模式栏语义与叠层恢复（批次 3）

- 日期：2026-09-04（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0 / 1 / 2 的未提交状态上继续）
- 范围：**恢复旧 Three.js 已有的模式语义与叠层，不做提升项**
- 结果：六个模式按钮各自强调正确的数据层，六张画面互不相同

## 1. 恢复了什么

### 1.1 模式语义的单一真相源（`src/starmap/modeSemantics.ts`）

迁移之后模式栏只剩「整屏变暗」：六个按钮里五个不产生任何新元素，
因为它们要强调的图层在 Babylon 侧根本不存在。这张表把「每个模式强调哪一层」
写成一处，并让**「没有一个模式是只调暗」成为可断言的事实**：

| 模式 | 强调的数据层 | 其余层 |
|---|---|---|
| `all` 全景 | 星群结构环 1.0、尘埃 1.0、边缘微光 0.34 | 0.14 |
| `worm` 虫洞 | **虫洞粒子流 1.0**、两端星群的环 1.0、尘埃 0.9 | 0.14 / 非两端星群 0.14 |
| `dark` 熄灭的星 | **暗物质引力透镜 1.0** | 0.14 |
| `nebula` 星云 | 爆发型恒星 1.0 | 0.14 |
| `solo` 边缘微光 | **边缘微光粒子 1.0** | 0.14 |
| `me` 好奇心结构 | 本人创作过的恒星 1.0 | 0.14 |

非强调层一律退到 0.14 底噪而不是隐藏 —— 语义是「退让」，不是「不存在」。
虫洞流是唯一真正模态的图层（其他模式下为 0）。

### 1.2 星群结构环（`babylon/clusterRingLayer.ts`）

与 `gl/rings.ts` 同构：环画在成员恒星**真实的公转半径**上（`ringRadiiForCluster`
取整并丢弃 1.5 以内的），透视由 3D 投影自己给出，全部星群合成**一个 line batch**。
此前 Babylon 只有一个占位实现：每个星群一条环、alpha 0.035/0.012，肉眼不可见 ——
现在按 Three 的 `uGain = 0.24` 与 `ownerOpacity` 聚焦衰减渲染，占位实现已删除。

### 1.3 虫洞与暗物质（`babylon/overlayLayer.ts`）

与 `gl/overlay3d.ts` 同构，两个 batch：

- **虫洞**：沿二次贝塞尔曲线流动的粒子流，三道脉冲、尾长头紧。虫洞的语义是
  「你反复地从这个星群跨到那个星群」，流动本身就是那个语义，虚线不是。
- **暗物质**：朝相机的面片上画爱因斯坦环 —— 中心什么都没有，只有引力透镜把
  背景掰弯，这是这个概念唯一诚实的画法。常驻场景，只有进 `dark` 模式才从
  0.14 升到 1.0。

### 1.4 标签（`labelPainter.ts` + `babylon/labelLayer.ts`）

`labelCanvas` 此前只 resize、从不绘制。现在把排版与去重叠抽成与渲染器无关的
`labelPainter`（Three 侧的 `gl/labels.ts` 保留自己的投影），Babylon 侧补上
投影适配。深色描边 + 亮色填充、按框去重叠、星群名规模优先、聚焦后才出恒星名 ——
全部沿用 `labelVisibility.ts` 既有策略。

### 1.5 画质分档只降规格

| 档位 | 星云烘焙 | 虫洞采样密度 | 尘埃密度 | 结构环 | 暗物质 |
|---|---:|---:|---:|---:|---:|
| high | 256 | 1.00 | 1.00 | 全部 | 全部 |
| medium | 192 | 0.70 | 0.75 | 全部 | 全部 |
| low | 128 | 0.45 | 0.50 | 全部 | 全部 |

单测锁住：三档的壳数、环数、透镜数、batch 数都不变，只有分辨率/密度下降。

## 2. 各模式的可见差异（实测）

新增 `e2e/mode-bar.spec.ts` 与 `strata-universe.modes.v1` fixture —— 基础 fixture
只有一颗星、虫洞/暗物质/星云/孤立概念全是空列表，**分辨不出模式栏是好的还是坏的**。
新 fixture 给六个按钮各填上该强调的数据，然后逐个点过去量画面：

| 模式 | 非背景像素占比 | 画面上出现了什么 |
|---|---:|---|
| `all` 全景 | 0.3936 | 星云 + 尘埃 + 两个星群的结构环 + 4 颗恒星 + 星群名 |
| `worm` 虫洞 | 0.2316 | **琥珀色粒子流沿弧线连接两个星群**，非两端星群退让 |
| `dark` 熄灭的星 | 0.3928 | **爱因斯坦环透镜点亮**，InfoPanel 同步显示「你放下的那些 · Gamma · 已停 540 个月」 |
| `nebula` 星云 | 0.2254 | 爆发型恒星 Beta 保持全亮，其余退到 0.1 |
| `solo` 边缘微光 | 0.2254 | **两粒孤立概念微光升到 1.0**，全部恒星退到 0.12 |
| `me` 好奇心结构 | 0.2254 | 本人创作过的恒星保持全亮 |

门禁断言三条：每个模式必须渲染出东西（> 0.001）、至少三个模式的覆盖率可测量地
不同、**六张截图两两 sha256 不相同**。最后一条是关键 —— 覆盖率分辨不出两个
「筛恒星」模式，帧摘要可以。

## 3. draw call / 纹理 / 真实帧耗 / 资源释放

新增 draw call：结构环 **1**、虫洞 **1**、暗物质 **1**（标签走 Canvas 2D，不占 GL draw call）。
累计到批次 3，Babylon 的常驻批次是：星云 4（3 壳 + 核心）、尘埃 2、结构环 1、
叠层 2、恒星点云 3 + 聚焦球/日冕 2，行星按需。

场景清单（parity 文档实测，1280×720）：

| 状态 | Babylon meshes | Babylon textures | Three meshes | Three textures |
|---|---:|---:|---:|---:|
| panorama | 10 | 3 | 17 | 13 |
| focused-star | 16 | 3 | 17 | 13 |
| planet-focus | 18 | 3 | 17 | 13 |

mesh 数随聚焦 10 → 18，**懒加载未回退**；纹理恒为 3（三张一次性烘焙的立方体贴图）。

真实单帧渲染开销（500 星密集全景，1440×900）：

| 指标 | 批次 2 | 批次 3 |
|---|---:|---:|
| medium last / max | 0.4 / 6.0 ms | 0.3 / **8.3 ms** |
| low last / max | 0.4 / 6.9 ms | 0.3 / **10.3 ms** |
| medium p95 调度间隔 | 42.2 ms | 42.3 ms |
| low p95 调度间隔 | 42.4 ms | 42.4 ms |

稳态开销仍是 0.3 ms；`max` 是 13 秒窗口里最差的一帧，涨到 8–10 ms 主要来自
一次性的星云烘焙落在窗口内。两者都远在 30fps 节流目标（33 ms）之内。

资源释放：三个新层都实现 `dispose()` 并接进 `BabylonRenderer.destroy()`；
单测断言 dispose 后 `scene.meshes / materials` 归零且二次 dispose 不抛。
`swiftshader-functional` 的「五次完整挂载释放 canvas / context / listener / RAF」
用例仍然通过，单 Engine / 单 context 未变。

## 4. 过程中由门禁抓到的两个真问题

1. **虫洞粒子无上限**：`gl_PointSize = (1.6 + 4.6·pulse)·projScale/viewZ·0.55` 逐字
   照搬自 Three，但 Three 的全景相机停在 `sceneRadius × 1.62`，而这个渲染器的
   全景取景近得多 —— 同一条公式在实拍里涨到几百像素，整屏糊成一团琥珀。
   按 `gl/dust.ts` 给尘埃封顶的同一理由封到 10 px，并补了 CPU 镜像单测。
2. **星云烘焙撑爆软件光栅器**：512 边长时三层壳 × 六个面 = 470 万像素的域扭曲
   fbm 全落在最初几帧，SwiftShader 卡住数秒，而相机飞行是按墙钟推进的，于是
   `Reduced Motion` 用例的 `approachProgress` 只走到 0.755 就超时。加了一条
   「首帧烘焙像素预算 ≤ 120 万」的单测，把三档降到 256/192/128（星云是低频背景，
   肉眼无差），functional 恢复 19/19。

## 5. 验证

| 检查 | 结果 |
|---|---|
| `npx oxlint` | 通过 |
| `npx tsc -b` / `tsc -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | **74 files / 785 tests** 通过（批次 2 后是 69 / 745，本批 +5 文件 +40 例） |
| `playwright --project=visual-parity --grep mode`（模式栏门禁） | 2/2 通过 |
| `playwright --project=visual-parity`（parity 抓拍） | 通过 |
| `playwright --project=metal-performance --grep "four deterministic stellar states"` | 通过 |
| `playwright --project=metal-performance --grep "thermal planets"` | 通过 |
| `playwright --project=swiftshader-functional` | **19/19** 通过 |
| `npm run compare:visual-parity` | **红（预期）** |

## 6. 剩余差异

跨引擎偏差项 **12**（与批次 2 持平；strata parity fixture 里没有虫洞/暗物质/
孤立概念，本批恢复的三层在那张图上无从体现，只有结构环让 panorama 的
`structure:tileMax` 偏差从 0.2765 降到 0.2534）。

| 越界 | 归属 |
|---|---|
| 三个状态的 `structure:tileMax` / `tileRms` | 两套独立烘焙的噪声场云团落点必然不同，门禁指标的固有下限 |
| panorama `subject:centroid` / `subject:radius` | 同上 |
| planet-focus `centroid` | 取景仍由行星半径导出（批次 4） |
| focused-star `structure` | 恒星比 Three 大一圈，同属取景 |
| 暗物质透镜在小 fixture 上偏大 | 透镜半径按 `34 + f×2.2` 世界单位取自 Three，语义是「多少内容熄灭了」，不能锚到相机；真实宇宙里 `sceneRadius ≥ 60` 时比例正常，取景修好后自然收敛 |
| 探测器 | 批次 5 |
