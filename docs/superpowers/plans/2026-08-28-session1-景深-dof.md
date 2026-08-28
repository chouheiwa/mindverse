# Session 1 · 景深（DOF）实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 `Renderer` 的后期管线加上景深（Depth of Field），让星图从"贴上去"变成"看进去"——这是设计文档 §7.6 点名的"电影感最大来源"。

**Architecture:** 在现有 `Renderer.ts:194` 的 `EffectComposer` 里、`BloomEffect` 之后 `ToneMappingEffect` 之前插入 `postprocessing` 库的 `DepthOfFieldEffect`。焦点复用 `Renderer` 已有的注视点 `this.focus`（相机本来就 `lookAt` 它），每帧把"相机到注视点距离"写进 effect 的 `focusDistance` uniform。顺手建一个最小画质分级模块，Low 档不创建 DOF、Medium/High 给不同 bokehScale。

**Tech Stack:** TypeScript、three 0.185.1、postprocessing 6.39.4（`DepthOfFieldEffect` 已在依赖里）、Vite 8、oxlint。

## Global Constraints

- **项目当前不是 git 仓库**：执行前必须先 `git init` 并建立基线 commit（见 Task 1 Step 1）。之后每个 task 结尾都 commit。
- **前端无单元测试框架**：`package.json` 的 scripts 只有 `dev`/`build`/`lint`/`preview`，没有 test。本 plan 的"验证"用三段链：`oxlint`（lint）→ `tsc -b`（类型检查，build 的前半段）→ `vite build`（构建）→ 手动视觉验证（`vite` dev server 跑起来看）。这是视觉项目，TDD 红/绿循环不适用于 shader 画质；功能正确性靠类型检查 + 构建保底，画质靠手动验收。
- **颜色是数据**：琥珀=收藏、蓝白=创作（`Renderer.ts:26` 注释）。新增 Effect 不得染歪数据色——本 session 的 DOF 不改颜色，只改虚化，天然安全。
- **不改后端、不改数据契约**：只动 `frontend/src/starmap/` 与 `frontend/src/ui/`。
- **不引新依赖**：`postprocessing`、`three` 已在 `package.json`。
- **每帧更新走命令式**：canvas 每帧重绘，不挂 React 重渲染（`Renderer.ts:30` 注释）。

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `frontend/src/starmap/quality.ts` | 画质分级：根据 `reduceMotion` + `navigator` 启发返回 `'high'/'medium'/'low'`。横切关注点，后续 session 往上加分级行为 | 新建 |
| `frontend/src/starmap/Renderer.ts` | 在 composer 里加 `DepthOfFieldEffect`；每帧更新 `focusDistance`；按画质档位决定是否创建 DOF 与 bokeh 强度 | 修改 |
| `frontend/src/ui/Universe.tsx` | 把 `quality` 传给 `Renderer` 构造（当前 `Universe.tsx:72` 已传 `reduceMotion()`，本 session 改为也传 quality） | 修改 |

---

## Task 1: 画质分级模块 + git 基线

**Files:**
- Create: `frontend/src/starmap/quality.ts`
- Modify: 无

**Interfaces:**
- Produces: `export type Quality = 'high' | 'medium' | 'low'`；`export function detectQuality(reduceMotion: boolean): Quality`。后续 task 与后续 session 都通过这两个符号拿画质档位。

- [ ] **Step 1: 建立 git 基线（项目还不是 git 仓库）**

```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse"
git init
printf 'node_modules/\ndist/\n.DS_Store\n' > .gitignore
git add -A
git commit -m "chore: baseline before cinematic DOF"
```

- [ ] **Step 2: 写 `quality.ts`**

Create `frontend/src/starmap/quality.ts`:

```ts
// 画质分级：横切关注点。
// Session 1 先用 navigator 启发粗分三档；后续 session 会在此之上加
// "首帧耗时"实测（见设计文档 §5.3），但接口 (Quality / detectQuality) 不变。
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
```

- [ ] **Step 3: 类型检查 + lint**

