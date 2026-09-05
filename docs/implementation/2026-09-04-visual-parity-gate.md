# 跨渲染器视觉追平门禁（批次 0）

- 日期：2026-09-04（Asia/Shanghai）
- 分支：`feature/babylon-migration`
- 范围：**只修门禁与测试基础设施**，不改动任何生产视觉代码
- 决策：**门禁建成并判定 Babylon 未追平 Three** —— 这是预期结果，不是回归

## 1. 修复前的洞

| 洞 | 表现 |
|---|---|
| `compare:render-baselines` 不看像素 | 只读仓库里两个 2026-09-02 冻结的 JSON，比 4 个标量。0 秒通过，代码怎么改都绿 |
| 只比中心、不比尺寸 | 主对象宽度 77px → 222px（2.87 倍）不被检查 |
| `nonBackgroundRatio` 容差 0.2 | 非背景像素可以掉到近乎全黑仍然过关 |
| 只覆盖一个状态 | 只有 planet-focus，没有 panorama / focused-star |
| `metal-performance` 缺基线 | `babylon-stellar-v1.json` 从未提交，四状态门禁必然红 |
| `scripts/compare-render-baselines.test.mjs` 从不执行 | 用 `node:test` 写成，又被 `vitest.config.ts` 排除，且没有任何 npm script 运行它 —— 308 行断言是死代码 |
| `MINDVERSE_PLANET_BASELINE_OUT` 拒绝非 candidate 文件名 | `compare:planet-baselines` 读的 `babylon-planets-v1.json` 无法经由受支持的采集路径产出 |
| `settleFrame` 只等两帧 rAF | Babylon 运行时空闲节流到 30fps，两帧 rAF 不保证发生一次 `scene.render()`；诊断投影读到的是上一帧的视图矩阵 |

## 2. 修复后的门禁

### 2.1 逐像素描述子（`scripts/frameParity.mjs`）

对每帧算一组**低频**统计量，对 GPU 抖动免疫、对构图变化敏感：

| 指标 | 含义 | 默认容差 |
|---|---|---|
| `structure:tileMax` / `structure:tileRms` | 16×9 亮度网格逐格漂移，每格平均约 6400 像素 | 0.055 / 0.022 |
| `toneBand:faint` | 亮度 [0.047, 0.18) 的像素占比 —— 星云、尘埃、轨道环住在这里 | 0.03 |
| `toneBand:glow` | [0.18, 0.55) —— 热核周围的 bloom 裙边 | 0.03 |
| `toneBand:bright` / `toneBand:highlight` | [0.55, 0.85) / ≥0.85 —— HDR 星核 | 0.03 |
| `coverage` | 非背景像素占比（保留旧口径） | 0.03 |
| `subject:radius` / `subject:centroid` | 亮度加权主体的尺度与位置 | 相对 22% / 对角线 3.5% |
| `chroma` | 网格均值上的饱和度，检测整体偏色 | 0.05 |

**为什么不脆**：噪声在每格 6400 像素的平均里衰减到 1e-4 量级，色度只在网格均值上算。单元测试 `frameParity.test.mjs` 里有一条专门的用例：给每个通道加 ±3/255 的确定性噪声，门禁必须仍判定追平。

**为什么不只靠 `nonBackgroundRatio`**：另有一条用例把主体平移到画面另一侧 —— 直方图逐位相同、`coverage` 差 < 0.005，门禁仍须判定未追平（由结构网格与主体质心捕获）。

### 2.2 PNG 真的被解码（`scripts/framePixels.mjs`）

零依赖的 8 位非隔行 PNG 解码器，覆盖 5 种扫描线滤波、RGB→RGBA 扩展、多段 IDAT 拼接；遇到隔行 / 调色板 / 16 位 / 截断数据一律显式报错，绝不返回"看起来合理"的垃圾。

### 2.3 三状态跨引擎捕获（`e2e/visual-parity.spec.ts`）

新增 Playwright project `visual-parity`，与渲染器无关：强制 reduced motion（Three 把动画时钟钉在 0，Babylon 停止推进 `elapsedMs`，两边都静止），然后像访客一样操作 —— 在画布上点第一颗恒星，再打开问题行星 —— 依次采集：

1. `panorama`
2. `focused-star`
3. `planet-focus`

每个状态在采集前都等相机停止缓动（`cameraDistance` 连续两次采样稳定）。

### 2.4 命令

```bash
npm run capture:parity-reference   # 构建 Three → 写 three-parity-v1.{json,-<state>.png}
npm run capture:parity-candidate   # 构建 Babylon → 写 babylon-parity-candidate.*
npm run compare:visual-parity      # 解码 6 张 PNG，逐状态判定
npm run verify:visual-parity       # = candidate + compare
```

`compare:render-baselines`（单状态 legacy 对）也已修好：它现在解码 `three-question-7.png` / `babylon-question-7.png`，并额外闸住主体尺寸（±25%）与非背景像素占比（绝对 0.05 且不低于基线 75%）。

### 2.5 其余基础设施修复

