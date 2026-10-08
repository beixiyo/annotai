/** 高亮协调：把会话选择状态翻译成高亮层的目标列表与拖框 */
import { rectFromPoints } from '../dom.js'
import type { SessionContext } from './context.js'

export interface HighlightSync {
  /** 把悬停、选中与拖框状态同步到高亮层；immediate 时不追赶旧坐标 */
  updateHighlights(immediate?: boolean): void
  /** 视口滚动或缩放后：面板回到 CSS 布局，高亮与悬停预览卡按新坐标重新对位 */
  syncHighlights(): void
}

/**
 * @param syncPreview 视口变化时重新定位悬停预览卡；预览卡跟随元素，与高亮共用同一触发时机
 */
export function createHighlightSync(ctx: SessionContext, syncPreview: () => void = () => {}): HighlightSync {
  const { state, panel, highlights, motion } = ctx

  function updateHighlights(immediate = false) {
    if (!state.open) {
      // 面板关闭：仅保留热键预览的悬停高亮
      if (!state.hoveredElement) {
        highlights.clear()
        return
      }
      highlights.update({ targets: [{ key: 'hovered:0', target: state.hoveredElement, kind: 'hovered' }] })
      return
    }
    const rect = state.dragging && state.dragStart && state.dragEnd
      ? rectFromPoints(state.dragStart, state.dragEnd)
      : undefined
    const dragging = Boolean(rect && Math.max(rect.width, rect.height) > 5)
    const selected = dragging
      ? []
      : state.selectedElements.length > 0
      ? state.selectedElements
      : state.hoveredElement
      ? [state.hoveredElement]
      : []
    const targets: Array<{ key: string; target: Element; kind: 'selected' | 'hovered' }> = selected.map((target, index) => ({
      key: `selected:${index}`,
      target,
      kind: 'selected',
    }))
    if (!dragging && state.hoveredElement && !selected.includes(state.hoveredElement)) {
      targets.push({ key: 'hovered:0', target: state.hoveredElement, kind: 'hovered' })
    }
    highlights.update({ targets, dragRect: dragging ? rect : undefined, immediate: immediate || dragging })
  }

  function syncHighlights() {
    motion.stopTarget(panel)
    updateHighlights(true)
    syncPreview()
  }

  return { updateHighlights, syncHighlights }
}
