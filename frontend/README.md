# Mindverse frontend

React 19 + TypeScript + Vite 前端。完整的启动、验证、OAuth 与隐私说明见项目根目录 [README](../README.md)。

```bash
npm ci
npm test -- --run
npm run lint
npm run build
```

`npm run build` 将多页应用输出到 `../web/`，生成 manifest，并执行公开/私人模块边界与分块大小检查。
