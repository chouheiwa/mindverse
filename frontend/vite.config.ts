import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const configDir = fileURLToPath(new URL('.', import.meta.url))

// 多页构建：保持 Go 侧路由不变（/ 与 /universe.html，/s/{id} 复用后者）。
// 产物直接落进 web/，Go 用 http.FileServer 提供。
//
// emptyOutDir 必须关掉 —— web/ 下还有手工维护的 static/。但只关掉它，
// 带哈希名的旧产物会一直堆积（构建十次就攒十份 universe-*.js）。
// 所以单独清 assets/，两边都要。
function cleanAssets(dir: string): Plugin {
  return {
    name: 'clean-assets',
    apply: 'build',
    buildStart() {
      rmSync(dir, { recursive: true, force: true })
    },
  }
}
export default defineConfig({
  plugins: [react(), cleanAssets(resolve(configDir, '../web/assets'))],
  base: '/',
  build: {
    outDir: resolve(configDir, '../web'),
    emptyOutDir: false,
    manifest: true,
    rolldownOptions: {
      input: {
        landing: resolve(configDir, 'index.html'),
        universe: resolve(configDir, 'universe.html'),
      },
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'three',
              test: /node_modules[\\/]three[\\/]/,
              priority: 2,
              includeDependenciesRecursively: false,
            },
            {
              name: 'postprocessing',
              test: /node_modules[\\/]postprocessing[\\/]/,
              priority: 1,
              includeDependenciesRecursively: false,
            },
          ],
        },
      },
    },
  },
  server: {
    // 开发时把接口代理到 Go 服务
    proxy: {
      '/api': 'http://127.0.0.1:4173',
      '/auth': 'http://127.0.0.1:4173',
    },
  },
})
