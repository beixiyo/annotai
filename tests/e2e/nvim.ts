/** E2E 共用的地址常量与 Neovim 查询；socket 路径固定，供 Vite 进程通过 NVIM 环境变量定位 */
import { execFile } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'

export const E2E_PORT = 9983
export const E2E_BASE_URL = `http://127.0.0.1:${E2E_PORT}/`
/** macOS 对 Unix socket 路径长度有限制，放在临时目录根部并使用短文件名 */
export const NVIM_SOCKET = path.join(os.tmpdir(), 'annotai-e2e.sock')

const execFileAsync = promisify(execFile)

/** 在 E2E 的 Neovim 实例上求值并返回 JSON 解析后的结果 */
export async function queryNvim<T>(expression: string): Promise<T> {
  const { stdout } = await execFileAsync('nvim', ['--headless', '--server', NVIM_SOCKET, '--remote-expr', `json_encode(${expression})`])
  return JSON.parse(stdout) as T
}
