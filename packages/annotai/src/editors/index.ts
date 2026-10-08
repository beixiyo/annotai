/** 编辑器适配器入口；服务层只依赖这个框架无关接口 */
import { launchIDE } from 'launch-ide'
import { createNvimEditor, NvimServerNotFoundError } from './nvim.js'
import type { EditorConfig, EditorContext, EditorOpen, EditorTarget, SourceEditor } from './types.js'

/**
 * 根据配置创建编辑器：
 * - 传 open 钩子时完全自定义
 * - 否则使用内置 Neovim；自动发现无实例时回退 launch-ide 检测运行中的 IDE（显式 server / NVIM 失败不回退）
 */
export function createEditor(config: EditorConfig = {}, context: EditorContext): SourceEditor {
  if ('open' in config && config.open) {
    const open: EditorOpen = config.open
    return {
      async open(target: EditorTarget) {
        await open(target, context)
      },
    }
  }

  const server = 'server' in config ? config.server : undefined
  const nvim = createNvimEditor({ server }, context)
  // 回退到 IDE 是多数用户（VS Code 等）的常规路径，提示只打印一次，避免每次跳转刷屏
  let fallbackNoticed = false
  return {
    async open(target) {
      try {
        await nvim.open(target)
      }
      catch (error) {
        if (!(error instanceof NvimServerNotFoundError)) throw error
        if (!fallbackNoticed) {
          fallbackNoticed = true
          console.warn('[annotai] No Neovim instance found; falling back to the running IDE. Set CODE_EDITOR to pick an editor, or use editor.open to customize the jump')
        }
        launchIDE({
          file: target.file,
          line: Math.max(1, target.line),
          column: Math.max(1, target.column),
          onError: (_file, message) => {
            console.error(`[annotai] launch-ide failed to open: ${message}`)
          },
        })
      }
    },
  }
}

export { createNvimEditor, discoverServers, NvimServerNotFoundError, selectServer, utf16ColumnToByte } from './nvim.js'
export type { EditorConfig, EditorContext, EditorOpen, EditorTarget, SourceEditor } from './types.js'
