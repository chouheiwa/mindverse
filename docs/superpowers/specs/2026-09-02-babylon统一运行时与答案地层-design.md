# Mindverse · Babylon.js 统一运行时与答案地层设计

版本：v1.0

日期：2026-09-02

状态：产品方向与引擎切换已确认，三轮规格复审问题已修正，用户已确认执行

## 1. 目标

将 Mindverse 的 3D 表现层从 Three.js 迁移到 Babylon.js，并在同一个 Canvas、同一个 Babylon Engine 和同一个 Scene 内完成：

1. 宇宙全景；
2. 恒星系与问题行星观察；
3. 文章探测器检查；
4. 接近行星并穿越地表；
5. 进入答案地层洞窟或证据不足的浅层观测室；
6. 自由下潜、地层吸附、答案矿物标本拾取；
7. 关闭证据板后回到原深度；
8. 退出洞窟并恢复进入前的行星观察姿态。

React 继续负责 OAuth、路由、问题标题、答案原文、证据板、无障碍焦点和错误降级。Babylon 只拥有 3D Canvas，不在引擎内重做内容型 UI。

## 2. 不可违反的架构约束

- 同一页面生命周期不得同时初始化 Three Renderer 和 Babylon Engine。
- 迁移分支可以暂时同时包含两套源码依赖，但通过 `VITE_RENDERER=three|babylon` 生成互斥构建：每个构建只能动态加载一种 Renderer chunk、创建一个 3D Canvas context。主线正式发布在切换闸门前继续选择 Three，闸门通过后改为 Babylon。
- 不把“宇宙”和“洞窟”拆成两个 Canvas；地表穿越必须共享相机、深度、后处理与资源生命周期。
- 第一阶段固定 WebGL2，不同时迁移到 WebGPU/WGSL。
- 不改变后端 OAuth、知乎数据语义、真实问题身份、答案证据门槛和分享脱敏规则。
- 不根据标题推断行星气候、观点立场或用户态度。

## 3. 迁移闸门

迁移分成两个可独立验收的里程碑。样片固定使用 `question:7` 合成 fixture：12 条具有合法 `publishedAt` 的答案、6 名作者、跨度超过 3 个 UTC 日历年，另含 1 条未知日期答案；输入、seed 和预期分层全部版本化并提交到测试代码，避免人工挑图。

### 3.1 垂直样片闸门

在替换现有宇宙之前，Babylon 样片必须证明：

- 能在项目的 React 19 + Vite 构建中延迟加载并正确销毁；
- 能在单 Canvas 渲染一颗由真实 `QuestionPlanetDatum` 生成的程序化行星；
- 行星稳定 seed、热状态和表面指标与现有数据算法一致；
- 至少一套复杂 vertex/fragment Shader、Bloom 和 Neutral tone mapping 达到 §11.3 的可测视觉基线；
- ArcRotate 观察可切换为受控下潜相机，并恢复原姿态；
- 能穿越表面进入满足门槛的至少两个合法时间地层，也能进入证据不足的浅层观测室；
- React DOM 证据板可由 3D Picking 打开，关闭后焦点和相机均恢复；
- WebGL context lost、初始化失败和不支持 WebGL 时进入现有可读降级界面；
- 自动化功能测试、生产构建和桌面 WebGL E2E 通过。

若样片失败，不把 Babylon 作为洞窟专用第二引擎；回退到 Three.js 增强方案。

### 3.2 全量迁移闸门

样片通过后，按层迁移 shader chunks、planet materials、nebula、stars、bodies、dust、rings、overlay、probe、cinematic/still、quality/diagnostics、labels 和 renderer orchestration。现有独立 2D label canvas 可以保留，因为“单 Canvas”约束指唯一 3D Canvas；它不得创建第二个 WebGL context。每迁移一层必须有数据级测试与渲染 smoke test。

全量闸门通过必须同时满足：

- `frontend/src` 中不存在 `three`、`postprocessing` import；
- `package.json` 与 lockfile 不再包含这两个运行时依赖；
- 生产产物不生成 Three 或旧 postprocessing chunk；
- 当前宇宙、行星、探测器、分享静帧、错误降级和全部交互回归通过；
- §11 的视觉、性能、资源和上下文断言通过。

