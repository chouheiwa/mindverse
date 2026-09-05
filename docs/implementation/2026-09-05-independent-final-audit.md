# 独立最终审计（批次 7）

- 日期：2026-09-05（Asia/Shanghai）
- 分支：`feature/babylon-migration`（在批次 0–6 的未提交状态上审计）
- 审计者：**不是**批次 6 的实现会话。从需求、旧 Three 实现、批次 5/6 报告、
  当前 git diff 与真实页面截图独立复核，不预设前一份报告为真。
- 结论：**blocker = 0**，可交付。发现并修复 **4 个真实缺陷** 与 1 处未定义行为；
  批次 6 报告中「红但与本批无关」的 `compare:stellar-baselines` 经独立取证确认
  是**陈旧基线**，已按要求新建带版本与依据的 v2 基线，现为**绿**。
- **本报告有一处补正**：初版遗漏了 `compare:visual-parity` 这条跨引擎恢复门禁，
  并因此多报了两处同源缺陷。见 [§13 补正](#13-补正提交前的复核)。

---

## 1. 结论先行

| | 结果 |
|---|---|
| **Blocker** | **0** |
| 修复的真实缺陷 | 4（冰行星极冠翻转、性能绝对预算量错对象、相对回归门禁量错对象 ×2；后两项见 §13） |
| 修复的未定义行为 | 1（星芒公告板中心 `atan(0,0)`） |
| 独立推翻的前报告结论 | 1（`compare:stellar-baselines` 的红不止一项，且可以且应当收敛） |
| 新建基线 | `babylon-stellar-v2.json`（Three 参考 `three-parity-v1.json` **未动**） |
| 门禁放宽 | **0 条** |
| 提交 | **无**（工作区保持未提交） |

「先完整恢复、再明显提升」**真实成立**：实拍逐项复核通过，恢复门禁一条未放宽，
提升项在三档画质上一个类别未删。

---

## 2. 修复一：冰行星的极冠整个翻转（**Blocker**）

### 2.1 缺陷

`planet.fragment.fx` 批次 6 新增的雪线掩膜：

```glsl
float snowBand  = clamp(uSnowLine - max(vHeight, 0.0) * 0.55, 0.05, 0.99);
float polarMask = smoothstep(mix(snowBand, 0.42, uThermalIce),
                             min(0.995, snowBand + 0.22), latitude);
```

两个边是**各自独立**算出来的。GLSL 规定 `smoothstep` 在 `edge0 >= edge1` 时
**未定义**；主流驱动实现成 `clamp((x-e0)/(e1-e0), 0, 1)`，分母变号之后掩膜
整个翻转 —— **冰盖长在赤道，两极反而裸露**。

这不是边角情况，是**冰行星这一整个原型**：

| 入射能量 | thermal.ice | snowLine | edge0 | edge1 | |
|---:|---:|---:|---:|---:|---|
| 0.06 | 1.00 | 0.0667 | **0.4200** | 0.2867 | **反序** |
| 0.01 | 1.00 | 0.0114 | **0.4200** | 0.2314 | **反序** |
| 0.15 | 0.30 | 0.1584 | 0.2369 | 0.3784 | 勉强有序 |
| 0.45 | 0 | 0.4040 | 0.4040 | 0.6240 | 有序 |

`thermalWeights` 在 `incident ≤ 0.06` 时给 `ice = 1`，而同一个 `incident`
让 `snowLine = 1 - e^(-incident·1.15) ≈ 0.067`。**冷 → 雪线低**与
**冰权重 → 把阈值抬到 0.42**这两条方向相反，必然反序。

方向本身也错了：旧版是 `smoothstep(mix(0.82, 0.48, uThermalIce), 0.98, latitude)`
—— 冰权重把阈值**降低**（冰盖更大）。批次 6 把它改成往 0.42 **抬高**（冰盖更小），
与「冻透的世界冰盖压到赤道」正好相反。

`planetShader.test.ts` 已有的 `expectNoReversedNumericSmoothstep` 没抓住它：
那条只扫**数字字面量**的边，这里两个边都是表达式。

### 2.2 修复（TDD）

RED → GREEN 顺序：先在 `planetShader.test.ts` 加一条源码契约断言（当时红），
再改实现。

1. **冰权重折进 CPU 侧**（`planetAppearance.ts`）：冰只能把雪线**往赤道压**。

   ```ts
   const incidentSnowLine = clamp01(1 - Math.exp(-Math.min(incident, 6) * 1.15))
   const snowLine = Math.min(incidentSnowLine,
     1 - (1 - ICE_SNOW_CEILING) * clamp01(thermal.ice))   // ICE_SNOW_CEILING = 0.42
   ```

2. **着色器的上缘由下缘推出来**，顺序因此是结构性成立的，不依赖任何 uniform：

   ```glsl
   float snowStart = clamp(uSnowLine - max(vHeight, 0.0) * 0.55, 0.05, 0.99);
   float polarMask = smoothstep(snowStart, min(0.995, snowStart + 0.22), latitude);
   ```

   `snowStart ≤ 0.99 < 0.995` 且 `snowStart + 0.22 > snowStart`，**任何取值下两个边都有序**。

### 2.3 为什么这是安全的

**四个非冰原型逐位不变**（`uThermalIce = 0` 时 `snowLine` 与两个边与修复前完全相同）：

| 原型 | 修复前 edge0/edge1 | 修复后 edge0/edge1 | 逐位相同 |
|---|---|---|---|
| magma | 0.9683 / 0.9950 | 0.9683 / 0.9950 | ✓ |
| desert | 0.6448 / 0.8648 | 0.6448 / 0.8648 | ✓ |
| rock | 0.4040 / 0.6240 | 0.4040 / 0.6240 | ✓ |
| tundra | 0.2499 / 0.4699 | 0.2499 / 0.4699 | ✓ |
| **ice** | **0.4200 / 0.2867（反序）** | **0.0667 / 0.2867** | 修正 |

`thermal planets` 门禁的五个用例里有四个逐位不动，第五个（ice）从未定义变成有定义。

### 2.4 新增门禁（3 条，均为收紧）

- `planetShader.test.ts`：极冠掩膜的上缘必须由下缘推出，且不得回退到
  `mix(snowBand, 0.42, uThermalIce)` 的写法。
- `planetAppearance.test.ts`：扫过 7×7 个入射能量 / 轨道距离组合，
  断言冰权重**永不抬高**雪线。
- `planetAppearance.test.ts`：冻透的世界冰盖必须越过中纬度（`snowLine + 0.22 < 0.5`）；
  烤干的内侧世界冰盖只到极点（`snowLine > 0.9`）。

---

## 3. 修复二：性能绝对预算量错了对象（**Blocker**）

### 3.1 缺陷

`render-baseline.spec.ts:312` 与 `compare-render-baselines.mjs:231` 都拿
`p95FrameTime` 去比 `ABSOLUTE_BUDGETS`（medium 20ms / low 33.3ms）。

但**同一个文件里下面两行的注释自己写着**：

```ts
// p95FrameTime is the scheduling interval, which the deliberate 30fps idle
// throttle pins near 33ms whatever the scene costs. This is the work itself.
renderCostMs: final.resources.renderCostMs ?? null,
```

`p95FrameTime` 是**调度间隔**，被 30fps 空闲节流钉在 43ms 左右，与这一屏
画了多少东西无关。拿它比 20ms 的 medium 渲染预算，**在任何机器上都必红**。

后果：`package.json` 里文档化的 `capture:stellar-baseline`
（`MINDVERSE_REFERENCE_DEVICE=1`）**从来跑不通** —— 这也解释了为什么冻结的
`babylon-stellar-v1.json` 里 `enforceAbsoluteBudgets` 是 `false`：那份基线
根本不是按文档化的命令采的。绝对性能预算**从未真正被执行过**。

审计中实测复现：

```
Error: expect(received).toBeLessThanOrEqual(expected)
Expected: <= 20
Received:    42.900000005960464
```

### 3.2 修复（TDD）

先加一条红的单测（「调度间隔被节流钉住时仍应通过，渲染开销超预算才该红」），
再把两处断言改成量 `maxRenderCostMs`（最坏单帧渲染开销）—— 这正是批次 6 报告
§5.4 自己用的那个数（medium 11.3ms / low 10.1ms）。

同时 `validatePerformanceState` 现在**要求** `renderCostMs` / `maxRenderCostMs`
存在且为正：门禁比对的数不允许缺席后被静默跳过。

原有那条 `enforces absolute budgets only for an explicit macOS Metal reference run`
改为推 `maxRenderCostMs` 而不是 `p95FrameTime`。**这是把断言指向正确的量，
不是放宽**：修复前该分支不可能通过，修复后它第一次真正生效。

### 3.3 效果

`MINDVERSE_REFERENCE_DEVICE=1` 的参考机路径**第一次跑绿**，并且预算是真的：

| 档 | p95 调度间隔 | **maxRenderCost** | 绝对预算 | 余量 |
|---|---:|---:|---:|---:|
| medium | 43.00 ms | **12.20 ms** | 20 ms | 39% |
| low | 43.10 ms | **9.70 ms** | 33.3 ms | 71% |

---

## 4. 修复三：星芒公告板中心的未定义行为（Low）

`starDiffraction.fragment.fx`（批次 6 新增）在 `radius > 1.0` 时 discard，
但 `radius == 0`（公告板正中心）没有兜底，而 `atan(0, 0)` 在 GLSL 里未定义。
一旦返回 NaN，`lobe → energy → alpha` 一路带过去，`clamp(NaN)` 同样未定义。

影响面是单个像素、且需要像素中心恰好落在公告板正中心，但这是**新代码里的
未定义行为**，一行即可消除：

```glsl
vec2 direction = radius < 1e-6 ? vec2(1.0, 0.0) : centered;
float angle = atan(direction.y, direction.x) + uRot * 0.08;
```

（`starCorona.fragment.fx` 有同一形状的 `atan`，但那是**迁移前既有**的写法，
批次 6 只是把它提成了变量。已记录，未改动 —— 不在本次「新增 shader」范围内。）

---

## 5. `compare:stellar-baselines`：独立取证与新基线

### 5.1 前报告的结论不完整

批次 6 报告 §8 写「红，1 项：panorama camera angle drift」。**实际不止一项** ——
`compare-render-baselines.mjs` 遇到第一条不通过就 `throw`，后面的检查根本没跑。
审计另写了一份收集全部失败的等价脚本，真实结果是 **5 项**：

```
✗ panorama          camera ANGLE  alpha -1.5708 → 1.0708 (Δ=2.6416, tol 0.5)
✗ approach-midpoint camera ANGLE  同上
✗ focused-star      camera ANGLE  同上
✗ planet-focus      camera ANGLE  alpha -1.5535 → 1.1299 (Δ=2.6833)
✗ planet-focus      camera target drift 3.9154
```

五项**同一个根因**：开场方位角变了，四个状态全都跟着变，行星聚焦的目标点
也因此落在轨道的另一处。

### 5.2 是陈旧基线，不是回归 —— 证据

不采信报告说明，直接对代码取证：

1. **Three 参考自己就是这个机位**。`frontend/src/starmap/Renderer.ts:144-145`：

   ```ts
   private yaw = 0.5
   private pitch = -0.2
   ```

2. **换算逐位吻合**。`arcRotateFromYawPitch(0.5, -0.2)`：

   ```
   x = sin(0.5)·cos(-0.2) = 0.469871
   y = -sin(-0.2)          = 0.198669
   z = cos(0.5)·cos(-0.2) = 0.860091
   beta  = acos(0.198669)          = 1.370796   ← 候选 1.3708 ✓
   alpha = atan2(0.860091, 0.469871) = 1.070796 ← 候选 1.0708 ✓
   ```

3. **冻结基线是恢复之前的机位**。`babylon-stellar-v1.json`（Sep 4 22:45）记的是
   alpha −1.5708 / beta 1.2320 —— 那**不是** Three 的机位。批次 5 §2 记录的
   「采用旧版开场机位」发生在 Sep 4 23:54，比基线文件晚一小时。

4. **画质指标全部在容差内且是改善**（用不 fail-fast 的脚本量全套）：

   | 状态 | core 直径 | halo 直径 | clippedWhite |
   |---|---|---|---|
   | panorama | 4.98 → 4.98 | 12.45 → 12.45 | 0 → 0 |
   | approach-midpoint | 73.25 → 73.25 | 183.13 → 183.13 | 0.00009 → **0** |
   | focused-star | 121.78 → 121.78 | 304.46 → 304.46 | 0.00220 → **0** |
   | planet-focus | 695.91 → 695.91 | 1739.78 → 1739.78 | 0.01880 → **0** |

   主体尺寸**逐位不变**，过曝四个状态**全部归零**。

**判定：陈旧基线。** 漂移完全来自批次 5 已记录、朝 Three 参考靠拢的取景恢复，
不是回归。

### 5.3 新基线（按任务要求：有明确版本与依据，不覆盖 Three 参考）

用修好之后的参考机路径重采：

```bash
MINDVERSE_REFERENCE_DEVICE=1 MINDVERSE_UPDATE_BASELINES=1 \
  MINDVERSE_BASELINE_OUT=testdata/render-baselines/babylon-stellar-v2.json \
  npm run test:e2e:performance
```

`babylon-stellar-v2.json`：

| | |
|---|---|
| 机位 | alpha 1.0708 / beta 1.3708（= Three 的 yaw 0.5 / pitch −0.2） |
| 距离 | 97.20 / 26.60 / 16.00 / 2.80（与冻结取景逐位一致） |
| clippedWhiteRatio | 四个状态**全 0** |
| `enforceAbsoluteBudgets` | **`true`**（v1 是 `false`）—— 绝对预算第一次真的生效 |

`package.json` 的 `compare:stellar-baselines` 与 `capture:stellar-baseline`
改指 v2。**`babylon-stellar-v1.json` 保留在盘上作为历史**；
**Three 参考 `three-parity-v1.json` 一字未动**。

```
$ npm run compare:stellar-baselines
render baselines verified: babylon; states panorama, approach-midpoint, focused-star, planet-focus
```

---

## 6. 逐项肉眼与自动验证

| 任务要求 | 结论 | 依据 |
|---|---|---|
| 恒星不是白团/点阵、有实体表面 | ✅ | `babylon-uplift-{before,after}-focused-star.png` 实拍对比：before 是纯白圆盘，after 有米粒/星斑/色温分层。圆面 `clippedWhite` 0.4489 → 0 |
| 日冕与光学层 | ✅ | 实拍可见日冕、流苏、衍射星芒；`starSurfaceUplift.test.ts` 盯住不得整体过曝 |
| 行星远近景有数据驱动地貌 | ✅ | `after-planet-focus.png` 岩浆行星有裂谷/明暗；`planetAppearance.ts` 7 条外观各自接回数据轴 |
| 星云/星场/尘埃/环/模式/标签未丢、未堆白 | ✅ | 稳态计数：nebulaShells 3、starfieldShells 3、starfieldPoints 820、dust 1；标签实拍可见；mode-bar 六帧两两 sha256 不同 4/4 |
| 点击 / 拖拽 / 滚轮 / 主动旋转 / 飞行 / 退出 | ✅ | **6 条完整旅程**（3 轮 × reduce / no-preference）逐环节断言通过 |
| 进入行星后宇宙明确退场 | ✅ | `updateBackground` 在 `!universeVisible` 时把星云/尘埃/星场 dim 归 0；实拍地层帧无宇宙残留 |
| 出现可探索、可读的纵向答案地层与文章入口 | ✅ | 地层非背景占比 **0.9145**；带亮度剖面 `0.1579…0.1552` 交替；标本可点、证据板可开可关 |
| 探测器远景可辨识 / 近景完整 / 接近·旋转·扫描·返回 | ✅ | 功能门禁「an article probe is a craft in orbit that can be approached, orbited, scanned and closed」通过；实拍 12 个部件面板齐全 |
| high/medium/low 均保留 14 类效果 | ✅ | `UPLIFT_EFFECT_CATEGORIES` 14 项在三档逐一非零（low：星场 820、星斑 3、日珥 2、流苏 4、星芒 4、云 2 阶、夜侧 0.6、大气 1、探测器补光 1、推进器 3、纹层 2、引导光 0.7、空间雾 0.62） |
| 长时间/重复进出资源不增长 | ✅ | 见 §7 |
| 首屏与稳态不卡顿 | ✅ | maxRenderCost medium 12.20ms / low 9.70ms，占预算 61% / 29% |
| 不启用全局右手系 | ✅ | 全仓 `useRightHandedSystem` **零处**，手性未动 |

---

## 7. 资源不增长（三轮 × 两种动效设置）

`frontend/e2e/audit-stability.spec.ts`（审计用，未接入任何既有 project）把
「全景 → 拖拽 → 滚轮 → 点星飞行 → 进入行星 → 主动旋转 → 进入地层 → 下潜 →
点开标本 → 关闭 → 退出地层 → 逐级退回全景」串成一条旅程，连跑三轮。

reduce 档三轮稳态计数：

| | 第 1 轮 | 第 2 轮 | 第 3 轮 |
|---|---:|---:|---:|
| WebGL context | 1 | 1 | 1 |
| RAF loop | 1 | 1 | 1 |
| 事件监听器 | 10 | 10 | 10 |
| geometries | 96 | 96 | 96 |
| **textures** | **3** | **3** | **3** |
| nebulaShells / starfieldShells / dust | 3 / 3 / 1 | 3 / 3 / 1 | 3 / 3 / 1 |
| JS 堆 | 31.6 MB | 31.6 MB | 31.6 MB |

**逐项相同。** 纹理恒为 3 张，与批次 6 报告「没有新增贴图」一致。
`planetVisualConstructions` 2 → 4 → 6 是累计计数器（每次进入恒星系重新物化
2 颗行星），不是活跃对象数。

监听器 add/remove 逐一配平（`BabylonRenderer.ts:2193-2200` ↔ `2204-2211`），
`onBeforeRenderObservable` 的转场 observer 在完成 / 异常 / 取消三条路径上都被移除。
既有门禁「five complete mounts release real canvas, context, listeners and RAF resources」
另有覆盖。

运行方式：

```bash
cd frontend
VITE_RENDERER=babylon npm run build:e2e
VITE_RENDERER=babylon npx playwright test -c playwright.audit.config.ts
```

---

## 8. 代码审查（新增部分）

| 项 | 结论 |
|---|---|
| Shader 数学稳定性 | 除 §2 / §4 两处外未见问题。除法一律 `max(x, ε)` 兜底；`pow` 的底一律 `abs`/`max` 保护；`sqrt(max(0, ·))`；`min(color, vec3(6.0))` 封顶 HDR |
| NaN | §4 已修；其余路径无未保护的 `atan(0,0)` / `normalize(0)` / `0/0` |
| 颜色 / alpha | 输出一律 `clamp`，日冕 α ≤ 0.82、星芒 α ≤ 0.34；色球色按保亮度混入，不把临边压到 bloom 阈值以下 |
| 手性 | `useRightHandedSystem` 零处，左手系保持 |
| 背面剔除 | 语义正确：洞窟壁 `false`（从内部看）、星云壳 `BACKSIDE`、行星表面 `true`、大气壳 `false` |
| pick | 地层内走 `pickAtClient`，该路径**不可能**返回 `star`（只有 specimen/planet/other/none）；宇宙内走 `sceneTarget` |
| dispose | 8 个图层全部 `disposed` 幂等守卫 + mesh/material/geometry/texture/light 逐一回收 |
| 事件监听 | add/remove 配平；`window.keydown` 亦在 detach 中移除 |
| Bundle | **1,780,524 B / 1,800,000 B**，`verify-build-boundaries` 通过；本次修复未增加体积 |

---

## 9. 全量验证

| 检查 | 结果 |
|---|---|
| `npx oxlint src e2e scripts` | ✅ |
| `npx tsc -b` | ✅ |
| `npx tsc --noEmit -p tsconfig.e2e.json` | ✅ |
| `npx vitest run` | ✅ **93 files / 953 tests**（继承 948 + 本次 **+5 条收紧门禁**） |
| `npm run build`（production babylon） | ✅ 1,780.52 kB，边界通过 |
| `npm run build:e2e` | ✅ |
| `playwright --project=swiftshader-functional` | ✅ **21/21** |
| `playwright --project=visual-parity` | ✅ **4/4**（含模式栏六帧互异） |
| `playwright --project=metal-performance` **+ `MINDVERSE_REFERENCE_DEVICE=1`** | ✅ **6/6**（参考机绝对预算路径**首次生效并通过**） |
| `npm run compare:stellar-baselines` | ✅ **绿**（v2 基线） |
| 审计三轮交互回归 × 2 种动效 | ✅ **6/6 旅程** |

一次观察到的抖动：全量扫描期间 `Reduced Motion reaches the same stable focused
state` 红过一次。那一轮里我正**并发地在同一个工作树上做 `git checkout` / `rm`**
（恢复 `web/`，见 §10）。干净重跑 **21/21 全绿**。如实记录，归因为审计操作
自身的干扰，不是产品缺陷。

---

## 10. 保护的用户脏文件

| 项 | 状态 |
|---|---|
| `data/snapshots/*.json` 的 5 条删除 | ✅ 仍为 `D`，未恢复 |
| `data/snapshots/wmlK6xVltDKC.corrupt` | ✅ 保留，mtime 仍是 Sep 2 08:55 |
| `frontend/coverage/` | ✅ 保留未动 |
| `babylon-planets-candidate*`（9 个文件） | ✅ mtime 仍是 **Sep 5 08:34**，本次未覆盖（`MINDVERSE_PLANET_BASELINE_OUT` 全程未设置） |
| `three-parity-v1.json`（Three 参考） | ✅ 一字未动 |
| `babylon-stellar-v1.json` | ✅ 保留为历史，未删未改 |
| **`web/`** | ⚠️ 我误跑了 `npm run build`（产物写进 `web/`），**已完整还原**：`git checkout` 恢复 `.vite/manifest.json` 与 `universe.html`，删除新生成的 5 个哈希文件，重新删除被重建的 11 个文件。现为**原样的 16 条删除，无其他条目** |

**未提交任何东西。**

---

## 11. 明确没有做的事

| 事项 | 理由 |
|---|---|
| 翻转 `useRightHandedSystem` | 任务要求「完全证明三次地层 pick 稳定」才可翻转。本次三轮回归验的是**当前左手系**下的稳定性，不构成对翻转后的证明。维持现状 |
| 放宽任何恢复门禁 | 一条未放宽。§2 / §3 改的两条断言都是**指向正确的量并收紧**：修复前 §3 那条在任何机器上都不可能通过 |
| 改动取景 | 相机距离 97.20 / 26.60 / 16.00 / 2.80 与主体尺寸逐位不变 |
| 把 `compare-render-baselines.mjs` 改成收集全部失败 | 已诊断（fail-fast 让前一份报告少报了 4 项），但改动会动到门禁的报错形态，超出「修可修问题」的必要范围。审计用的等价脚本留在 scratchpad，作为观察记录在 §5.1 |
| 修 `starCorona` 的 `atan(0,0)` | 迁移前既有写法，不属于「新增 shader」范围。已记录 |

---

## 12. 非阻断的遗留观察

1. ~~**`compare-render-baselines.mjs` 的 fail-fast 会少报**~~ —— **已修**，见 §13.2。
2. **审计 spec 未接入任何 project**。`audit-stability.spec.ts` +
   `playwright.audit.config.ts` 是未跟踪文件，不影响任何既有门禁；如要长期
   当门禁用，需要显式接进 `playwright.config.ts`（会让功能套件多约 2 分钟）。
3. **开着动效退出地层时机位不会逐位复原**。这是行星沿轨道走了一段之后镜头
   重新对准它，不是缺陷 —— reduce 档下逐位复原已验证（alpha/beta/distance
   三项 6 位小数相等）。
4. **一次 `lastPick === 'star'`**（约 1/10，仅 no-preference）。地层内的
   `pickAtClient` 路径**不可能**产出 `'star'`，因此这是那一次点击没有到达
   canvas 处理器、`lastPick` 保留了本轮更早 `openStar()` 的取值。随后连续
   9 次全部 `pick=specimen`。归为审计脚本的点击时序抖动，非渲染器缺陷。

---

## 13. 补正：提交前的复核

初版报告写完后、落盘提交前又过了一遍，发现两件事必须记下来。

### 13.1 我漏跑了 `compare:visual-parity`

报告 §9 里写的 `playwright --project=visual-parity` ✅ 4/4 是**采集**项目，
不是跨引擎比对。真正把 Babylon 与 Three 参考帧逐像素指标对齐的门禁是
`npm run compare:visual-parity`，**我没有跑过它**。也就是说，初版的 blocker = 0
是在没有检查「最直接检验完整恢复的那条门禁」的情况下下的结论。

补跑结果：**红，10 项，与批次 6 报告逐项一致，一项未增。**

| 状态 | 越界项 | 归类 |
|---|---|---|
| panorama | `structure:tileMax` / `tileRms` / `subject:centroid` / `subject:radius` | 程序化噪声 |
| focused-star | `structure:tileMax` | 程序化噪声 |
| planet-focus | `structure:tileMax` / `tileRms` / `subject:centroid` / `coverage` | **手性镜像** |
| planet-focus | `toneBand:highlight` | 提升导致的刻意背离 |

三类都独立复核过：

- **程序化噪声**：两套独立烘焙的噪声场，云团落点不可能逐像素相同。这是指标的
  固有下限，不是实现缺陷。
- **手性镜像**：`planet-focus` 的 `subject:centroid` Three `[0.4012, 0.2779]` vs
  Babylon `[0.5779, 0.2784]` —— y 几乎相等，x 关于 0.4896 对称，是**干净的水平镜像**。
  成因（Babylon 左手系 vs 共享几何按 Three 右手系书写）批次 6 已定位并实测：
  `scene.useRightHandedSystem = true` 能把越界从 10 压到 8，代价是洞窟内
  `scene.pick` 间歇打空。**任务约束明令不得启用**，除非三轮地层 pick 稳定性
  被完全证明。我复核了约束本身被遵守：全仓 `useRightHandedSystem` 出现 **0 次**。
- **刻意背离**：`toneBand:highlight` 已由 `starSurfaceUplift.test.ts` 的
  `never lets the whole disc clip to display white` 钉死，把 Three 那团烧白的
  圆面当反例写进断言。要让这项进容差就得把恒星重新烧白 —— 正是任务禁止的。

**判定**：这条红是**已申报、有依据、且由用户自己的约束锁住**的背离，不是回归，
不构成 blocker。但它是一条**永远红**的门禁，意味着它进不了 CI、新增漂移无人发觉
—— 这正是我这次漏掉它的结构性原因。建议见 §13.3。

### 13.2 相对回归门禁也量错了对象（同源缺陷的第 3、4 处）

§3 修的是**绝对**预算量错对象（拿被 30fps 空闲节流钉死的 `p95FrameTime` 去比
单帧预算）。同一个错误还有两处，都是**相对**回归门禁：

| 位置 | 原判据 | 为什么永远不会红 |
|---|---|---|
| `e2e/render-baseline.spec.ts` `assertRelativePerformance` | `p95FrameTime <= 基线 × 1.2` | 基线 43，实测 43，`43 ≤ 51.6` 恒真 |
| `scripts/compare-render-baselines.mjs` `validatePerformance` | 同上 | 同上 |

两处都改为比 `maxRenderCostMs`。新增单测 `src/starmap/renderBudget.test.ts`
（6 条）先红后绿，其中 `catches a doubled render cost even though the frame
interval never moves` 直接把「p95 两侧恒等、开销翻倍」写成用例。
`compare-render-baselines.test.mjs` 里两条断言原判据的老用例同步改指正确的量
（改前后都跑过：改前那条相对用例在渲染开销翻倍时**不抛异常**）。

顺带：`assertRelativePerformance` 读的还是 `babylon-stellar-v1.json`，而
`capture:stellar-baseline` 写的是 v2 —— 重新采集永远更新不到这条门禁读的文件。
已统一到 v2（新增常量 `COMMITTED_STELLAR_BASELINE`），spec 内不再残留 v1 字样。

真实开销（v1 → v2，即提升前后）：medium `maxRenderCostMs` 9.4 → 12.2（预算 20），
low 7.1 → 9.7（预算 33.3）。**新的相对门禁真的会拦**：12.2 > 9.4 × 1.2 = 11.28，
所以 v2 基线不是可有可无的形式，而是这次提升的开销上涨被正式接受的记录。

同时把 `compare-render-baselines.mjs` 的 fail-fast 改成收集式（`runAll`）：
逐项跑完再一次抛出全部失败，只有一处失败时原样透传，既有用例断言的精确文案不变。

### 13.3 建议（未做，留给你决定）

`compare:visual-parity` 目前是「永远红 + 靠文档说明为什么可以红」。这种门禁的
失效方式很隐蔽：**新增一项越界不会改变它的颜色**。建议改成**预期失败清单**——
把当前 10 项写进 manifest，门禁断言「实际越界集合 == 清单」，多一项或少一项都红。
这不放宽任何容差，反而让新漂移第一次变得可发现。

---

## 14. 提交前全量复验（批次 7 补正后）

| 检查 | 结果 |
|---|---|
| `oxlint` | ✅ |
| `tsc -b` / `tsc --noEmit -p tsconfig.e2e.json` | ✅ |
| `vitest run` | ✅ **94 文件 / 960 用例**（953 + 6 renderBudget + 1 净增） |
| `npm run compare:stellar-baselines` | ✅ 绿 |
| `npm run compare:visual-parity` | 🔴 10 项，逐项已申报（§13.1） |
