/**
 * Prism 全局挂载：grammar 组件文件引用自由变量 Prism（浏览器由主包挂到 window，Node SSR 没有）
 * 需要高亮的模块先 import 本文件再 import components，ESM 按声明顺序执行保证挂载先行
 */
import Prism from 'prismjs'
;(globalThis as Record<string, unknown>).Prism = Prism