## 4. 运行时边界

新增稳定的 `MindverseRenderer` 接口，React 只依赖该接口，不再 import 具体引擎类。接口保留当前已经使用的命令：

- `start`、`stop`、`suspend`、`resume`、`resize`、`destroy`；
- `setMode`、`resetView`、`selectQuestionPlanet`、`restoreQuestionPlanet`；
- `setWorkspaceOpen`、`orbitWorkspace`；
- `approachProbe`、`startProbeScan`、`setProbeInspectionPose`、`exitProbeInspection`；
- 新增下列显式协议：

```ts
type StrataToken = number
type StrataPose = { depth: number; yaw: number; pitch: number; snapId: string | null }

enterStrata(request: {
  token: StrataToken
  questionId: string
  scene: StrataSceneModel
}): void
moveStrata(input: { forward: number; yaw: number; pitch: number }): void
focusAnswerSpecimen(answerId: string): void
closeAnswerSpecimen(): void
exitStrata(token: StrataToken): void
```

`forward`、`yaw`、`pitch` 都是归一化意图值 `[-1, 1]`，Renderer 结合帧时间、画质档和 Reduced Motion 转为世界单位；React 不发送未经限幅的像素距离。

新增回调：

```ts
onStrataEntered?: (event: { token: StrataToken; questionId: string }) => void
onStrataPhase?: (event: {
  token: StrataToken
  questionId: string
  phase: 'surface-approach' | 'surface-crossing' | 'strata-free' | 'strata-snapped'
}) => void
onStrataExited?: (event: { token: StrataToken; questionId: string }) => void
onStrataPose?: (event: { questionId: string; pose: StrataPose }) => void
onAnswerSpecimenFocus?: (event: { questionId: string; answerId: string; pose: StrataPose }) => void
onStrataError?: (event: { token: StrataToken; questionId: string; cause: Error }) => void
```

`enterStrata` 和 `exitStrata` 对相同 token 幂等；新 token 会取消旧过渡；过期 token 的完成、退出和错误回调全部被忽略。`focusAnswerSpecimen` 只接受当前 `StrataSceneModel` 中的 answer ID，否则报告可恢复错误且不改变姿态。`closeAnswerSpecimen` 恢复聚焦前保存的精确 `StrataPose`，重复关闭为空操作。

回调继续使用领域对象和字符串 ID，不向 React 暴露 Babylon `Mesh`、`Vector3`、`Camera` 或 `PickingInfo`。

Babylon Runtime 负责：

- Engine、Scene、Camera、RenderPipeline 生命周期；
- 场景层启停和资源容器；
- 3D 拾取、相机姿态、动画、碰撞/射线；
- 每帧更新与性能档位。

React 是离散业务状态的唯一事实源，负责：

- 当前业务状态；
- 模态对话框、证据板、原文链接；
- 进入/退出命令与焦点恢复；
- 错误、加载、Reduced Motion 和只读分享状态。

Babylon 只保存连续相机姿态、当前动画进度和由 React 状态派生的短暂过渡守卫。React 先进入 `*-entering` 状态并发出带 token 的命令，只在收到同 token 确认后进入稳定状态；失败或取消则回到命令中保存的 `returnTo`。Babylon 不自行推进 React 业务状态。

## 5. 场景状态机

React 状态机采用以下互斥主状态：

```text
PANORAMA
  → STAR_FOCUS
  → PLANET_FOCUS
  → PLANET_OBSERVATORY
  → SURFACE_APPROACH
  → SURFACE_CROSSING
  → STRATA_FREE
  → STRATA_SNAPPED
  → ANSWER_SPECIMEN_FOCUS
  → STRATA_EXIT
  → PLANET_OBSERVATORY
```

探测器检查保持现有独立分支，但不得与地层状态并发。`SURFACE_APPROACH`、`SURFACE_CROSSING` 和 `STRATA_EXIT` 是带 token 的过渡态；`STRATA_FREE`、`STRATA_SNAPPED` 和 `ANSWER_SPECIMEN_FOCUS` 是确认后的稳定态。迟到回调不得改变当前状态。

Reduced Motion 下不取消语义状态，只将镜头动画缩短为单帧或短淡变。

## 6. 行星表面生成

