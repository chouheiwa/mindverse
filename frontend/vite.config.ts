import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { relative, resolve } from 'node:path'
import { assertSafeBuildOutput } from './buildOutputSafety.js'

const configDir = fileURLToPath(new URL('.', import.meta.url))
const projectRoot = resolve(configDir, '..')
const deployOutputDir = resolve(projectRoot, 'web')
const e2eOutputDir = resolve(projectRoot, '.e2e-web')
const requestedOutputDir = process.env.MINDVERSE_BUILD_DIR
const isolatedBuild = requestedOutputDir !== undefined
if (isolatedBuild && resolve(configDir, requestedOutputDir) !== e2eOutputDir) {
  throw new Error('MINDVERSE_BUILD_DIR may only select the isolated ../.e2e-web directory')
}
const buildOutputDir = isolatedBuild ? e2eOutputDir : deployOutputDir
const allowedOutputName = isolatedBuild ? '.e2e-web' : 'web'
const assertOutputSafety = () => assertSafeBuildOutput(projectRoot, buildOutputDir, allowedOutputName)

// Config-load gate: no Vite plugin (and therefore no buildStart cleanup) can run first.
assertOutputSafety()

// 多页构建：保持 Go 侧路由不变（/ 与 /universe.html，/s/{id} 复用后者）。
// 普通产物落进 web/，Go 用 http.FileServer 提供；E2E 产物隔离到 .e2e-web/。
//
// 普通构建的 emptyOutDir 必须关掉 —— web/ 下还有手工维护的 static/。但只关掉它，
// 带哈希名的旧产物会一直堆积（构建十次就攒十份 universe-*.js）。
// 所以普通构建单独清 assets/；E2E 路径不执行任何手动删除。
function cleanAssets(dir: string, assertSafe: () => void): Plugin {
  return {
    name: 'clean-assets',
    apply: 'build',
    buildStart() {
      assertSafe()
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
  plugins: [
    react(),
    // E2E output is ignored and may retain old hashed files; never delete through that path.
    ...(isolatedBuild ? [{
      name: 'assert-safe-isolated-output',
      apply: 'build' as const,
      buildStart: assertOutputSafety,
    }] : [cleanAssets(resolve(buildOutputDir, 'assets'), assertOutputSafety)]),
    emitBuildMetadata(),
  ],
  base: '/',
  build: {
    outDir: buildOutputDir,
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
