/** 编辑器跳转配置与适配器契约 */

/** 跳转目标；行列均为 1 基，列按 UTF-16 单元计（与 IDE 光标一致） */
export interface EditorTarget {
  file: string
  line: number
  column: number
}

/** 跳转时可用的项目上下文 */
export interface EditorContext {
  projectRoot: string
  /** 读取源码内容；Neovim 适配器用它把 UTF-16 列换算为字节列，自定义钩子也可使用 */
  readSource?: (file: string) => string | undefined
}

/** 自定义编辑器：拿到完整跳转信息，自行决定如何打开（spawn、launch-ide、URL scheme 等） */
export type EditorOpen = (target: EditorTarget, context: EditorContext) => void | Promise<void>

/** 编辑器配置：传 open 为自定义；缺省或 name 为 nvim 时使用内置 Neovim 适配器 */
export type EditorConfig =
  | { open: EditorOpen }
  | { name?: 'nvim'; server?: string }

/** 统一编辑器适配器 */
export interface SourceEditor {
  open(target: EditorTarget): Promise<void>
}
