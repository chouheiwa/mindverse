# 知见宇宙 Mindverse

知见宇宙把用户的知乎创作与收藏足迹组织成可回链的认知宇宙：私有概念是恒星，真实知乎问题是行星，回答是卫星，文章是探测器。当前版本重点是“先证据，后解释”：每个公开实体都可回到原页，数据不足时不补齐观点。

## 运行

需要 Go 1.25 和 Node.js。默认使用 `testdata/` 中的 mock 语料，无需凭证。

```bash
npm --prefix frontend ci
npm --prefix frontend run build
go run ./cmd/server
```

服务默认侦听 `http://127.0.0.1:4173`，项目入口是 `/`，私人宇宙页是 `/universe.html`，公开分享页是 `/s/{id}`。

真实用户数据依赖知乎 OAuth 和公网 HTTPS 回调。凭证只能通过环境变量注入，不应写入仓库：

```bash
export MINDVERSE_SOURCE=live
export ZHIHU_OAUTH_APP_ID=...
export ZHIHU_OAUTH_APP_KEY=...
export ZHIHU_ACCESS_SECRET=...
export ZHIHU_OAUTH_REDIRECT_URI=https://your-domain.example/auth/callback
go run ./cmd/server
```

`localhost` 或 `127.0.0.1` 回调只能预览，不会被界面标记为已可完成真实登录。

## 验证

```bash
go test ./...
go test -race ./...
go vet ./...
npm --prefix frontend test -- --run
npm --prefix frontend run test:coverage
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run test:e2e
npm --prefix frontend audit --registry=https://registry.npmjs.org --audit-level=high
```

`frontend` 构建会同时验证产物分包：公开分享路径不得静态加载 Three.js、私人宇宙或个人工作台，且单个 JavaScript 块不得超过 500,000 字节。

`test:e2e` 先生成隔离的生产构建，再由 Go 静态路由启动 Chromium；功能、首帧、降级恢复与检查旅程固定使用 SwiftShader，中/低画质性能预算则仅在 Darwin Metal 硬件上运行（非 Darwin 明确跳过）。两类项目互斥，不会重复执行 30 秒性能用例。它覆盖真实 WebGL 首帧、高/中/低画质、512 颗问题行星与 300 个文章探测器的压力预算，以及 Renderer chunk、WebGL 和 Shader 初始化失败时的降级页。降级页的「重试 3D」会在当前页重建渲染器；「返回首页」是无 WebGL 时的永久 fallback 入口。

## 探测器操作

在恒星面板的「文章探测器 · 旁轨材料」中选择「检查探测器」。近景中可用左键拖动旋转、右键拖动平移、滚轮缩放；触屏支持单指旋转和双指缩放/平移。所有操作都有 DOM 按钮等价入口，键盘可用方向键、`+`/`-` 与 `Esc`；部件按钮可直接聚焦主舱、天线等组件。主动扫描完成后只开放当前文章的原文链接。

文章探测器是恒星概念旁的独立材料，产品不会由共现位置生成或暗示任何「文章—问题」关联。

## 分享与隐私

分享默认不选任何内容。用户逐项选择问题后，服务端先返回真正的白名单预览；只有选择未改变且预览摘要仍匹配时才能创建链接。公开视图只包含所选问题及其公开回答字段，不包含私有恒星、个人绑定、收藏/创作区分、采集时间或文章探测器。

分享所有权与服务器签发的高熵会话绑定；未知 cookie 从不会被接受为会话 ID。OAuth 成功时认证会话始终旋转。如果旧会话拥有公开分享，`owner-registry.v2` 会在安装 token 前原子写入「新 ID = primary、旧 ID = recovery」；旧 cookie 只能撤销原 owner 已有的分享或清理该 owner 的全部分享，不能读取 OAuth 状态、私人宇宙或发起新任务。新 cookie 的首次私有请求会确认 primary 并删除 recovery；如回调响应中断，recovery 保留到分享过期或撤销，但始终不具备认证权限。OAuth token 和私人宇宙只存内存，不落盘。`data/snapshots/` 当前是服务端持久化目录：`*.json` 是可撤销的公开分享快照，`.sessions` 每个实际 share owner 最多保存一个 primary 和一个 recovery 哈希；容量仍按 owner 而非 alias 计数。匿名访问、OAuth 状态、token 和私人 GET 不会写入该索引。升级时如果索引缺失、损坏或版本过旧，服务会一次性隔离无法证明撤销权的旧公开分享，原链接随即返回 404，隔离文件保留 `owner-proof-missing` 原因供审计。这些运行时文件均不应提交；当前 HTTP 链路尚未接入私人认知快照持久化。

## 文档

- [融合产品设计](docs/superpowers/specs/2026-08-30-知见宇宙融合产品-design.md)
- [问题行星基础链路计划](docs/superpowers/plans/2026-08-30-知见宇宙承重层.md)
- [当前实现状态与边界](docs/implementation/2026-08-31-知见宇宙承重层-status.md)
- [项目本地设计上下文](.impeccable.md)