同一问题的外观必须跨会话稳定。稳定 hash 只使用真实 question ID 与版本化算法常量。

### 6.1 热状态

恒星能量与轨道距离形成归一化入射能量：

```text
incident = normalizedStarEnergy / max(normalizedOrbitDistance², epsilon)
```

使用连续阈值混合五种基础状态：熔岩、荒漠、岩质、冻土、冰冻。不得硬切换整颗球的颜色。

### 6.2 数据到地貌

- 回答数量：对数映射到半径、陨坑数和表面细节密度；
- 可验证回答时间跨度：映射到断层、沉积痕迹和可进入深度；
- 真实发表时间分布：决定地层厚度，不均匀补齐年份；
- 最近公开活跃度：映射到大气、尘埃、云或冰雾；
- 用户创作：允许少量琥珀内光；
- 仅收藏：只显示细标记，不制造暖光或立场含义；
- 文章数量：不直接改变问题行星地貌，只影响恒星系探测器与扫描设施。

### 6.3 地层领域模型

Renderer 不直接从答案数组自行分箱。领域层以版本化纯函数 `buildStrataSceneModel(index, questionId)` 生成唯一输入：

```ts
interface StrataSceneModel {
  version: 'strata-layout.v1'
  questionId: string
  evidenceLevel: 'surface-only' | 'retrospective'
  disclaimer: string
  surfaceSpecimens: readonly AnswerSpecimen[]
  strata: readonly TimeStratumScene[]
  undated: readonly AnswerSpecimen[]
  bounds: { top: number; bottom: number }
}

interface TimeStratumScene {
  id: string
  startPublishedAt: number
  endPublishedAt: number
  centerDepth: number
  thickness: number
  specimens: readonly AnswerSpecimen[]
}

interface AnswerSpecimen {
  answerId: string
  publishedAt: number | null
  updatedAt: number | null
  observedAt: number | null
  authorId: string | null
  relations: readonly ('created' | 'collected')[]
}
```

证据门槛沿用当前 `CHRONICLE_REQUIREMENTS` 与既有产品硬约束：回溯地层至少 12 篇具有合法首发时间的独立答案、至少 3 个非空 `authorId`、跨 3 个 UTC 日历年；每个可见地层至少 3 篇答案、3 个非空 `authorId`。未知时间答案不计入门槛，也不参与年代深度计算。棱镜仍要求至少 8 篇独立答案、6 名独立作者；离散光谱的每束至少 2 名独立作者支持。

`relations` 是去重、按 `created` 后 `collected` 固定排序的无损集合；空数组表示公共答案。同一答案可以同时保留创作内光和收藏细标记。

三个标本集合始终互斥。`surface-only` 时，`surfaceSpecimens` 包含当前问题的全部去重答案，不按年代排序或定位，`strata` 与 `undated` 必须为空；每个标本自身的 `publishedAt: null` 已足够表达时间缺失。`retrospective` 时，`surfaceSpecimens` 为空，合法日期答案只进入 `strata`，未知日期答案只进入 `undated`。同一 answer ID 在整个模型中必须恰好出现一次。

`publishedAt` 是年代位置的唯一时间；`updatedAt` 和 `observedAt` 只进入证据板展示，不能替代首发时间、拉长跨度或改变层边界。

### 6.4 `strata-layout.v1` 分层算法

