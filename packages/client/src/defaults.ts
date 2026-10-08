/** 客户端配置的唯一归一化边界；宿主只透传可选字段，Markdown 导出复用同一默认值 */
import type { ClientConfig, ContextOptions, HotKey, HoverPreviewOptions, Locale, PanelTheme } from '@annotai/protocol'
import type { NormalizedClientConfig, NormalizedTheme } from './types.js'

/** 上下文字段默认值；与 protocol 中 ContextOptions 的 @default 注释保持一致 */
export const defaultContext: ContextOptions = {
  sourceLocation: true,
  sourceSnippet: true,
  className: true,
  text: true,
  domPath: false,
}

/** 默认语言 */
export const defaultLocale: Locale = 'en'

/** 选择模式下指针在页面上工作时面板的默认不透明度 */
export const defaultDimOpacity = 0.3

/** 默认的打开编辑器组合键 */
export const defaultHotKeys: readonly HotKey[] = ['altKey', 'shiftKey']

/** 是否默认启用悬停预览 */
export const defaultHoverPreviewEnabled = true

/** 悬停预览卡默认宽度（像素） */
export const defaultHoverPreviewWidth = 560

/** 悬停预览片段默认最多显示行数 */
export const defaultHoverPreviewMaxLines = 20

function normalizeHoverPreview(input: boolean | HoverPreviewOptions | undefined) {
  const options = typeof input === 'object' ? input : {}
  return {
    enabled: input === undefined ? defaultHoverPreviewEnabled : input !== false,
    width: options.width ?? defaultHoverPreviewWidth,
    maxLines: options.maxLines ?? defaultHoverPreviewMaxLines,
  }
}

/** 只接受 -- 开头的合法自定义属性名，其余键忽略；透明度钳制到 0~1 */
function normalizeTheme(theme: PanelTheme | undefined): NormalizedTheme {
  const vars: Record<string, string> = {}
  for (const [name, value] of Object.entries(theme?.vars ?? {})) {
    if (/^--[\w-]+$/.test(name)) vars[name] = value
  }
  const rawOpacity = theme?.dimOpacity ?? defaultDimOpacity
  return { dimOpacity: Math.min(Math.max(rawOpacity, 0), 1), vars }
}

/** 填充可选字段并复制数组，避免宿主配置被客户端状态修改 */
export function normalizeClientConfig(input: ClientConfig): NormalizedClientConfig {
  return {
    endpoint: input.endpoint,
    token: input.token,
    context: { ...defaultContext, ...input.context },
    hotKeys: [...(input.hotKeys ?? defaultHotKeys)],
    animation: input.animation ?? true,
    hoverPreview: normalizeHoverPreview(input.hoverPreview),
    locale: input.locale ?? defaultLocale,
    theme: normalizeTheme(input.theme),
    formatCopy: input.formatCopy,
  }
}
