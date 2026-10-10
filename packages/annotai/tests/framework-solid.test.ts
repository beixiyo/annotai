/** 验证 Solid JSX 复用原生元素定位，组件使用处路径经改写传播到根节点 */
import { transformSync } from '@babel/core'
import { parse } from '@babel/parser'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { createRequire } from 'node:module'
import { renderToString } from 'solid-js/web'
import { expect, test } from 'vitest'
import { solidTransform } from '../src/transforms/solid.js'

const require = createRequire(import.meta.url)
const solidPreset = require('babel-preset-solid')

test('Solid JSX 原生元素可定位，组件使用处路径传播到根', async () => {
  const code = `const Button = props => <button {...props}>保存</button>
export const App = () => <section><Button title="按钮" /><div>你好</div></section>`
  const result = solidTransform.transform({ code, file: '/project/App.tsx', environment: 'client' })
  parse(result.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })
  const buttonColumn = code.indexOf('<Button') - code.lastIndexOf('\n', code.indexOf('<Button'))

  expect(result.sources.map((source) => source.tag)).toEqual(['button', 'section', 'Button', 'div'])
  // 组件标签注入使用处明文路径，业务 props 原样保留
  expect(result.code).toContain('<Button title="按钮"')
  expect(result.code).toContain(`data-annotai-use-path="/project/App.tsx:2:${buttonColumn}"`)
  expect(result.code).not.toContain('<Button data-annotai=')
  // 无参组件补隐式 props；标识符 props 直接读取，根元素带动态传播属性
  expect(result.code).toContain('(__annotaiProps) =>')
  expect(result.code).toContain('props && props["data-annotai-use-path"]')
  const compiled = transformSync(result.code, {
    filename: 'App.tsx',
    sourceType: 'module',
    presets: [[solidPreset, { generate: 'ssr' }]],
  })?.code
  if (!compiled) throw new Error('Solid compiler returned no code')
  const webModule = JSON.stringify(import.meta.resolve('solid-js/web'))
  const executable = compiled.replaceAll('"solid-js/web"', webModule)
  const module = await import(`data:text/javascript,${encodeURIComponent(executable)}`) as { App: () => unknown }
  const html = renderToString(() => module.App())
  expect(html).toContain('data-annotai=')
  expect(html).toContain('title="按钮"')
  // 渲染后使用处路径落在 Button 的根 button 上，与定义处标注共存
  expect(html).toContain(`data-annotai-use-path="/project/App.tsx:2:${buttonColumn}"`)
  expect(html).toContain('data-annotai-path="/project/App.tsx:1:25"')
  expect(html).toContain('>你好</div>')
  const generatedColumn = result.code.indexOf('你好')
  const original = originalPositionFor(new TraceMap(result.map), { line: 2, column: generatedColumn - result.code.lastIndexOf('\n', generatedColumn) - 1 })
  expect(original.line).toBe(2)
  expect(original.column).toBe(code.indexOf('你好') - code.lastIndexOf('\n', code.indexOf('你好')) - 1)
})
