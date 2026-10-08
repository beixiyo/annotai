/** 浏览器与宿主共享的数据协议，不依赖框架或运行环境 */
import type { SourceRecord } from './types.js'

/** 经服务端核实的源码上下文 */
export interface SourceContext {
  source: SourceRecord
  path: string
  snippet: string
  startLine: number
}

/** 可配置的上下文字段 */
export interface ContextOptions {
  /** @default true */
  sourceLocation: boolean
  /** @default true */
  sourceSnippet: boolean
  /** @default true */
  className: boolean
  /** @default true */
  text: boolean
  /** @default false */
  domPath: boolean
}

/** 界面与 Markdown 导出的语言。 @default 'en' */
export type Locale = 'zh' | 'en'

/** 打开编辑器的修饰键组合 */
export type HotKey = 'altKey' | 'shiftKey' | 'ctrlKey' | 'metaKey'

/** 悬停源码预览的尺寸选项 */
export interface HoverPreviewOptions {
  /** 预览卡宽度（像素）。 @default 560 */
  width?: number
  /** 源码片段最多显示的行数；预览请求会按此行数向服务端取片段。 @default 20 */
  maxLines?: number
}

/** 注入浏览器的会话配置；可选字段由浏览器客户端统一归一化 */
export interface ClientConfig {
  /** 源码服务的请求地址 */
  endpoint: string
  /** 源码服务生成的会话 token */
  token: string
  /** 上下文字段覆盖。 @default 位置、片段、类名、文本开启，DOM 路径关闭 */
  context?: Partial<ContextOptions>
  /** 空数组会关闭快捷键。 @default ['altKey', 'shiftKey'] */
  hotKeys?: HotKey[]
  /** 界面与 Markdown 导出的语言。 @default 'en' */
  locale?: Locale
  /** 自定义复制内容；缺省导出内置 Markdown。函数在浏览器执行，须自包含（不引用闭包或 Node API） */
  formatCopy?: CopyFormatter
  /** 悬停元素时在其右侧显示源码预览；按住热键或打开面板时悬停触发。传对象可同时配置预览卡尺寸。 @default true */
  hoverPreview?: boolean | HoverPreviewOptions
  /** 面板视觉覆盖：淡出透明度与 CSS 变量。 @default 内置主题 */
  theme?: PanelTheme
  /** 是否启用交互动画；系统减少动态效果偏好始终优先。 @default true */
  animation?: boolean
}

/** 自定义复制钩子的输入：全部标注与当前字段开关 */
export interface CopyContext {
  annotations: Annotation[]
  fields: ContextOptions
}

/** 面板视觉覆盖；未提供的键沿用内置主题（浅色/深色跟随系统） */
export interface PanelTheme {
  /** 选择模式下指针在页面上工作时面板的不透明度，范围 0~1；1 表示不淡出。 @default 0.4 */
  dimOpacity?: number
  /**
   * 覆盖内置 CSS 自定义属性：键为 --sn-* 变量名（须含 -- 前缀），值原样写入工具根节点
   * 可覆盖面板色板（--sn-panel/--sn-surface/--sn-hover/--sn-text/--sn-muted/--sn-subtle/--sn-line/
   * --sn-primary/--sn-on-primary/--sn-focus/--sn-shadow/--sn-font/--sn-mono）、
   * 选择高亮（--sn-highlight/--sn-highlight-bg/--sn-highlight-hover/--sn-highlight-hover-bg/
   * --sn-highlight-label/--sn-highlight-label-hover/--sn-drag-line/--sn-drag-bg）、
   * 悬停预览（--sn-preview-bg/--sn-preview-active）与全部语法高亮 token 色（--sn-tok-*）
   * 设置后不再跟随系统深浅色切换
   */
  vars?: Record<string, string>
}

/** 自定义剪贴板内容；返回值原样复制。不可 JSON 序列化，仅由 Vite 插件以源码内联传递 */
export type CopyFormatter = (context: CopyContext) => string

/** 一次捕获的元素与源码快照 */
export interface CapturedTarget {
  context: SourceContext
  text: string
  className: string
  domPath: string
}

/** 一组目标及其问题 */
export interface Annotation {
  id: string
  question: string
  targets: CapturedTarget[]
}
