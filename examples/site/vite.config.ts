/** 官网构建：dogfood 自家 Vite 插件，预渲染产出纯静态 HTML */
import tailwindcss from '@tailwindcss/vite'
import { annotate } from 'annotai/vite'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [
    annotate({
      editor: { name: 'nvim' },
      locale: 'zh',
    }),
    solid({ ssr: true }),
    tailwindcss(),
  ],
  server: {
    /** 监听 0.0.0.0，局域网可访问 */
    host: true,
    port: 9981,
  },
})
