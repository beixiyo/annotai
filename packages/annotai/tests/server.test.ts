/** 验证源码服务的 HTTP 鉴权、路径边界、快照一致性与真实请求协议 */
import type { SourceRecord } from '@annotai/protocol'
import { realpathSync } from 'node:fs'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createSourceIndex } from '../src/core/source-index.js'
import type { EditorTarget } from '../src/editors/index.js'
import { createSourceService } from '../src/server/index.js'
import { reactTransform } from '../src/transforms/react.js'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

test('真实 HTTP 请求解析索引 ID并返回源码上下文', async () => {
  const root = await fixture()
  const file = path.join(root, 'App.tsx')
  const source = 'export const App = () => <div className="card">你好</div>\n'
  await writeFile(file, source)
  const record = recordFor(file, source, 'div-1')
  const index = createSourceIndex()
  index.replace(file, [record])
  const service = createSourceService({ index, roots: [root], projectRoot: root, readSource: () => source, surroundingLines: 0 })
  const http = createHttpServer(service.middleware)
  const address = await listen(http)
  cleanups.push(async () => {
    service.close()
    await close(http)
    await rm(root, { recursive: true, force: true })
  })

  const valid = await post(address.port, service.token, { action: 'resolve', ids: [record.id] })
  expect(valid.status).toBe(200)
  expect(valid.body.sources[0]).toMatchObject({ path: 'App.tsx', snippet: source.trimEnd(), startLine: record.start.line })

  const unauthorized = await post(address.port, 'wrong', { action: 'resolve', ids: [record.id] })
  expect(unauthorized.status).toBe(401)
  const crossOrigin = await post(address.port, service.token, { action: 'resolve', ids: [record.id] }, 'http://attacker.test')
  expect(crossOrigin.status).toBe(403)
  const oversized = await post(address.port, service.token, { action: 'resolve', ids: [record.id], padding: 'x'.repeat(140_000) })
  expect(oversized.status).toBe(413)
})

test('使用处明文路径可 resolve 与 open，位置精确匹配登记记录', async () => {
  const root = await fixture()
  const file = path.join(root, 'App.tsx')
  const source = 'export const App = () => <main><Widget /></main>\n'
  await writeFile(file, source)
  // 真实转换管线产出使用处记录：位置与明文路径同源，等价于 DOM 属性反查
  const result = reactTransform.transform({ code: source, file, environment: 'client' })
  const index = createSourceIndex()
  index.replace(file, result.sources)
  const opened: EditorTarget[] = []
  const service = createSourceService({
    index,
    roots: [root],
    projectRoot: root,
    readSource: () => source,
    editor: {
      open: (target) => {
        opened.push(target)
      },
    },
    surroundingLines: 0,
  })
  const http = createHttpServer(service.middleware)
  const address = await listen(http)
  cleanups.push(async () => {
    service.close()
    await close(http)
    await rm(root, { recursive: true, force: true })
  })

  const widget = result.sources.find((record) => record.tag === 'Widget')!
  expect(widget).toBeTruthy()
  const usePath = `${file}:${widget.start.line}:${widget.start.column}`

  const valid = await post(address.port, service.token, { action: 'resolve', usePaths: [usePath] })
  expect(valid.status).toBe(200)
  expect(valid.body.sources[0].source).toMatchObject({ tag: 'Widget', start: { line: widget.start.line, column: widget.start.column } })
  expect(valid.body.sources[0].snippet).toBe(source.trimEnd())

  // 混合请求：ids 段与 usePaths 段各自命中，响应顺序与请求段序一致
  const main = result.sources.find((record) => record.tag === 'main')!
  const mixed = await post(address.port, service.token, { action: 'resolve', ids: [main.id], usePaths: [usePath] })
  expect(mixed.status).toBe(200)
  expect(mixed.body.sources.map((context: { source: SourceRecord }) => context.source.tag)).toEqual(['main', 'Widget'])
  // 回显原始明文引用：source.file 已被规范化，客户端关联不能依赖重建路径字符串
  expect(mixed.body.sources[1].usePath).toBe(usePath)

  // 位置未命中任何登记记录：与过期 ID 同等对待，不读取任意路径
  const stale = await post(address.port, service.token, { action: 'resolve', usePaths: [`${file}:${widget.start.line + 5}:${widget.start.column}`] })
  expect(stale.status).toBe(409)
  expect(stale.body.error).toBe('stale-source')

  const jump = await post(address.port, service.token, { action: 'open', usePath })
  expect(jump.status).toBe(200)
  // 编辑器拿到的是校验后的真实路径（macOS 临时目录会解 /var 到 /private/var）
  expect(opened).toEqual([{ file: realpathSync(file), line: widget.start.line, column: widget.start.column }])

  const notFound = await post(address.port, service.token, { action: 'open', usePath: `${file}:99:9` })
  expect(notFound.status).toBe(404)

  const invalid = await post(address.port, service.token, { action: 'resolve', usePaths: [42] })
  expect(invalid.status).toBe(400)
  expect(invalid.body.error).toBe('invalid-use-paths')
})

