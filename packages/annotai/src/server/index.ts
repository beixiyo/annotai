/** 受宿主挂载的源码服务；只接受索引 ID，不接受任意文件路径 */
import type { SourceContext, SourceRecord } from '@annotai/protocol'
import { randomBytes, timingSafeEqual } from 'node:crypto'
import { readFileSync, realpathSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { isWithin } from '../core/paths.js'
import type { SourceIndex } from '../core/source-index.js'
import { createEditor } from '../editors/index.js'
import type { EditorConfig } from '../editors/index.js'

const MAX_BODY_BYTES = 128 * 1024
const MAX_IDS = 100
const MAX_SNIPPET_CHARS = 12_000

/** 源码服务配置 */
export interface SourceServiceOptions {
  index: SourceIndex
  roots: string[]
  projectRoot: string
  readSource: (file: string) => string | undefined
  editor?: EditorConfig
  /** @default 4 */
  surroundingLines?: number
}

/** 可挂到任意 Node HTTP 宿主的源码服务 */
export interface SourceService {
  token: string
  /** 只处理 POST；其他请求交给 next，作为独立 handler 挂载时回复 404 */
  middleware: (request: IncomingMessage, response: ServerResponse, next?: () => void) => void
  close: () => void
}

/** 创建源码解析与编辑器跳转服务。宿主负责将 middleware 挂到具体 endpoint */
export function createSourceService(options: SourceServiceOptions): SourceService {
  const roots = options.roots.map(resolveExistingPath)
  const projectRoot = resolveExistingPath(options.projectRoot)
  const token = randomBytes(32).toString('hex')
  const editor = createEditor(options.editor, { projectRoot, readSource: options.readSource })
  const surroundingLines = normalizeSurroundingLines(options.surroundingLines)
  let closed = false

  const middleware = (request: IncomingMessage, response: ServerResponse, next?: () => void) => {
    if (request.method !== 'POST') {
      if (next) next()
      else sendJson(response, 404, { error: 'not-found' })
      return
    }
    void handleRequest(request, response).catch((error) => {
      if (response.headersSent) {
        response.destroy(error instanceof Error ? error : undefined)
        return
      }
      if (error instanceof HttpError) {
        sendJson(response, error.status, { error: error.code })
        return
      }
      sendJson(response, 500, { error: 'internal-error' })
    })
  }

  return {
    token,
    middleware,
    close() {
      closed = true
    },
  }

  async function handleRequest(request: IncomingMessage, response: ServerResponse) {
    if (closed) {
      sendJson(response, 503, { error: 'service-closed' })
      return
    }
    if (!hasToken(request.headers.authorization, token)) {
      sendJson(response, 401, { error: 'unauthorized' })
      return
    }
    if (!sameOrigin(request)) {
      sendJson(response, 403, { error: 'origin-forbidden' })
      return
    }
    const contentType = request.headers['content-type']
    if (contentType && !contentType.toLowerCase().startsWith('application/json')) {
      sendJson(response, 415, { error: 'json-required' })
      return
    }
    const body = await readBody(request)
    let input: unknown
    try {
      input = JSON.parse(body)
    }
    catch {
      sendJson(response, 400, { error: 'invalid-json' })
      return
    }
    if (!isRecord(input) || (input.action !== 'resolve' && input.action !== 'open')) {
      sendJson(response, 400, { error: 'invalid-action' })
      return
    }
    if (input.action === 'resolve') {
      if (!Array.isArray(input.ids) || input.ids.length > MAX_IDS || input.ids.some((id) => typeof id !== 'string')) {
        sendJson(response, 400, { error: 'invalid-ids' })
        return
      }
      // 预览等调用方可按次覆盖片段行数；缺省用服务配置
      let requestLines = surroundingLines
      if (input.surroundingLines !== undefined) {
        const value = input.surroundingLines
        if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 100) {
          sendJson(response, 400, { error: 'invalid-surrounding-lines' })
          return
        }
        requestLines = value
      }
      // 全有或全无：任一 ID 过期即整体 409，客户端据此提示重新选择
      const sources: SourceContext[] = []
      for (const id of dedupe(input.ids)) {
        const record = options.index.resolveSource(id)
        const context = record && await resolveContext(record, requestLines)
        if (!context) {
          sendJson(response, 409, { error: 'stale-source', id })
          return
        }
        sources.push(context)
      }
      sendJson(response, 200, { sources })
      return
    }
    if (typeof input.id !== 'string' || input.id.length > 512) {
      sendJson(response, 400, { error: 'invalid-id' })
      return
    }
    const record = options.index.resolveSource(input.id)
    if (!record) {
      sendJson(response, 404, { error: 'source-not-found' })
      return
    }
    const context = await resolveContext(record)
    if (!context) {
      sendJson(response, 409, { error: 'stale-source', id: input.id })
      return
    }
    try {
      await editor.open({ file: context.source.file, line: record.start.line, column: record.start.column })
    }
    catch (error) {
      sendJson(response, 502, { error: 'editor-failed', message: error instanceof Error ? error.message : String(error) })
      return
    }
    sendJson(response, 200, { ok: true })
  }

  /** 核对真实路径、磁盘内容与登记快照后返回上下文；任一不符即视为过期 */
  async function resolveContext(record: SourceRecord, lines = surroundingLines): Promise<SourceContext | undefined> {
    const safeFile = await validateFile(record.file)
    if (!safeFile) return undefined
    const source = readCurrentSource(safeFile)
    if (!source || !isCurrentPosition(source, record.start) || !isCurrentPosition(source, record.end)) return undefined
    const allLines = source.split(/\r?\n/)
    const startLine = Math.max(1, record.start.line - lines)
    const endLine = Math.min(allLines.length, record.start.line + lines)
    const rawSnippet = allLines.slice(startLine - 1, endLine).join('\n')
    const snippet = rawSnippet.length > MAX_SNIPPET_CHARS ? `${rawSnippet.slice(0, MAX_SNIPPET_CHARS)}\n…` : rawSnippet
    return {
      source: { ...record, file: safeFile },
      path: toProjectPath(projectRoot, safeFile),
      snippet,
      startLine,
    }
  }

  async function validateFile(file: string) {
    if (!path.isAbsolute(file)) return undefined
    let canonical: string
    try {
      canonical = realpathSync(file)
    }
    catch {
      return undefined
    }
    if (!roots.some((root) => isWithin(root, canonical))) return undefined
    try {
      if (!statSync(canonical).isFile()) return undefined
    }
    catch {
      return undefined
    }
    return canonical
  }

  function readCurrentSource(file: string) {
    let disk: string
    let snapshot: string | undefined
    try {
      disk = readFileSync(file, 'utf8')
      snapshot = options.readSource(file)
    }
    catch {
      return undefined
    }
    // readSource 是宿主登记的转换快照；二者不一致时拒绝旧 ID，避免打开错误源码
    return snapshot !== undefined && disk === snapshot ? disk : undefined
  }
}