Run:
```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse/frontend"
npx tsc -b --noEmit
npx oxlint src/starmap/quality.ts
```
Expected: 两条都无输出（通过）。若 `tsc` 报 `navigator.hardwareConcurrency` 在 DOM 库外不可用——确认 `tsconfig` 含 `lib: ["DOM"]`（项目用 Vite 默认应已含），否则把它加进 `tsconfig.app.json`。

- [ ] **Step 4: Commit**

```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse"
git add frontend/src/starmap/quality.ts
git commit -m "feat(starmap): add quality grading module"
```

---

## Task 2: Renderer 接入 DepthOfFieldEffect

**Files:**
- Modify: `frontend/src/starmap/Renderer.ts`（import、字段、构造、`frame()`）
- Modify: `frontend/src/ui/Universe.tsx:72`（传 quality）

**Interfaces:**
- Consumes: `import { detectQuality, type Quality } from './quality'`；`DepthOfFieldEffect`（来自 `postprocessing`，已在依赖）。
- Produces: `Renderer` 构造多一个可选参数 `quality: Quality`；`Renderer` 内部新增 `private dof: DepthOfFieldEffect | null`。后续 session 通过同一 `quality` 字段决定自己的分级行为。

- [ ] **Step 1: 改 import**

`frontend/src/starmap/Renderer.ts` 顶部的 postprocessing import（当前第 2 行）：

把：
```ts
import { BlendFunction, BloomEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
```
改为：
```ts
import { BlendFunction, BloomEffect, DepthOfFieldEffect, EffectComposer, EffectPass, RenderPass, ToneMappingEffect, ToneMappingMode } from 'postprocessing'
```

在同区 import 块加一行（放在 `import { FOV, nebulaPalette, sceneRadius } from './gl/scene'` 之后）：
```ts
import { detectQuality, type Quality } from './quality'
```

- [ ] **Step 2: 加字段**

在 `Renderer` 类的字段区（`private mode: Mode = 'all'` 附近，约 `Renderer.ts:106`）加：

```ts
  private quality: Quality
  /** 景深 effect；Low 档为 null（不创建），Medium/High 每帧更新其 focusDistance。 */
  private dof: DepthOfFieldEffect | null = null
```

- [ ] **Step 3: 改构造签名**

把 `Renderer` 构造签名（约 `Renderer.ts:144`）：
```ts
  constructor(
    canvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    u: Universe,
    reduceMotion: boolean,
    cb: RendererCallbacks = {},
  ) {
```
改为：
```ts
  constructor(
    canvas: HTMLCanvasElement,
    labelCanvas: HTMLCanvasElement,
    u: Universe,
    reduceMotion: boolean,
    cb: RendererCallbacks = {},
    quality: Quality = detectQuality(reduceMotion),
  ) {
```

并在构造体开头（`this.genesisDone = reduceMotion` 之后，约 `Renderer.ts:155`）加：
```ts
    this.quality = quality
```

- [ ] **Step 4: 把 DOF 加进 EffectPass**

找到构造里的 composer 配置（约 `Renderer.ts:202-215`）：