1. 按 `publishedAt`、answer ID 稳定排序合法答案并去重；
2. `strata-layout.v1` 不消费当前 `UniverseIndex` 尚未提供的 `TurningPoint`。候选边界只来自 UTC 日历年变化处，以及相邻答案间隔大于 `max(180 天, 3 × 中位正间隔)` 的位置；没有正间隔时中位间隔取 1 天；
3. 每个候选边界的确定性分数为 `yearChanged ? 0.25 : 0` 加 `ln(1 + gapDays / medianPositiveGapDays)`。使用以“候选边界位置 × 已形成层数（1–8）”为状态的动态规划寻找合法切分，舍弃任一层少于 3 篇答案或 3 个非空 `authorId` 的转移；选择总边界分最高的方案，分数相同时依次选择层数更少、边界 answer ID 序列字典序更小的方案；不得把时间密度切分叙述为认知转折；
4. 至少形成两个合法地层才返回 `retrospective`；否则降级为 `surface-only`；
5. 对全部合法层分别计算 `spanNorm = log1p(spanDays) / maxLayerLogSpan` 与 `densityNorm = log1p(answerCount) / maxLayerLogCount`，其中分母至少为 1；层厚为 `4 + 14 × (0.65 × spanNorm + 0.35 × densityNorm)`，结果限幅到 `[4, 18]` 世界单位；按新到旧顺序累计厚度得到 `centerDepth` 和总 `bounds`，质量档不得改变语义坐标；
6. 未知日期答案进入与深度轴分离的“未定年碎屑室”，不排序、不吸附到任何年代层；
7. 所有 ID、边界、厚度和标本横向位置由 question ID、answer ID 与算法版本稳定生成；所有浮点输出在领域边界四舍五入到 `1e-6`，禁止依赖 Map 插入顺序以外的隐式遍历顺序。

任何未来算法变更都必须提升 `version`，不得在同一版本下改变既有问题的地层外观。

## 7. 答案地层洞窟

### 7.1 进入过程

用户点击“打开答案地层”后：

1. 问题工作台的非必要 UI 收起；
2. 相机从当前可见行星姿态接近表面；
3. 选定裂缝亮起，星空、轨道和其他天体随穿越过程退出；
4. 相机穿过表面进入纵向洞窟；
5. 宇宙层停更或隐藏，洞窟层成为唯一 3D 主场景。

不得以切换标签页、黑屏跳转或第二 Canvas 代替穿越。

### 7.2 洞窟结构

- 只有 `evidenceLevel = retrospective` 时深度轴才表示时间，越深越早；
- 左右位置不表示立场；
- 地层厚度只消费 §6.4 的领域输出，Renderer 不重新分箱；
- 未知首发时间的回答进入“未定年碎屑室”，不称为年代层；
- 数据不足仍进入浅层观测室，只展示无年代含义的“当前可观测表层”和当前原文入口；此时没有时间刻度、地层吸附或按首发时间纵向摆放，更深处以岩壁和明确文案阻断，不虚构历史。
- 所有回溯洞窟常驻显示：这是“当前仍可访问版本按内容容器首发时间排列”，不代表当年观点文本或社区份额，并提示幸存者偏差与版本偏差。

### 7.3 操作

- 鼠标滚轮、触控拖动和键盘控制下潜；
- 用户拥有主动旋转权；
- 仅在 `retrospective` 模式接近领域模型给出的地层中心时减速并吸附；
- 用户可挣脱吸附继续自由移动；
- 边界由射线/碰撞约束，不能穿出洞壁；
- 退出时沿相反路径恢复进入前的行星相机姿态。

## 8. 答案矿物标本与证据板

- “答案矿物标本”只表示一个当前可访问的答案内容容器，不等同于产品领域中的 `FossilClaim`，不暗示该观点在当年已存在、曾流行或代表社区共识；
- `retrospective` 模式中，每条合法答案标本的纵向位置由真实 `publishedAt` 决定；`surface-only` 模式不使用年代位置；
- 公共答案使用低饱和蓝白矿物；
- 用户创作答案允许琥珀内光；
- 收藏只显示细小关系标记；
- 接近时显示作者、首发日期和一行当前版本摘要，同时显示当前版本与时间偏差提示；
- 点击后相机侧移对准洞壁，并由 React 打开证据板；
- 证据板分别展示首发时间、更新时间、观测时间及其缺失状态，提供原回答链接，不复制不可验证的正文；
- 关闭证据板恢复精确深度、朝向和焦点；
- 棱镜只有达到现有证据门槛才能扫描，否则明确 abstain。

## 9. 材质与光照

- 延续“寂静深空”方向：深黑负空间、克制 Bloom、数据色不被胶片曲线染偏；
- Babylon 使用自定义 ShaderMaterial 或 Node Material 等价实现现有程序化表面；
- 洞窟近景必须有可读的岩层、裂缝、矿物、尘埃和深度雾，不能是光秃球体或纯黑体块；
- 远景可用程序化低多边形物件，近景必须加载或生成足够细节；
- 材质参数与行星数据模型分离，便于编辑器调光但不改变数据语义。