function resolveExistingPath(value: string) {
  return realpathSync(path.resolve(value))
}

function normalizeSurroundingLines(value: number | undefined) {
  if (value === undefined) return 4
  if (!Number.isInteger(value) || value < 0) throw new Error('surroundingLines must be a non-negative integer')
  return Math.min(value, 100)
}

function hasToken(header: string | string[] | undefined, expected: string) {
  const value = Array.isArray(header) ? header[0] : header
  if (!value?.startsWith('Bearer ')) return false
  const actual = Buffer.from(value.slice(7))
  const wanted = Buffer.from(expected)
  return actual.length === wanted.length && timingSafeEqual(actual, wanted)
}

function sameOrigin(request: IncomingMessage) {
  const origin = request.headers.origin
  if (!origin) return true
  const host = request.headers.host
  if (!host) return false
  try {
    const parsed = new URL(origin)
    const protocol = 'encrypted' in request.socket && Boolean((request.socket as { encrypted?: boolean }).encrypted) ? 'https:' : 'http:'
    return parsed.protocol === protocol && parsed.host.toLowerCase() === host.toLowerCase()
  }
  catch {
    return false
  }
}

async function readBody(request: IncomingMessage) {
  const length = Number(request.headers['content-length'])
  if (Number.isFinite(length) && length > MAX_BODY_BYTES) {
    request.resume()
    throw new HttpError(413, 'body-too-large')
  }
  return await new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    request.on('data', (chunk) => {
      const buffer = Buffer.from(chunk)
      size += buffer.length
      if (size > MAX_BODY_BYTES) {
        tooLarge = true
        return
      }
      chunks.push(buffer)
    })
    request.once('error', reject)
    request.once('end', () => {
      if (tooLarge) {
        reject(new HttpError(413, 'body-too-large'))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })
  })
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === 'object' && value !== null
}

function dedupe(ids: string[]) {
  return [...new Set(ids)]
}

function isCurrentPosition(source: string, position: { line: number; column: number; offset: number }) {
  if (position.line < 1 || position.column < 1 || position.offset < 0 || position.offset > source.length) return false
  const before = source.slice(0, position.offset)
  const line = before.split(/\r?\n/).length
  const lastBreak = Math.max(before.lastIndexOf('\n'), before.lastIndexOf('\r'))
  const column = position.offset - lastBreak
  return line === position.line && column === position.column
}

function toProjectPath(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative ? relative.split(path.sep).join('/') : '.'
}

class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code)
  }
}
