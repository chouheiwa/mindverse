# Babylon 打开卡顿修复

## 资源边界

`PlanetDatum` 仍在启动时作为纯数据 bookkeeping 建立，但全景不再创建 `PlanetVisual`、大气 Mesh、问题轨道或发起它们的 shader 编译。`focusStar`、`selectQuestionPlanet` 和路由恢复只物化当前恒星的问题行星；切换恒星或回到全景会释放上一系统的行星、大气、材质和问题轨道。

`updateScene` 只遍历已物化的当前系统，并在位置、距离、LOD 和 uniform 计算前排除隐藏 Mesh 或隐藏宇宙。

## 渲染预算

- WebGL backing-store DPR：桌面上限 `1.25`，移动上限 `1.0`。
- 全景 Bloom 关闭，恒星/行星近景按需开启且 kernel 从 `48` 降至 `32`，答案地层使用 `24`。
- `BabylonRuntime` 仍只拥有一个 `runRenderLoop`；静止和全景最多约 30 FPS，相机惯性、点击飞行、行星近景、主动交互和地层动画最多约 60 FPS。动画 delta 使用两次实际渲染之间的 wall-clock 时间，而不是高刷新率源 RAF 的 engine delta；hidden 后的首帧最多补进 50 ms，避免动画跳跃。页面 hidden 时 render-loop callback 不会调用 `scene.render`。

## 可重复计数器

E2E `resources` 快照新增 `materializedPlanetCount`、`planetVisualConstructions`、`planetShaderCompileRequests`、`planetUpdatesLastFrame` 和 `actualRenderCount`。修复前 512 行星压力夹具启动时构造 512 个 `PlanetVisual`、发起至少 1024 次表面/大气编译，每帧更新 512 颗行星；修复后全景三项均为 0。两行星功能夹具聚焦恒星后，计数器为 2 次构造、至少 4 次编译请求、单帧 2 次行星更新，证明负载随当前系统而不是全局数据量增长。
