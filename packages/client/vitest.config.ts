/** 客户端测试：Markdown 在 Node 运行，DOM 与动画在真实 Chromium 运行 */
import tailwindcss from '@tailwindcss/vite'
import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'
import type { BrowserCommand } from 'vitest/node'

/** 切换系统动态效果偏好；动画测试据此验证减少动态效果的实时响应 */
const emulateMedia: BrowserCommand<[{ reducedMotion: 'reduce' | 'no-preference' }]> = async ({ page }, options) => {
  await page.emulateMedia(options)
}

export default defineConfig({
  plugins: [tailwindcss()],
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: 'node',
          include: ['tests/markdown.test.ts'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'browser',
          include: ['tests/**/*.test.ts'],
          exclude: ['tests/markdown.test.ts'],
          browser: {
            enabled: true,
            provider: playwright(),
            instances: [{ browser: 'chromium' }],
            commands: { emulateMedia },
          },
        },
      },
    ],
  },
})
