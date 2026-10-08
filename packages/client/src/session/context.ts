/** 会话共享上下文：跨模块传递的只读资源与装配层回填的心跳函数 */
import type { MotionController } from '../animation.js'
import type { HighlightLayer } from '../highlights.js'
import type { Translator } from '../i18n.js'
import type { ClientState, NormalizedClientConfig } from '../types.js'
import type { HoverPreviewRequest } from './hover-preview.js'
import type { RequestLifecycle } from './requests.js'

export interface SessionContext {
  readonly state: ClientState
  readonly normalized: NormalizedClientConfig
  /** 宿主节点；事件命中判断与临时挂载使用 */
  readonly host: HTMLElement
  readonly shadow: ShadowRoot
  readonly panel: HTMLElement
  readonly highlights: HighlightLayer
  readonly motion: MotionController
  readonly requests: RequestLifecycle
  /** 文案翻译器；由装配层按归一化 locale 创建 */
  readonly t: Translator
  /** 会话是否已卸载；卸载后事件处理与请求回写全部失效 */
  isDisposed(): boolean
  /** 状态变更后重渲染面板并同步高亮；由渲染协调模块提供 */
  render(): void
  /** 同步高亮层到当前选择状态；由高亮协调模块提供 */
  updateHighlights(immediate?: boolean): void
  /** 面板淡出/恢复；选择模式下指针在页面上工作时淡出，避免遮挡视线 */
  dimPanel(dimmed: boolean): void
  /** 悬停源码预览；由 hover-preview 模块提供 */
  readonly preview: HoverPreviewRequest
}