- **`babylon-stellar-v1.json` 已采集**（含四张状态 PNG），`render-baseline.spec.ts` 的四状态门禁由红转绿；`npm run compare:stellar-baselines` 的同引擎漂移比对也已实测跑通。
- **`settleFrame` 改为等待真实渲染**：Babylon 运行时空闲节流到 30fps，原来的"两帧 rAF"不保证发生一次 `scene.render()`，诊断读到的是上一帧的视图矩阵。改成等 `resources.actualRenderCount` 前进 2 之后，`five deterministic thermal planets` 的 `lightDirectionFlip` 断言（此前实测 `+1.0`，期望 `< -0.5`）恢复正常并通过。**这是测试基础设施的时序缺陷，不是生产渲染缺陷。**
- **`resolvePlanetBaselineOutput` 抽出并放宽**：允许 `babylon-planets-v1.json` 这样的版本化基线名，`compare:planet-baselines` 从此可以拥有它引用的基线（采集命令：`MINDVERSE_PLANET_BASELINE_OUT=testdata/render-baselines/babylon-planets-v1.json npm run test:e2e:performance -- --grep 'thermal planets'`）。本批次未替用户采集，以免碰到工作树里已有的 `babylon-planets-candidate*`。
- **复活死测试**：`scripts/compare-render-baselines.test.mjs` 改用 vitest 运行并从 `vitest.config.ts` 的 exclude 中移除，308 行断言开始真正执行。

## 3. 当前判定

`npm run compare:visual-parity`（同机 Metal，1280×720 DPR 1，commit `dfd1213`）：

```
visual parity: babylon has not caught up with three in panorama, focused-star, planet-focus
  panorama:
    - structure:tileMax   0.3647 → 0.0103   (漂移 0.3545)
    - subject:centroid    [0.418,0.522] → [0.291,0.559]
    - structure:tileRms   0.0478
    - coverage            0.0862 → 0.0260
    - subject:radius      0.4152 → 0.5844
    - toneBand:faint      0.0575 → 0.0165
  focused-star:
    - structure:tileMax   0.2261 → 0.4340
    - structure:tileRms   0.0374
  planet-focus:
    - structure:tileMax   0.8879 → 0.1318   (漂移 0.7561)
    - structure:tileRms   0.2494
    - subject:centroid    [0.401,0.278] → [0.491,0.568]
    - coverage            0.2984 → 0.5584
    - toneBand:faint      0.1748 → 0.3531
    - toneBand:glow       0.0342 → 0.1337
    - toneBand:highlight  0.0504 → 0.0020
    - chroma              0.0519 → 0.1030
    - toneBand:bright     0.0390 → 0.0696
```

读法：

- `panorama` 的 `toneBand:faint` 掉 3.5 倍、`coverage` 掉 3.3 倍 —— 星云与尘埃层整体缺失。
- `planet-focus` 的 `toneBand:highlight` 从 5.04% 掉到 0.20%（25 倍） —— 恒星 HDR 核与 bloom 没有了；同时 `bright` 与 `glow` 反而变多，说明画面被一大片中等亮度的灰面占据。
- `planet-focus` 的 `coverage` 从 0.30 涨到 0.56、质心位移 0.30 —— 取景从"星系构图"变成"标本特写"。

这些正是审计报告 §3 用肉眼得出的结论，现在由门禁自动量化。

## 4. 已知限制与遗留

- **`babylon-stellar-v1.json` 以"相对基线"身份采集**：本机 Metal 上 500 星密集全景实测 p95 **medium 42.1 ms / low 41.9 ms**，两档都超过 `MINDVERSE_REFERENCE_DEVICE=1` 的绝对预算（20 ms / 33.3 ms），因此无法在本批次产出带绝对预算背书的参考基线。**这是本批次顺带暴露的生产性能问题，不属于门禁缺陷，也不在本批次的修改范围内。**基线文件里 `referenceDevice.enforceAbsoluteBudgets` 如实记为 `false`，`assertRelativePerformance` 的 20% 相对预算照常生效。绝对预算需要等生产性能批次（审计批次 1）之后再用 `npm run capture:stellar-baseline` 重采。
- `subject:radius` 在整页合成截图上不敏感（右侧面板占据大量亮度权重）。planet-focus 的尺寸变化主要由 `coverage` 与 `structure` 捕获，`subject:radius` 只在 panorama 触发。
- 本门禁比较的是**整页合成帧**（画布尺寸 = 视口，Playwright 元素截图包含叠加的 React UI）。两个渲染器共用同一套 UI，因此相同区域贡献零偏差；这既锚定了比较，也让门禁能看见构图。
- 尚未接入 CI（仓库无 `.github/`）。四条命令都可在本地按顺序执行。

## 5. 本批次验证

| 检查 | 结果 |
|---|---|
| `npx oxlint` | 通过 |
| `npx tsc --noEmit -p tsconfig.e2e.json` | 通过 |
| `npx vitest run` | 通过：**64 files / 704 tests**（此前 61 / 660） |
| `npx tsc -b` | 通过 |
| `playwright --project=visual-parity`（Three & Babylon） | 各 2/2 通过 |
| `playwright --project=metal-performance --grep "thermal planets"` | **由红转绿** —— `settleFrame` 改为等待真实渲染后，`lightDirectionFlip` 断言恢复正常 |
| `playwright --project=metal-performance --grep "four deterministic stellar states"` | **由红转绿** —— 基线补齐后无需任何环境变量即可通过 |
| `playwright --project=swiftshader-functional` | 19/19 通过 |
| `npm run compare:stellar-baselines`（同引擎漂移） | 通过 |
| `npm run compare:visual-parity` | **红（预期）** —— 三个状态全部未追平 |
| `npm run compare:render-baselines` | **红（预期）** —— 主体尺寸漂移 187% |
