/** Neovim 远程跳转；通过 nvim --remote-expr 传递结构化参数，不经过 shell */
import { spawn } from 'node:child_process'
import { realpathSync } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { isWithin } from '../core/paths.js'
import type { EditorContext, EditorTarget, SourceEditor } from './types.js'

const RPC_TIMEOUT_MS = 2_000

/** 创建 Neovim 编辑器适配器 */
/** 自动发现失败（没有任何可用 Neovim 实例）时抛出；宿主可据此回退到其他编辑器 */
export class NvimServerNotFoundError extends Error {
  constructor(projectRoot: string) {
    super(`No Neovim instance found for project ${projectRoot}`)
    this.name = 'NvimServerNotFoundError'
  }
}

/** 创建 Neovim 编辑器；server 未设置时按 NVIM 环境变量与项目 cwd 自动发现 */
export function createNvimEditor(options: { server?: string }, context: EditorContext): SourceEditor {
  return {
    async open(target) {
      const server = await selectServer(options.server, context.projectRoot, target.file)
      const source = context.readSource?.(target.file)
      const line = source === undefined ? undefined : getLine(source, target.line)
      const byteColumn = line === undefined ? Math.max(0, target.column - 1) : utf16ColumnToByte(line, target.column)
      const payload = JSON.stringify({ file: target.file, line: Math.max(1, target.line), byteColumn })
      const lua =
        '(function() local a=vim.json.decode(_A); vim.api.nvim_cmd({cmd=\'edit\',args={a.file}},{}); vim.api.nvim_win_set_cursor(0,{a.line,a.byteColumn}); return true end)()'
      const expression = `luaeval(${vimString(lua)}, ${vimString(payload)})`
      await runNvimExpression(server, expression)
    },
  }
}

/** 根据优先级查找适合项目的 Neovim server */
export async function selectServer(explicitServer: string | undefined, projectRoot: string, file: string): Promise<string> {
  if (explicitServer) {
    await assertServerAlive(explicitServer)
    return explicitServer
  }

  const environmentServer = process.env.NVIM
  if (environmentServer) {
    await assertServerAlive(environmentServer)
    return environmentServer
  }

  const candidates = await discoverServers()
  const canonicalFile = canonicalPath(file)
  const canonicalRoot = canonicalPath(projectRoot)
  const matches: Array<{ server: string; cwd: string; length: number }> = []
  let nextCandidate = 0
  // 限制并行探测数量，避免失效 socket 串行累加超时或同时启动大量进程
  await Promise.all(Array.from({ length: Math.min(8, candidates.length) }, async () => {
    while (nextCandidate < candidates.length) {
      const server = candidates[nextCandidate++]
      const value = await getServerCwd(server)
      if (!value) continue
      const cwd = canonicalPath(value)
      if (!isWithin(canonicalRoot, cwd) || !isWithin(cwd, canonicalFile)) continue
      matches.push({ server, cwd, length: cwd.length })
    }
  }))
  matches.sort((left, right) => right.length - left.length || left.server.localeCompare(right.server))
  if (matches[0]) return matches[0].server
  throw new NvimServerNotFoundError(projectRoot)
}

/** 用 Neovim 自己查询 server 的工作目录 */
async function getServerCwd(server: string) {
  try {
    return (await runNvimExpression(server, 'getcwd()')).trim()
  }
  catch {
    return undefined
  }
}

async function assertServerAlive(server: string) {
  await runNvimExpression(server, '1')
}

async function runNvimExpression(server: string, expression: string): Promise<string> {
  return await new Promise((resolve, reject) => {
    const child = spawn('nvim', ['--headless', '--server', server, '--remote-expr', expression], { stdio: ['ignore', 'pipe', 'pipe'] })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    let settled = false
    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      child.kill()
      reject(new Error(`Neovim server request timed out: ${server}`))
    }, RPC_TIMEOUT_MS)
    child.stdout.on('data', (chunk) => output.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => errors.push(Buffer.from(chunk)))
    child.once('error', (error) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      reject(error)
    })
    child.once('close', (code) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (code !== 0) {
        reject(new Error(errors.concat(output).map((item) => item.toString('utf8')).join('').trim() || `Neovim server exited with code ${code}`))
        return
      }
      resolve(Buffer.concat(output).toString('utf8'))
    })
  })
}

/** 扫描临时目录中的 Neovim socket；只探测 socket，不使用无关的最后存活实例 */
export async function discoverServers() {
  // Neovim 默认把 socket 放在 <tmpdir>/nvim.<user>/<pid>/ 下，递归深度 3 足以覆盖
  const roots = new Set([os.tmpdir(), '/tmp', process.env.XDG_RUNTIME_DIR ?? ''])
  const result = new Set<string>()
  for (const root of roots) if (root) await collectSockets(root, result, 3, path.basename(root).startsWith('nvim'))
  return [...result].sort()
}

async function collectSockets(directory: string, result: Set<string>, depth: number, insideNvim = false): Promise<void> {
  if (depth < 0) return
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  }
  catch {
    return
  }
  await Promise.all(entries.map(async (entry) => {
    const file = path.join(directory, entry.name)
    if (entry.isSymbolicLink()) return
    if (entry.name.startsWith('nvim') && (entry.isSocket() || await isSocket(file))) {
      result.add(file)
      return
    }
    if (entry.isDirectory() && (insideNvim || entry.name.startsWith('nvim'))) await collectSockets(file, result, depth - 1, true)
  }))
}

async function isSocket(file: string) {
  try {
    return (await lstat(file)).isSocket()
  }
  catch {
    return false
  }
}

function getLine(source: string, line: number) {
  return source.split(/\r?\n/)[line - 1]
}

/** 把源码协议的一基 UTF-16 列转换为 Neovim 的零基 UTF-8 字节列 */
export function utf16ColumnToByte(line: string, column: number) {
  const target = Math.max(0, column - 1)
  let units = 0
  let bytes = 0
  for (const character of line) {
    if (units >= target || units + character.length > target) break
    units += character.length
    bytes += Buffer.byteLength(character, 'utf8')
  }
  return bytes
}

function vimString(value: string) {
  return `'${value.replaceAll('\'', '\'\'')}'`
}

function canonicalPath(file: string) {
  try {
    return realpathSync(file)
  }
  catch {
    return path.resolve(file)
  }
}
