/** 悬停源码预览：停留计时、独立请求与元素右侧的预览卡 */
import type { SourceContext } from '@annotai/protocol'
import { element, sourceIdOf } from '../dom.js'
import type { SessionContext } from './context.js'
import { grammarFor, highlightLines } from './highlight.js'
import { request } from './requests.js'

/** 普通悬停后显示预览的停留延时（毫秒）；热键按下时跳过 */
const HOVER_DELAY = 300

/** 事件与动作清理预览所需的最小接口 */
export interface HoverPreviewRequest {
  /** 悬停目标变化；immediate 跳过停留延时（热键场景），undefined 清除 */
  request(target: Element | undefined, options?: { immediate?: boolean }): void
}

export interface HoverPreview extends HoverPreviewRequest {
  /** 视口滚动或缩放后重新对位 */
  syncPosition(): void
  dispose(): void
}

export function createHoverPreview(ctx: SessionContext): HoverPreview {
  const { state, normalized, shadow, isDisposed, updateHighlights } = ctx
  const { enabled, width, maxLines } = normalized.hoverPreview
  let target: Element | undefined
  let hoverTimer: ReturnType<typeof setTimeout> | undefined
  let pending: AbortController | undefined
  let card: HTMLElement | undefined

  function requestHover(next: Element | undefined, options?: { immediate?: boolean }) {
    if (!enabled) return
    if (next === target) {
      // 同一目标已在停留计时中且这次要求立即显示：提前触发
      if (next && options?.immediate && !card && hoverTimer !== undefined) {
        clearTimeout(hoverTimer)
        hoverTimer = undefined
        void show()
      }
      return
    }
    clearTimeout(hoverTimer)
    hoverTimer = undefined
    hideCard()
    abortPending()
    target = next
    if (!next) return
    if (options?.immediate) void show()
    else {hoverTimer = setTimeout(() => {
        hoverTimer = undefined
        void show()
      }, HOVER_DELAY)}
  }

  async function show() {
    const current = target
    if (isDisposed() || !current?.isConnected) return
    // 停留到点：先升级为悬停高亮，让用户明确预览指向的元素
    if (state.hoveredElement !== current) {
      state.hoveredElement = current
      updateHighlights()
    }
    const id = sourceIdOf(current)
    if (!id) return
    const controller = new AbortController()
    pending = controller
    try {
      const response = await request<{ sources: SourceContext[] }>(
        normalized,
        { action: 'resolve', ids: [id], surroundingLines: maxLines },
        controller.signal,
      )
      if (isDisposed() || target !== current || pending !== controller) return
      if (response.sources[0]) mountCard(response.sources[0])
    }
    catch {
      // 预览是被动辅助信息：请求失败或被中止时静默，不打断浏览
    }
  }

  function mountCard(context: SourceContext) {
    hideCard()
    card = element(
      'div',
      'annotai-hover-preview fixed max-w-[calc(100vw-24px)] rounded-xl border border-solid border-sn-line bg-sn-panel p-3 shadow-sn font-sn text-[12px] leading-[1.5] text-sn-text pointer-events-none',
    )
    card.style.width = `${width}px`
    // 标题用元素自身位置（含列），不是片段首行
    const location = element('div', 'mb-1.5 truncate font-sn-mono text-[11px] text-sn-muted')
    location.textContent = `${context.path}:${context.source.start.line}:${context.source.start.column}`
    card.append(location)
    if (context.snippet) {
      // 长行自动换行不横向裁切；行数超出限制时裁到 maxHeight（leading 1.5 × 12px = 18px/行）
      const code = element(
        'pre',
        'overflow-hidden rounded-lg p-2 font-sn-mono whitespace-pre-wrap break-words',
      )
      appendSnippetRows(code, context)
      code.style.maxHeight = `${maxLines * 18}px`
      card.append(code)
      // 追加并定位后把元素行滚进可视区；预览卡不可交互，须自动定位
      shadow.append(card)
      positionCard()
      scrollElementRowIntoView(code, context)
      return
    }
    shadow.append(card)
    positionCard()
  }

  /** 优先放元素右侧，右侧放不下翻到左侧，再钳制进视口 */
  function positionCard() {
    if (!card || !target?.isConnected) return
    const rect = target.getBoundingClientRect()
    const margin = 8
    let left = rect.right + margin
    if (left + card.offsetWidth > window.innerWidth - 12) left = rect.left - card.offsetWidth - margin
    card.style.left = `${Math.max(Math.round(left), 12)}px`
    // 元素靠下时卡片高度可能超出视口，顶部上限钳制
    const maxTop = Math.max(window.innerHeight - card.offsetHeight - 8, 8)
    card.style.top = `${Math.min(Math.max(Math.round(rect.top), 8), maxTop)}px`
  }

  function hideCard() {
    card?.remove()
    card = undefined
  }

  function abortPending() {
    pending?.abort()
    pending = undefined
  }

  function syncPosition() {
    if (card) positionCard()
  }

  function dispose() {
    clearTimeout(hoverTimer)
    hoverTimer = undefined
    abortPending()
    hideCard()
    target = undefined
  }

  return { request: requestHover, syncPosition, dispose }
}

/** 逐行渲染片段并高亮元素自身行，让目标位置在长上下文中一眼可见 */
function appendSnippetRows(code: HTMLElement, context: SourceContext) {
  const first = context.source.start.line - context.startLine
  const last = context.source.end.line - context.startLine
  // 语法高亮：已知扩展名逐行输出转义 HTML，未知扩展退回纯文本
  const grammar = grammarFor(context.path)
  const lines = grammar ? highlightLines(context.snippet, grammar) : context.snippet.split('\n')
  lines.forEach((line, index) => {
    const highlighted = index >= first && index <= last
    const row = element('div', highlighted ? 'annotai-preview-row-active px-2 -mx-2' : 'px-2 -mx-2')
    if (grammar) row.innerHTML = line.length > 0 ? line : ' '
    else row.textContent = line.length > 0 ? line : ' '
    code.append(row)
  })
}

/** 长上下文超出显示高度时把元素行滚进可视区；预览卡不可交互，须自动定位 */
function scrollElementRowIntoView(code: HTMLElement, context: SourceContext) {
  const first = context.source.start.line - context.startLine
  const row = code.children[first] as HTMLElement | undefined
  if (!row) return
  const rowTop = row.getBoundingClientRect().top - code.getBoundingClientRect().top + code.scrollTop
  // 元素行上方保留约两行上下文
  code.scrollTop = Math.max(0, rowTop - 36)
}
