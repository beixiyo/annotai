/** 浏览器客户端内部状态；协议类型直接从 @annotai/protocol 导入 */
import type { Annotation, CapturedTarget, ClientConfig, ContextOptions, CopyFormatter, HotKey, Locale, PanelTheme } from '@annotai/protocol'

export interface Point {
  x: number
  y: number
}

export interface ClientState {
  open: boolean
  selecting: boolean
  dragging: boolean
  /** 正在等待源码服务返回当前选择的上下文 */
  loading: boolean
  dragStart?: Point
  dragEnd?: Point
  hoveredElement?: Element
  selectedElements: Element[]
  selectedTargets: CapturedTarget[]
  annotations: Annotation[]
  fields: ContextOptions
  question: string
  status: string
}

/** 归一化后的悬停预览配置 */
export interface NormalizedHoverPreview {
  enabled: boolean
  /** 预览卡宽度（像素） */
  width: number
  /** 源码片段最多显示的行数 */
  maxLines: number
}

/** 归一化后的配置：可选字段全部有值 */
export interface NormalizedClientConfig extends Required<Pick<ClientConfig, 'endpoint' | 'token' | 'animation'>> {
  context: ContextOptions
  hotKeys: HotKey[]
  hoverPreview: NormalizedHoverPreview
  locale: Locale
  theme: NormalizedTheme
  /** 自定义复制钩子；由 Vite 插件以源码内联传递，直接挂载时也可传入 */
  formatCopy?: CopyFormatter
}

/** 归一化后的主题：透明度钳制到 0~1，变量表为副本 */
export interface NormalizedTheme extends Required<Pick<PanelTheme, 'dimOpacity'>> {
  vars: Record<string, string>
}