把：
```ts
    this.composer.addPass(new RenderPass(this.scene, this.camera))
    this.composer.addPass(new EffectPass(
      this.camera,
      new BloomEffect({
        blendFunction: BlendFunction.ADD,
        mipmapBlur: true,          // 多级 mip 混合，比单核高斯的方形光晕干净
        luminanceThreshold: 0.68,
        luminanceSmoothing: 0.30,
        intensity: 1.02,
        radius: 0.74,
        levels: 8,
      }),
      new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL }),
    ))
```
改为：
```ts
    this.composer.addPass(new RenderPass(this.scene, this.camera))

    const bloom = new BloomEffect({
      blendFunction: BlendFunction.ADD,
      mipmapBlur: true,          // 多级 mip 混合，比单核高斯的方形光晕干净
      luminanceThreshold: 0.68,
      luminanceSmoothing: 0.30,
      intensity: 1.02,
      radius: 0.74,
      levels: 8,
    })

    // 景深：§7.6"电影感最大来源"。Low 档不创建（零开销）；
    // Medium/High 给不同 bokehScale。focusDistance 每帧更新，构造里先占位。
    if (this.quality !== 'low') {
      this.dof = new DepthOfFieldEffect(this.camera, {
        focusDistance: this.dist,        // 占位，frame() 每帧覆盖
        focusRange: this.R * 0.22,       // 世界单位，按场景半径缩放，后端布局改了这里不用动
        bokehScale: this.quality === 'high' ? 5 : 3,
        resolutionScale: 0.5,            // DOF 贵，半分辨率够用
      })
    }

    // 管线顺序 = §7.6：Bloom → DOF → ToneMap（GravitationalLens/ChromaticAberration
    // 由后续 session 在 Bloom 之后、DOF 之前/之后插入）。
    const effects = this.dof
      ? [bloom, this.dof, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })]
      : [bloom, new ToneMappingEffect({ mode: ToneMappingMode.NEUTRAL })]
    this.composer.addPass(new EffectPass(this.camera, ...effects))
```

- [ ] **Step 5: 每帧更新 focusDistance**

在 `frame()` 里，相机位置算完之后（`this.camera.lookAt(this.focus)` 之后，约 `Renderer.ts:354`）加：

```ts
    // 景深焦点跟随注视点：相机到 this.focus 的距离 = 焦平面距离。
    // 飞进恒星系时 focus 换成那颗星、dist 收近，景深自然收窄，不需要切"恒星系模式"。
    if (this.dof) {
      const u = this.dof.uniforms.get('focusDistance') as { value: number } | undefined
      if (u) u.value = this.camera.position.distanceTo(this.focus)
    }
```

- [ ] **Step 6: 从 Universe.tsx 传入 quality（可选，默认即正确）**

`Universe.tsx:72` 当前：
```ts
    const r = new Renderer(canvasRef.current, labelRef.current, universe, reduceMotion(), {
```
保持不变即可——构造签名里 `quality` 有默认值 `detectQuality(reduceMotion)`。若想让 UI 能手动覆盖画质（本 session 不做），再加。本 step 无需改动文件，确认构造调用兼容即可。

- [ ] **Step 7: 类型检查 + lint + 构建**

Run:
```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse/frontend"
npx tsc -b --noEmit
npx oxlint src/starmap/Renderer.ts src/starmap/quality.ts
npm run build
```
Expected:
- `tsc -b --noEmit` 无输出。
- `oxlint` 无 warning/error。
- `npm run build`（=`tsc -b && vite build`）成功，产出 `dist/`。
- 若 `tsc` 报 `EffectPass` 的 `...effects` 展开类型不匹配：`EffectPass` 接受 `(...effects: Effect[])`，确认 `effects` 数组元素类型一致（`BloomEffect`/`DepthOfFieldEffect`/`ToneMappingEffect` 都继承 `Effect`）。如 tsconfig 严格拒 spread 进可变参数，改成显式两条分支 `new EffectPass(this.camera, bloom, this.dof, tone)` / `new EffectPass(this.camera, bloom, tone)`。

- [ ] **Step 8: 手动视觉验证**

Run:
```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse/frontend"
npm run dev
```
打开 universe.html（走游客模式或示例数据），验证：
- 全景时：远景星群被压暗/虚化，近景恒星系清楚——有"看进去"的纵深感。
- 点一颗恒星飞进去：背景其它星群明显虚化，目标星系清晰。
- 滚轮拉远：景深焦点回到全景中心，远景重新变清晰。
- 模式切换、创世收敛、拾取行为无回归。

- [ ] **Step 9: Commit**

```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse"
git add frontend/src/starmap/Renderer.ts frontend/src/starmap/quality.ts
git commit -m "feat(starmap): add depth of field with focus tracking"
```

---

## Task 3: 三档画质验收 + 性能预算

