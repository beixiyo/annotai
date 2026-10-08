/** 验证真实 React/Vite 管线的定位契约，避免只断言生成代码字符串 */
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'
import react from '@vitejs/plugin-react'
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { build, createServer } from 'vite'
import { afterEach, expect, test } from 'vitest'
import { annotate } from '../src/adapters/vite.js'
import { createSourceIndex } from '../src/core/source-index.js'
import { reactTransform } from '../src/transforms/react.js'

const cleanups: (() => Promise<unknown>)[] = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

test('React 渲染保留组件边界和业务属性，DOM 标记解析到原始元素', async () => {
  const root = await fixture()
  const code = `import React from 'react'
function Button(props) { return <button {...props}>提交</button> }
export default function App() {
  return <><Button title="保存" /><svg><path d="M0 0" /></svg></>
}`
  await writeFile(path.join(root, 'App.tsx'), code)
  const plugin = annotate()
  const server = await createServer({ root, configFile: false, plugins: [plugin, react()], server: { middlewareMode: true }, appType: 'custom' })
  cleanups.push(() => server.close())
  const module = await server.ssrLoadModule('/App.tsx')
  const html = renderToStaticMarkup(createElement(module.default))
  expect(html).toContain('title="保存"')
  const ids = [...html.matchAll(/data-annotai="([^"]+)"/g)].map((match) => match[1])
  expect(ids).toHaveLength(3)
  const records = ids.map((id) => plugin.api.resolveSource(id))
  expect(records.map((record) => record?.tag)).toEqual(['button', 'svg', 'path'])
  expect(records[0]?.start.line).toBe(2)
  expect(records[0]?.start.column).toBe(33)
  expect(records[0]?.file).toBe(path.join(root, 'App.tsx'))
  // DOM 同时携带明文位置，无需请求服务即可读取
  const paths = [...html.matchAll(/data-annotai-path="([^"]+)"/g)].map((match) => match[1])
  expect(paths).toEqual(records.map((record) => `${record!.file}:${record!.start.line}:${record!.start.column}`))
})

test('业务代码声明保留属性时拒绝转换', () => {
  for (const attribute of ['data-annotai', 'data-annotai-path']) {
    expect(() => reactTransform.transform({ code: `export const App = () => <div ${attribute}="x" />`, file: '/project/App.tsx', environment: 'client' }))
      .toThrow(`${attribute} is reserved`)
  }
})

test('转换输出提供原始位置映射，且不改写组件 props', () => {
  const code = 'export const App = () => <Widget><div>你好</div></Widget>'
  const result = reactTransform.transform({ code, file: '/project/App.tsx', environment: 'client' })
  expect(result.sources.map((source) => source.tag)).toEqual(['div'])
  const generatedColumn = result.code.indexOf('你好')
  const original = originalPositionFor(new TraceMap(result.map), { line: 1, column: generatedColumn })
  expect(original.column).toBe(code.indexOf('你好'))
  const source = result.sources[0]
  expect(code.slice(source.start.offset, source.end.offset)).toBe('<div>你好</div>')
})

test('跨进程序列化结果可以登记，快照隔离且重复失效安全', () => {
  const input = { file: '/project/App.tsx', code: 'export const App = () => <main />', environment: 'client' as const }
  const result = JSON.parse(JSON.stringify(reactTransform.transform(input)))
  const index = createSourceIndex()
  index.replace(input.file, result.sources)
  const id = result.sources[0].id
  result.sources[0].tag = 'corrupted'
  index.getSources(input.file)[0].tag = 'corrupted'
  expect(index.resolveSource(id)?.tag).toBe('main')
  index.invalidate(input.file)
  index.invalidate(input.file)
  expect(index.resolveSource(id)).toBeUndefined()
})

test('Vite 更新替换索引，资源查询与允许目录外文件不注入', async () => {
  const root = await fixture()
  const file = path.join(root, 'App.tsx')
  await writeFile(file, 'export default () => <div />')
  const plugin = annotate()
  const server = await createServer({
    root,
    configFile: false,
    plugins: [plugin, react()],
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, preTransformRequests: false },
  })
  cleanups.push(() => server.close())
  await server.transformRequest('/App.tsx')
  const old = plugin.api.getSources(file)[0]
  expect(old.tag).toBe('div')
  await writeFile(file, 'export default () => <section />')
  server.moduleGraph.invalidateAll()
  await server.transformRequest('/App.tsx')
  expect(plugin.api.resolveSource(old.id)).toBeUndefined()
  expect(plugin.api.getSources(file).map((source) => source.tag)).toEqual(['section'])
  const raw = await server.transformRequest('/App.tsx?raw')
  expect(raw?.code).not.toContain('data-annotai')
  const external = await mkdtemp(path.join(process.cwd(), '.external-'))
  cleanups.push(() => rm(external, { recursive: true, force: true }))
  await writeFile(path.join(external, 'Outside.tsx'), 'export default () => <aside />')
  await symlink(path.join(external, 'Outside.tsx'), path.join(root, 'Linked.tsx'))
  await server.transformRequest('/Linked.tsx')
  expect(plugin.api.getSources(path.join(external, 'Outside.tsx'))).toEqual([])
})

test('生产构建不包含开发定位标记', async () => {
  const root = await fixture()
  await writeFile(path.join(root, 'App.tsx'), 'import React from "react"; export const App = () => <div />')
  const output = await build({
    root,
    configFile: false,
    plugins: [annotate(), react()],
    logLevel: 'silent',
    build: { write: false, lib: { entry: path.join(root, 'App.tsx'), formats: ['es'] } },
  })
  const results = Array.isArray(output) ? output : [output]
  for (const result of results) {
    if (!('output' in result)) throw new Error('Expected build output')
    for (const item of result.output) {
      if (item.type === 'chunk') expect(item.code).not.toContain('data-annotai')
    }
  }
})

async function fixture() {
  const root = await mkdtemp(path.join(process.cwd(), '.fixture-'))
  cleanups.push(() => rm(root, { recursive: true, force: true }))
  return root
}
