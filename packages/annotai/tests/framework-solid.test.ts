/** 验证 Solid JSX 复用原生元素注入，且不改写组件调用与 props */
import { transformSync } from '@babel/core'
import { parse } from '@babel/parser'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import { createRequire } from 'node:module'
import { renderToString } from 'solid-js/web'
import { expect, test } from 'vitest'
import { solidTransform } from '../src/transforms/solid.js'

const require = createRequire(import.meta.url)
const solidPreset = require('babel-preset-solid')

test('Solid JSX 原生元素可定位，组件调用保持原样', async () => {
  const code = `const Button = props => <button {...props}>保存</button>
export const App = () => <section><Button title="按钮" /><div>你好</div></section>`
  const result = solidTransform.transform({ code, file: '/project/App.tsx', environment: 'client' })
  parse(result.code, { sourceType: 'module', plugins: ['jsx', 'typescript'] })

  expect(result.sources.map((source) => source.tag)).toEqual(['button', 'section', 'div'])
  expect(result.code).toContain('<Button title="按钮" />')
  expect(result.code).not.toContain('<Button data-annotai=')
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
  expect(html).toContain('>你好</div>')
  const generatedColumn = result.code.indexOf('你好')
  const original = originalPositionFor(new TraceMap(result.map), { line: 2, column: generatedColumn - result.code.lastIndexOf('\n', generatedColumn) - 1 })
  expect(original.line).toBe(2)
  expect(original.column).toBe(code.indexOf('你好') - code.lastIndexOf('\n', code.indexOf('你好')) - 1)
})
