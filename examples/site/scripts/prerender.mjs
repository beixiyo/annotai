/**
 * 预渲染：把 SSR 渲染结果注入客户端构建产物的 HTML 壳
 * 前置条件：vite build（客户端）与 vite build --ssr（本包 build script 已串联）
 */
import { readFile, writeFile } from 'node:fs/promises'
import { render } from '../dist/server/entry-server.js'

const HTML_PATH = new URL('../dist/index.html', import.meta.url)

const template = await readFile(HTML_PATH, 'utf8')
const appHtml = render()

if (!template.includes('<div id="root"></div>')) {
  throw new Error('dist/index.html 中未找到 #root 占位，请检查客户端构建产物')
}

const html = template.replace('<div id="root"></div>', `<div id="root">${appHtml}</div>`)
await writeFile(HTML_PATH, html)

console.log(`prerender: ${appHtml.length} 字符已注入 dist/index.html`)
