/** 验证两个独立 headless Neovim 实例的 cwd 选择、源码行跳转和 UTF-16 列转换 */
import { spawn } from 'node:child_process'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, expect, test, vi } from 'vitest'
import { createNvimEditor, utf16ColumnToByte } from '../src/editors/index.js'

const cleanups: Array<() => Promise<unknown>> = []
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup()
})

test('自动选择项目 cwd 最匹配的实例并跳到源码行列', async () => {
  expect(utf16ColumnToByte('😀 target', 1)).toBe(0)
  const workspace = await mkdtemp(path.join(os.tmpdir(), 'nvim.sn-'))
  const projectA = path.join(workspace, 'project-a')
  const projectB = path.join(workspace, 'project-b')
  const file = path.join(projectB, 'App.tsx')
  await (await import('node:fs/promises')).mkdir(projectA)
  await (await import('node:fs/promises')).mkdir(projectB)
  const source = 'export const App = () => <div />\n😀 target\n'
  await writeFile(file, source)
  const nvimA = await launchNvim(projectA, path.join(workspace, 'nvim.a.sock'))
  const nvimB = await launchNvim(projectB, path.join(workspace, 'nvim.b.sock'))
  cleanups.push(async () => {
    nvimA.kill()
    nvimB.kill()
    await rm(workspace, { recursive: true, force: true })
  })

  await createNvimEditor({}, { projectRoot: workspace, readSource: () => source }).open({ file, line: 2, column: 3 })
  expect(await remote(nvimB.socket, 'string([bufname("%"),line("."),col(".")])')).toContain(`'${file}'`)
  expect(await remote(nvimB.socket, 'line(".")')).toBe('2')
  expect(await remote(nvimB.socket, 'col(".")')).toBe(String(utf16ColumnToByte('😀 target', 3) + 1))
  expect(await remote(nvimA.socket, 'bufname("%")')).toBe('')
})

test('显式 server 支持包含特殊字符的路径', async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), 'nvim.sn-'))
  const file = path.join(project, 'name with \'quote\'.tsx')
  const source = '😀 target\n'
  await writeFile(file, source)
  const nvim = await launchNvim(project, path.join(project, 'nvim.special.sock'))
  cleanups.push(async () => {
    nvim.kill()
    await rm(project, { recursive: true, force: true })
  })
  await createNvimEditor({ server: nvim.socket }, { projectRoot: project, readSource: () => source }).open({ file, line: 1, column: 3 })
  expect(await remote(nvim.socket, 'line(".")')).toBe('1')
  expect(await remote(nvim.socket, 'col(".")')).toBe('5')
})

async function launchNvim(cwd: string, socket: string) {
  const process = spawn('nvim', ['--headless', '--listen', socket, '-u', 'NONE', '-i', 'NONE'], { cwd, stdio: 'ignore' })
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      await stat(socket)
      return { process, socket, kill: () => process.kill() }
    }
    catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  process.kill()
  throw new Error(`Neovim socket 未启动: ${socket}`)
}

async function remote(socket: string, expression: string) {
  return await new Promise<string>((resolve, reject) => {
    const child = spawn('nvim', ['--headless', '--server', socket, '--remote-expr', expression], { stdio: ['ignore', 'pipe', 'pipe'] })
    const output: Buffer[] = []
    const errors: Buffer[] = []
    child.stdout.on('data', (chunk) => output.push(Buffer.from(chunk)))
    child.stderr.on('data', (chunk) => errors.push(Buffer.from(chunk)))
    child.once('error', reject)
    child.once(
      'close',
      (code) => code === 0 ? resolve(Buffer.concat(output).toString('utf8').trim()) : reject(new Error(Buffer.concat(errors).toString('utf8'))),
    )
  })
}

/** 自定义编辑器钩子：拿到完整跳转目标与项目上下文 */
test('自定义 open 钩子接收到目标行列与项目上下文', async () => {
  const calls: unknown[] = []
  const { createEditor } = await import('../src/editors/index.js')
  const editor = createEditor(
    {
      open: (target, context) => {
        calls.push({ ...target, root: context.projectRoot })
      },
    },
    { projectRoot: '/workspace/demo' },
  )

  await editor.open({ file: '/workspace/demo/App.tsx', line: 12, column: 3 })
  expect(calls).toEqual([{ file: '/workspace/demo/App.tsx', line: 12, column: 3, root: '/workspace/demo' }])
})

test('open 钩子抛错时跳转 Promise 拒绝', async () => {
  const { createEditor } = await import('../src/editors/index.js')
  const editor = createEditor({
    open: () => {
      throw new Error('boom')
    },
  }, { projectRoot: '/tmp' })
  await expect(editor.open({ file: '/tmp/a.ts', line: 1, column: 1 })).rejects.toThrow('boom')
})

/** 自动发现无实例时回退 launch-ide；显式 server 失败不回退 */
vi.mock('launch-ide', () => ({ launchIDE: vi.fn() }))

test('Neovim 自动发现无实例时回退 launch-ide 打开', async () => {
  const { launchIDE } = await import('launch-ide')
  const mock = vi.mocked(launchIDE)
  mock.mockClear()
  delete process.env.NVIM
  const { createEditor } = await import('../src/editors/index.js')
  vi.doMock('../src/editors/nvim.js', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../src/editors/nvim.js')>()
    return { ...actual, discoverServers: async () => [] as string[] }
  })

  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const editor = createEditor({}, { projectRoot: '/tmp/no-nvim-here' })
  await editor.open({ file: '/tmp/no-nvim-here/App.tsx', line: 5, column: 2 })
  await editor.open({ file: '/tmp/no-nvim-here/App.tsx', line: 6, column: 1 })
  expect(mock).toHaveBeenCalledWith(expect.objectContaining({ file: '/tmp/no-nvim-here/App.tsx', line: 5, column: 2 }))
  expect(mock).toHaveBeenCalledTimes(2)
  // 回退是 VS Code 等用户的常规路径，提示只打印一次
  expect(warn).toHaveBeenCalledTimes(1)
  warn.mockRestore()
  vi.doUnmock('../src/editors/nvim.js')
})

test('显式 server 失败时不回退 launch-ide，直接报错', async () => {
  const { launchIDE } = await import('launch-ide')
  vi.mocked(launchIDE).mockClear()
  const { createEditor } = await import('../src/editors/index.js')

  await expect(
    createEditor({ server: '/tmp/not-alive.sock' }, { projectRoot: '/tmp' }).open({ file: '/tmp/a.ts', line: 1, column: 1 }),
  ).rejects.toThrow()
  expect(vi.mocked(launchIDE)).not.toHaveBeenCalled()
})
