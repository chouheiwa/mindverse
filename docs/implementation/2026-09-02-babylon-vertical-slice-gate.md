# Babylon 垂直样片闸门报告

- 日期：2026-09-02（Asia/Shanghai）
- `main` 基线：`fc5cdec9b1f08e647021bc4a011f10f57db1cf0a`
- 性能样本采集提交：`7eac10a316f42960a770b7df4a1ef8f9fbc26140`
- 最终审查修正提交：`2587b82788f83974f1570797ae33dbe0fe77af85`、`2d1faefd1f3c1555c5f0d7dca11dacb39c7c22fd`、`8c69ee3d8b20e35ffe724edcfc772f66ef82a454`
- 决策：**PASS — proceed to full Babylon renderer migration plan**

## 产品闸门

- Babylon 单 Engine / 单 WebGL context，运行期计数始终为 1。
- 固定 `question:7` 含 12 条合法定年回答、6 个稳定作者、1 条未定年回答；`question:8` 低于年代门槛。
- 用户可点击恒星/行星、主动拖动近景、穿越地表、下潜、轻点答案标本、关闭证据板并精确恢复相机姿态。
- 回溯地层、未定年侧室和证据不足的浅层阻断室均通过真实浏览器验收。
- 选中行星短边投影为 215.94 px，高于 720 px 视口短边 24% 的 172.8 px 门槛。
- 洞窟阶段非背景像素占比通过 `>= 35%` 硬门槛。
- 连续 5 次完整 mount → enter → exit → destroy 后，浏览器探针实测活动 Canvas、`gl.isContextLost() === false` 的 WebGL context 和待执行 RAF 均回到 0，全局或仍连接节点的监听器回到首次销毁基线；销毁路径显式调用 `WEBGL_lose_context`。
- Engine 初始化失败、WebGL2 不可用、`webglcontextlost` 都进入可读 DOM fallback；上下文丢失可原页重挂载恢复。
- WebGL2 能力拒绝与 Runtime 部分构造失败同样会显式释放已创建的 `webgl2` 或 `webgl` context；两种降级页均实测 live context 为 0。

## 同机 Metal 对照

| 指标 | Three 基线 | Babylon 样片 | 结果 |
|---|---:|---:|---|
| 首次可交互 | 1883.33 ms | 1811.17 ms | Babylon 快 3.83% |
| 10 秒 p95 frame time | 9.90 ms | 10.00 ms | 慢 1.01%，低于 25% 上限 |
| 非背景像素占比 | 21.106% | 12.022% | 偏差 9.084 个百分点，低于 20 上限 |
| 主对象中心偏移 | — | 10.10 px | 低于短边 10% 的 72 px |
| 样本帧数 | 1199 | 1201 | 完整 10 秒窗口 |

原始 JSON 与 1280×720 PNG 保存在 `frontend/testdata/render-baselines/`，未修图、未手改测量值，不含机器身份或私有用户数据。Three 旧实现的选中行星投影为 77.22 px；它仅作对照基线，新样片 24% 硬门槛由 Babylon 功能测试独立执行。

## 验证记录

- `npm run test:coverage -- --run`：45 个文件、443 项测试通过；Statements 91.14%、Branches 82.65%、Functions 87.70%、Lines 95.09%。
- `node --test scripts/compare-render-baselines.test.mjs`：4/4 通过。
- `VITE_RENDERER=three npm run build`：通过，Three vendor 534.18 kB，无 Babylon 泄漏，无 E2E 诊断全局变量。
- `VITE_RENDERER=babylon npm run build`：通过，Babylon vendor 1,725.39 kB，低于 1.8 MB 显式上限，无 Three/postprocessing 泄漏，无 E2E 诊断全局变量。
- `VITE_RENDERER=three ... production-render.spec.ts`：7/7 通过。
- `VITE_RENDERER=babylon ... babylon-gate.spec.ts`：7/7 通过；包含真实资源释放循环和带答案身份的未定年侧室导航。
- 未定年侧室导航用例以 20 ms 输入采样连续重复 5 次通过，避免持续旋转越过小标本造成的假阴性。
- Three/Babylon `metal-performance render-baseline.spec.ts`：各 1/1 通过；确定性比较器通过。
- `npm run lint`、`npx tsc -b --pretty false`、E2E TypeScript：通过。
- `go test ./...`、`go test -race ./...`、`go vet ./...`：通过。
- `npm audit --omit=dev --registry=https://registry.npmjs.org`：0 个已知生产依赖漏洞。

## 已解决的迁移风险

- 补入 Babylon Ray 注册模块，修复“画面可见但所有星体无法拾取”。
- 工作台打开时解绑相机控制，避免旧指针捕获吞掉 DOM 按钮。
- 问题近景与地层 HUD 不再将按钮指针误判为拖动；透明触控区支持轻点拾取和拖动观察共存。
- 修正相机恢复顺序，先恢复 target，再恢复 alpha/beta/radius，保留用户主动旋转姿态。
- 洞窟阶段停止追随仍在后台更新的公转行星，移动、吸附和标本聚焦姿态保持在主井坐标系。
- 生命周期门禁改为拦截浏览器真实 Canvas context、RAF 和 EventTarget 注册，并执行 5 次完整销毁重挂载。
- 标本诊断携带 `answerId` 与房间类型，E2E 会下潜、转向侧室并拾取 `answer:999`，不再以任意可见标本代替。
- 主井、通道与侧室的不透明几何均参与拾取遮挡，标本只有通过真实开口形成视线时才会被诊断为可点击。
- 洞窟内壁启用双面光照并下倾初始视线，解决近乎纯黑的内壁。
- 普通产物会扫描并拒绝 `__MINDVERSE_E2E__`，诊断代码在非 E2E 构建中被编译期删除。
