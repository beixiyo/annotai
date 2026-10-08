/** 启动供跳转验收使用的 headless Neovim，测试结束后关闭并清理 socket */
import { spawn } from 'node:child_process'
import { rm, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NVIM_SOCKET } from './nvim.js'

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

export default async function globalSetup() {
  await rm(NVIM_SOCKET, { force: true })
  const nvim = spawn('nvim', ['--headless', '--listen', NVIM_SOCKET, '-u', 'NONE', '-i', 'NONE'], { cwd: repoRoot, stdio: 'ignore' })
  const failed = new Promise<never>((_, reject) => nvim.once('error', (error) => reject(new Error(`E2E 需要本机 nvim: ${error.message}`))))
  await Promise.race([failed, waitForSocket()])
  return async () => {
    nvim.kill()
    await rm(NVIM_SOCKET, { force: true })
  }
}

async function waitForSocket() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await stat(NVIM_SOCKET)
      return
    }
    catch {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }
  }
  throw new Error(`Neovim socket 未启动: ${NVIM_SOCKET}`)
}
