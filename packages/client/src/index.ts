/** 浏览器客户端入口：装配会话各模块，管理挂载与卸载 */
import type { ClientConfig } from '@annotai/protocol'
import { createMotionController } from './animation.js'
import { normalizeClientConfig } from './defaults.js'
import { element } from './dom.js'
import { createHighlightLayer } from './highlights.js'
import { createTranslator } from './i18n.js'
import { applyLauncherPosition, clampLauncherPosition, readLauncherPosition } from './launcher.js'
import { createActions } from './session/actions.js'
import type { SessionContext } from './session/context.js'
import { createHighlightSync } from './session/highlight-sync.js'
import { createHoverPreview } from './session/hover-preview.js'
import { createInteractions } from './session/interactions.js'
import { createRenderLoop } from './session/render-loop.js'
import { createRequestLifecycle } from './session/requests.js'
import { styles } from './styles.js'
import type { ClientState } from './types.js'

export { SourceServiceError } from './dom.js'
export { annotationsToMarkdown } from './markdown.js'
export type { MarkdownOptions } from './markdown.js'

/**
 * 宿主事件边界：面板内产生的这些事件在宿主冒泡阶段截停，不再外泄到页面
 * - 键盘、输入、组合输入与剪贴板：避免页面全局快捷键与“是否在输入”判断失效
 * - 按下、点击与焦点进出：避免页面的点击外部关闭等逻辑误触发
 * annotai 自身的全局监听均在 capture 阶段注册，先于此处触发，不受影响
 * 刻意不拦截 pointermove/pointerup/mouseup/wheel：页面进行中的拖拽可能经过面板结束，滚动也应照常工作
 */
const HOST_BOUNDARY_EVENTS = [
  'keydown',
  'keyup',
  'keypress',
  'beforeinput',
  'input',
  'compositionstart',
  'compositionupdate',
  'compositionend',
  'copy',
  'cut',
  'paste',
  'pointerdown',
  'mousedown',
  'touchstart',
  'click',
  'dblclick',
  'auxclick',
  'contextmenu',
  'focusin',
  'focusout',
] as const

/**
 * 挂载源码标注浏览器工具栏
 * 返回幂等卸载函数；卸载后会取消动画、移除全局事件监听器和 Shadow DOM
 */
export function mountAnnotai(config: ClientConfig): () => void {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {}

  const normalized = normalizeClientConfig(config)
  const host = document.createElement('div')
  host.dataset.annotaiUi = ''
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    zIndex: String(Number.MAX_SAFE_INTEGER),
    pointerEvents: 'none',
  })
  const stopAtHost = (event: Event) => event.stopPropagation()
  for (const type of HOST_BOUNDARY_EVENTS) host.addEventListener(type, stopAtHost)
  const shadow = host.attachShadow({ mode: 'open' })
  if (document.body) document.body.append(host)
  else document.documentElement.append(host)

  const state: ClientState = {
    open: false,
    selecting: false,
    dragging: false,
    loading: false,
    annotations: [],
    selectedElements: [],
    selectedTargets: [],
    fields: { ...normalized.context },
    question: '',
    status: '',
  }
  // 主题变量写入工具根节点：内联优先级高于 :host 规则与深浅色媒体查询，设置后固定使用
  for (const [name, value] of Object.entries(normalized.theme.vars)) host.style.setProperty(name, value)
  const motion = createMotionController(normalized.animation)
  let disposed = false

  const style = document.createElement('style')
  style.textContent = styles
  shadow.append(style)
  const overlay = element('div', 'annotai-overlay')
  shadow.append(overlay)
  const highlights = createHighlightLayer(overlay, motion)
  const panel = document.createElement('section')
  panel.className = 'annotai-panel'
  shadow.append(panel)

  // 心跳函数在装配后可用；模块只在事件与流程中调用它们，创建时不触发
  const t = createTranslator(normalized.locale)
  // 常驻页面的独立工具区域：用 region 加可访问名称暴露为地标，状态播报由面板内状态行负责
  host.setAttribute('role', 'region')
  host.setAttribute('aria-label', t('panelTitle'))
  // 选择模式下指针在页面上工作时面板淡出，回到面板或结束选择后恢复；透明度变化交给 CSS 过渡，透明度可由 theme.dimOpacity 配置
  let dimmed = false
  const dimPanel = (value: boolean) => {
    if (dimmed === value) return
    dimmed = value
    panel.style.opacity = value ? String(normalized.theme.dimOpacity) : ''
  }
  const ctx: SessionContext = {
    t,
    state,
    normalized,
    host,
    shadow,
    panel,
    highlights,
    motion,
    requests: createRequestLifecycle(() => disposed),
    isDisposed: () => disposed,
    render: () => renderLoop.render(),
    updateHighlights: (immediate) => highlightSync.updateHighlights(immediate),
    dimPanel,
    preview: { request: (target, options) => preview.request(target, options) },
  }
  const preview = createHoverPreview(ctx)
  const highlightSync = createHighlightSync(ctx, preview.syncPosition)
  const actions = createActions(ctx)
  const events = createInteractions(ctx, actions)
  const renderLoop = createRenderLoop(ctx, actions)

  renderLoop.render()
  const storedPosition = readLauncherPosition()
  if (storedPosition) applyLauncherPosition(panel, clampLauncherPosition(storedPosition, panel))
  document.addEventListener('pointermove', events.onPointerMove, true)
  document.addEventListener('pointerdown', events.onPointerDown, true)
  document.addEventListener('pointerup', events.onPointerUp, true)
  document.addEventListener('click', events.onClick, true)
  window.addEventListener('keyup', events.onHotKeyUp, true)
  window.addEventListener('keydown', events.onKeyDown, true)
  window.addEventListener('resize', highlightSync.syncHighlights)
  window.addEventListener('resize', renderLoop.clampPanelIntoView)
  window.addEventListener('scroll', highlightSync.syncHighlights, true)

  return () => {
    if (disposed) return
    disposed = true
    ctx.requests.cancel()
    highlights.clear()
    motion.dispose()
    preview.dispose()
    actions.cancelPending()
    events.dispose()
    renderLoop.dispose()
    for (const type of HOST_BOUNDARY_EVENTS) host.removeEventListener(type, stopAtHost)
    host.remove()
    document.removeEventListener('pointermove', events.onPointerMove, true)
    document.removeEventListener('pointerdown', events.onPointerDown, true)
    document.removeEventListener('pointerup', events.onPointerUp, true)
    document.removeEventListener('click', events.onClick, true)
    window.removeEventListener('keyup', events.onHotKeyUp, true)
    window.removeEventListener('keydown', events.onKeyDown, true)
    window.removeEventListener('resize', highlightSync.syncHighlights)
    window.removeEventListener('resize', renderLoop.clampPanelIntoView)
    window.removeEventListener('scroll', highlightSync.syncHighlights, true)
  }
}
