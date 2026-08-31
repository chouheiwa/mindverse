import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'

const configDir = fileURLToPath(new URL('.', import.meta.url))
const deployOutputDir = resolve(configDir, '../web')
const e2eOutputDir = resolve(configDir, '../.e2e-web')
const requestedOutputDir = process.env.MINDVERSE_BUILD_DIR
const isolatedBuild = requestedOutputDir !== undefined
if (isolatedBuild && resolve(configDir, requestedOutputDir) !== e2eOutputDir) {
  throw new Error('MINDVERSE_BUILD_DIR may only select the isolated ../.e2e-web directory')
}
const buildOutputDir = isolatedBuild ? e2eOutputDir : deployOutputDir

// 多页构建：保持 Go 侧路由不变（/ 与 /universe.html，/s/{id} 复用后者）。
// 普通产物落进 web/，Go 用 http.FileServer 提供；E2E 产物隔离到 .e2e-web/。
//
// 普通构建的 emptyOutDir 必须关掉 —— web/ 下还有手工维护的 static/。但只关掉它，
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

function emitBuildMetadata(): Plugin {
  const portableModuleId = (moduleId: string) => {
    if (moduleId.startsWith('\0')) return moduleId
    const normalized = moduleId.replaceAll('\\', '/')
    const nodeModulesIndex = normalized.lastIndexOf('/node_modules/')
    if (nodeModulesIndex >= 0) return normalized.slice(nodeModulesIndex + 1)
    return relative(configDir, moduleId).replaceAll('\\', '/')
  }

  return {
    name: 'emit-build-metadata',
    apply: 'build',
    generateBundle(_options, bundle) {
      const chunks = Object.values(bundle)
        .filter((output) => output.type === 'chunk')
        .map((chunk) => ({
          file: chunk.fileName,
          name: chunk.name,
          imports: chunk.imports,
          dynamicImports: chunk.dynamicImports,
          moduleIds: Object.keys(chunk.modules).map(portableModuleId),
        }))
      this.emitFile({
        type: 'asset',
        fileName: '.vite/build-metadata.json',
        source: JSON.stringify({ chunks }, null, 2),
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), cleanAssets(resolve(buildOutputDir, 'assets')), emitBuildMetadata()],
  base: '/',
  build: {
    outDir: buildOutputDir,
    emptyOutDir: isolatedBuild,
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
