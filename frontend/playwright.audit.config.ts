// 审计用的一次性配置：复用主配置的 webServer 与 SwiftShader 启动参数，
// 只把 testMatch 换成审计 spec。跑完即删，不进仓库。
import base from './playwright.config'
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  ...base,
  projects: [{
    name: 'audit',
    testMatch: /audit-(stability|probe)\.spec\.ts/,
    use: {
      ...devices['Desktop Chrome'],
      launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
    },
  }],
})
