/**
 * 端到端验收：真实 Vite 插件、源码服务、示例页面与 headless Neovim
 * 使用独立端口与自有 Neovim 实例，不依赖本机已开启的开发服务或编辑器窗口
 */
import { defineConfig, devices } from '@playwright/test'
import { E2E_BASE_URL, E2E_PORT, NVIM_SOCKET } from './tests/e2e/nvim.js'

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  outputDir: 'artifacts/e2e',
  // 共用一个 Neovim 实例与系统剪贴板，串行执行避免相互干扰
  workers: 1,
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: E2E_BASE_URL,
    locale: 'zh-CN',
    permissions: ['clipboard-read', 'clipboard-write'],
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm --filter annotai... build && pnpm --filter annotai-site exec vite --host 127.0.0.1 --port ${E2E_PORT} --strictPort`,
    url: E2E_BASE_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { NVIM: NVIM_SOCKET },
  },
})