**Files:**
- Modify: 无（纯验证 task；若发现参数需调，回到 Task 2 的 `focusRange`/`bokehScale` 调）

**Interfaces:**
- Consumes: Task 1 的 `detectQuality`、Task 2 的 `Renderer.dof`。

- [ ] **Step 1: Low 档降级验证（强制走 reduceMotion 路径）**

临时在浏览器 DevTools 里把 `matchMedia('(prefers-reduced-motion: reduce)')` 设为 true（或系统设置开"减少动效"），刷新：
- 确认 `detectQuality` 返回 `'low'`（DevTools 控制台可临时 `import` 不便；改通过现象判断：创世跳过、且**无景深虚化**——远景不糊，说明 DOF 没创建）。
- 确认星图本身、证据面板、分享卡全部可用——视觉失败不阻断主流程（§3 降级原则）。

- [ ] **Step 2: Medium/High 景深验证**

关掉 reduce-motion，刷新：
- 确认远景虚化成立（Task 2 Step 8 已验证，这里复确认 medium 档也成立——可在 `quality.ts` 临时把判定改 `'medium'` 看差异，验完改回）。
- 确认 `focusDistance` 每帧跟随：飞进恒星系时虚化范围跟着收窄，不是死的固定值。

- [ ] **Step 3: 性能预算（§7.9：60fps @ 1080p 中端集显）**

DevTools Performance 录 3 秒全景旋转：
- High 档：帧率应 ≥ 60（中端笔记本）。DOF 在集显上是较贵 pass，若掉到 30–40，把 `bokehScale` 从 5 降到 4、`resolutionScale` 维持 0.5；仍不行把 High 的判定门槛收紧（`cores < 8`）。
- 确认无节点泄漏：多次进出恒星系、切模式后，Performance Monitor 的 GPU 内存不持续上涨。

- [ ] **Step 4: 参数定稿与回归**

- 若 Step 3 调了 `focusRange`/`bokehScale`/`cores` 门槛，把最终值写回 `Renderer.ts` 与 `quality.ts`。
- 回归跑一遍 `npm run build` 确认仍通过。

- [ ] **Step 5: Commit（若有参数调整）**

```bash
cd "/Users/chouheiwa/Desktop/黑客松/知乎/第二届构思/mindverse"
git add -A
git commit -m "chore(starmap): tune DOF params after perf/visual review" --allow-empty
```
（无改动则空 commit 留验收印记，`--allow-empty`。）

---

## Self-Review（写计划后自检）

**Spec coverage**：设计文档 §5（Session 1 景深）要求——① 往 composer 加 DOF（Task 2 Step 4 ✓）；② 焦点 = this.focus、每帧更新（Task 2 Step 5 ✓）；③ 按 R 缩放（`focusRange = this.R * 0.22` ✓）；④ 画质分级 Low 关、Medium/High 不同（Task 2 Step 4 + quality.ts ✓）；⑤ 降级（Task 3 Step 1 ✓ + 构造里 Low 不创建 ✓）；⑥ §7.9 性能预算（Task 3 Step 3 ✓）。§5.3"顺手加画质分级最小实现"（quality.ts ✓，留了首帧耗时扩展口）。

**Placeholder scan**：无 TBD/TODO；每个 step 都有完整代码或确切命令；`focusRange`/`bokehScale` 是需按效果调的视觉参数（Task 3 Step 3/4 明确处理），非占位符。

**Type consistency**：`Quality` 类型在 quality.ts 定义、Renderer 构造签名用、dof 字段类型 `DepthOfFieldEffect | null` 一致；uniform 访问用 `as { value: number }` 断言稳妥（`Effect.uniforms: Map<string, Uniform>` 已确认）。

**Scope**：本 plan 只覆盖 Session 1，独立可交付（落地后 demo 比之前更"电影"，且不阻断任何现有功能）。Session 2–5 各自有独立 plan，在各自执行前再写（视觉参数会随前面 session 演进，提前写死后面的 plan 易作废）。
