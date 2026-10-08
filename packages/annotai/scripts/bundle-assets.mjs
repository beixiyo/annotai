/**
 * 构建后自包含化：把内部包产物与仓库门面文档并入发布 dist，使 annotai 单包可安装
 * - 复制浏览器客户端 bundle 为 dist/adapters/client.browser.js（vite.ts 优先读同目录资产）
 * - 复制 protocol 的 d.ts 到 dist/protocol/，并把 dist 内 d.ts 对协议包的引用改写为相对路径
 * - 同步根 README 进包（npm 页面展示；源文件以仓库根为唯一来源）
 * - 校验发布产物不再解析 workspace 包（客户端回退引用除外，它仅在开发态命中）
 */
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const pkgRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const repoRoot = path.resolve(pkgRoot, '../..')
const dist = path.join(pkgRoot, 'dist')
const clientBundle = path.join(pkgRoot, '../client/dist/browser.js')
const protocolDist = path.join(pkgRoot, '../protocol/dist')

if (!existsSync(clientBundle)) {
  console.error('[bundle-assets] 缺少 @annotai/client 产物，请先构建 client 包')
  process.exit(1)
}
if (!existsSync(protocolDist)) {
  console.error('[bundle-assets] 缺少 @annotai/protocol 产物，请先构建 protocol 包')
  process.exit(1)
}

copyFileSync(clientBundle, path.join(dist, 'adapters', 'client.browser.js'))
mkdirSync(path.join(dist, 'protocol'), { recursive: true })
for (const file of readdirSync(protocolDist)) {
  if (file.endsWith('.d.ts')) copyFileSync(path.join(protocolDist, file), path.join(dist, 'protocol', file))
}

// README 特殊：npm 总是打包包根的 README.md；演示图后续走 GitHub release 链接，不进包
const readme = path.join(repoRoot, 'README.md')
if (existsSync(readme)) copyFileSync(readme, path.join(pkgRoot, 'README.md'))

/** dist 内每个 d.ts 相对自身到协议类型入口的路径 */
function relativeProtocolImport(file) {
  const from = path.dirname(path.join(dist, file))
  const to = path.join(dist, 'protocol', 'index.js')
  return path.relative(from, to).split(path.sep).join('/').replace(/^(?!\.)/, './')
}

function rewriteDeclarations(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'protocol') continue
      rewriteDeclarations(full)
      continue
    }
    if (!entry.name.endsWith('.d.ts')) continue
    const relative = path.relative(dist, full)
    const source = readFileSync(full, 'utf8')
    if (!source.includes('@annotai/protocol')) continue
    const target = relativeProtocolImport(relative)
    writeFileSync(full, source.replaceAll('@annotai/protocol', target))
  }
}

rewriteDeclarations(dist)

let stale = 0
for (const file of readdirSync(dist, { recursive: true })) {
  const name = String(file)
  if (!name.endsWith('.d.ts') || name.includes('protocol')) continue
  if (readFileSync(path.join(dist, name), 'utf8').includes('@annotai/protocol')) {
    console.error(`[bundle-assets] d.ts 仍引用协议包: ${name}`)
    stale += 1
  }
}
if (stale > 0) process.exit(1)
console.log('[bundle-assets] annotai dist 已自包含（client bundle + protocol 类型已内联）')
