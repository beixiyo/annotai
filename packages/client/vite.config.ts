/** 客户端库统一由 Vite 构建；CSS 内联供 Shadow DOM 使用 */
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [tailwindcss()],
  build: {
    target: 'es2022',
    lib: {
      entry: 'src/index.ts',
      formats: ['es'],
      fileName: () => 'browser.js',
    },
    rolldownOptions: {
      output: { codeSplitting: false },
    },
  },
})
