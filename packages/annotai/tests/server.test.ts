/** 验证源码服务的 HTTP 鉴权、路径边界、快照一致性与真实请求协议 */
import type { SourceRecord } from '@annotai/protocol'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { createServer as createHttpServer, request as httpRequest } from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { createSourceIndex } from '../src/core/source-index.js'
import { createSourceService } from '../src/server/index.js'

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