## 10. 性能与资源

- 只创建一个 Babylon Engine；
- 使用场景层/AssetContainer 分阶段启停宇宙和洞窟资源；
- 低端档降低实例数量、地形细分、Bloom 与粒子，不删除答案证据；
- 不默认加载 Havok；答案地层优先使用轻量射线、包围体和受控相机，只有样片证明需要刚体时再加载物理 WASM；
- 所有 Observer、Input、Texture、Material、Mesh、RenderTarget 和 Engine 必须可确定性释放；
- 保留 context lost 处理和可读 DOM fallback。

性能预算以同一台测试设备、同一 fixture、同一视口和 10 秒稳定采样为准：Babylon 样片的 p95 frame time 不得比 Three 基线恶化超过 25%，首次可交互时间不得恶化超过 30%。低档桌面 SwiftShader 功能测试不设帧率门槛，只要求完成交互；真实移动端预算在设备基线建立后写入 `performance-baseline.json`，不能凭主观观感判定。

## 11. 测试与验收

### 11.1 单元测试

- 稳定 hash、热状态、地貌参数和地层布局；
- 状态机合法/非法转移及迟到 token；
- 未知日期、样本不足、重复答案和极端数量；
- `strata-layout.v1` 候选边界、动态规划约束、版本稳定性和最少两层降级；
- 相机姿态序列化与恢复；
- 资源作用域只能释放一次。

### 11.2 组件测试

- React 延迟挂载/销毁 Babylon Renderer；
- 打开地层触发真实进入命令，不再只切换回溯标签；
- 证据板打开、关闭、Escape 与焦点恢复；
- Reduced Motion 和 renderer failure fallback。

### 11.3 WebGL E2E

- 生产构建不黑屏；
- 宇宙、行星、穿越、洞窟和答案矿物标本各阶段都有非背景像素；
- 单页面只有一个 3D Canvas 与一个 WebGL context；
- 用户可以拖动旋转、下潜、点击答案矿物标本、退出并回到原行星；
- 固定 fixture 的选中行星投影直径不小于视口短边的 24%，洞窟阶段非背景像素占比不少于 35%；相对已提交 Three 基线截图，主要对象包围盒中心偏差不超过视口短边的 10%，非背景像素占比偏差不超过 20%；
- 10 秒采样满足 §10 的 p95 frame time 预算；
- 连续执行 5 次 mount → enter → exit → destroy 后，活动 3D Canvas 数、WebGL context 诊断计数、事件监听器和 RAF 计数回到基线；
- 控制台无 uncaught error；WebGL warning 允许列表为空，若浏览器自身产生已知信息日志必须以精确消息写入测试配置，不接受模糊正则；
- 生产构建执行 import/chunk 扫描，保证当前构建只包含所选 Renderer；全量切换后保证零 Three/postprocessing 依赖。

## 12. 交付顺序

1. 建立引擎无关接口、React 单一事实源状态机、地层领域模型与测试；
2. 建立互斥 Three/Babylon 构建选择和最小 Babylon WebGL2 Runtime；
3. 在 Babylon 构建中完成程序化行星、表面穿越、合法多层洞窟、证据不足浅层观测室、答案矿物标本与 React 证据板；
4. 建立固定 fixture 的 Three 基线与 Babylon 对照，执行 §3.1/§11 的完整样片闸门；
5. 若样片失败，删除 Babylon 产品路径并回到 Three 增强方案；若通过，提交闸门结果并开始逐层迁移；
6. 迁移 shader chunks、宇宙环境、恒星、行星、尘埃、环、叠加层、探测器、静帧、标签和诊断；
7. 删除全部 Three/postprocessing import、依赖与旧 chunk，更新正式构建选择为 Babylon；
8. 执行 §3.2 全量闸门，通过后合并切换，并完成移动端基线和编辑器资产工作流。

## 13. 明确不在本轮改变的内容

- 不修改 OAuth scope 或新增未获授权的知乎数据；
- 不实现未经证据门槛允许的观点棱镜结论；
- 不把文章强行归属到问题行星；
- 不重新设计分享、专业新手村或后端快照协议；
- 不以 48 小时为产品上限，但每个迁移闸门必须保持可构建、可测试、可回退。