test('磁盘内容与登记快照不一致时返回 409，未知 ID 不读取任意路径', async () => {
  const root = await fixture()
  const file = path.join(root, 'App.tsx')
  const source = 'export const App = () => <main />\n'
  await writeFile(file, source)
  const record = recordFor(file, source, 'main-1')
  const index = createSourceIndex()
  index.replace(file, [record])
  let snapshot = source
  const service = createSourceService({ index, roots: [root], projectRoot: root, readSource: () => snapshot })
  const http = createHttpServer(service.middleware)
  const address = await listen(http)
  cleanups.push(async () => {
    service.close()
    await close(http)
    await rm(root, { recursive: true, force: true })
  })

  await writeFile(file, source.replace('<main />', '<section />'))
  const stale = await post(address.port, service.token, { action: 'resolve', ids: [record.id] })
  expect(stale.status).toBe(409)
  snapshot = source.replace('<main />', '<section />')
  const oldId = await post(address.port, service.token, { action: 'resolve', ids: ['unknown-id'] })
  expect(oldId.status).toBe(409)
  expect(oldId.body.error).toBe('stale-source')
})

test('resolve 支持按次覆盖片段行数，非法值返回 400', async () => {
  const root = await fixture()
  const file = path.join(root, 'App.tsx')
  const lines = Array.from({ length: 30 }, (_, index) => `line-${index + 1}`)
  const source = lines.join('\n')
  await writeFile(file, source)
  const target = 'line-15'
  const offset = source.indexOf(target)
  const record: SourceRecord = {
    id: 'div-lines',
    file,
    tag: 'span',
    start: { line: 15, column: 1, offset },
    end: { line: 15, column: target.length + 1, offset: offset + target.length },
  }
  const index = createSourceIndex()
  index.replace(file, [record])
  const service = createSourceService({ index, roots: [root], projectRoot: root, readSource: () => source, surroundingLines: 0 })
  const http = createHttpServer(service.middleware)
  const address = await listen(http)
  cleanups.push(async () => {
    service.close()
    await close(http)
    await rm(root, { recursive: true, force: true })
  })

  // 按次覆盖：±10 → 21 行；服务级默认 0 在同一服务上仍然生效
  const wide = await post(address.port, service.token, { action: 'resolve', ids: [record.id], surroundingLines: 10 })
  expect(wide.status).toBe(200)
  expect(wide.body.sources[0].startLine).toBe(5)
  expect(wide.body.sources[0].snippet.split('\n')).toHaveLength(21)

  const narrow = await post(address.port, service.token, { action: 'resolve', ids: [record.id] })
  expect(narrow.status).toBe(200)
  expect(narrow.body.sources[0].snippet).toBe('line-15')

  const invalid = await post(address.port, service.token, { action: 'resolve', ids: [record.id], surroundingLines: -1 })
  expect(invalid.status).toBe(400)
  expect(invalid.body.error).toBe('invalid-surrounding-lines')
})

function recordFor(file: string, source: string, id: string): SourceRecord {
  const startOffset = source.indexOf('<')
  const endOffset = source.indexOf('>', startOffset) + 1
  return {
    id,
    file,
    tag: 'div',
    start: { line: 1, column: startOffset + 1, offset: startOffset },
    end: { line: 1, column: endOffset + 1, offset: endOffset },
  }
}

async function fixture() {
  return await mkdtemp(path.join(os.tmpdir(), 'annotai-server-'))
}

async function listen(server: ReturnType<typeof createHttpServer>) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolve)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('HTTP server 未监听')
  return address
}

async function close(server: ReturnType<typeof createHttpServer>) {
  if (!server.listening) return
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
}

async function post(port: number, token: string, body: unknown, origin?: string) {
  return await new Promise<{ status: number; body: any }>((resolve, reject) => {
    const payload = JSON.stringify(body)
    const request = httpRequest({
      hostname: '127.0.0.1',
      port,
      method: 'POST',
      path: '/__annotai',
      headers: {
        authorization: `Bearer ${token}`,
        origin: origin ?? `http://127.0.0.1:${port}`,
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(payload),
      },
    }, (response) => {
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
      response.on('end', () => resolve({ status: response.statusCode ?? 0, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }))
    })
    request.once('error', reject)
    request.end(payload)
  })
}
