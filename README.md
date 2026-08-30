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
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend audit --registry=https://registry.npmjs.org --audit-level=high
```

`frontend` 构建会同时验证产物分包：公开分享路径不得静态加载 Three.js、私人宇宙或个人工作台，且单个 JavaScript 块不得超过 500,000 字节。

## 分享与隐私

分享默认不选任何内容。用户逐项选择问题后，服务端先返回真正的白名单预览；只有选择未改变且预览摘要仍匹配时才能创建链接。公开视图只包含所选问题及其公开回答字段，不包含私有恒星、个人绑定、收藏/创作区分、采集时间或文章探测器。

分享所有权与服务器签发的高熵会话绑定；OAuth 成功后会旋转会话 ID，只有新会话可继续撤销已创建的分享。清除会话数据会级联撤销其全部分享。OAuth token 和私人宇宙只存内存，不落盘。`data/snapshots/` 当前是服务端持久化目录：`*.json` 是可撤销的公开分享快照，`.sessions` 只保存服务器签发会话的哈希索引与独立 owner 标识。这些运行时文件均不应提交；当前 HTTP 链路尚未接入私人认知快照持久化。

## 文档

- [融合产品设计](docs/superpowers/specs/2026-08-30-知见宇宙融合产品-design.md)
- [问题行星基础链路计划](docs/superpowers/plans/2026-08-30-知见宇宙承重层.md)
- [当前实现状态与边界](docs/implementation/2026-08-31-知见宇宙承重层-status.md)
- [项目本地设计上下文](.impeccable.md)
