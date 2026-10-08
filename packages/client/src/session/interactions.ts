/** 指针与键盘事件处理：悬停预览、框选、热键跳转与 Escape 收起 */
import { elementsInRect, isEditable, isInsideHost, markedElement, matchesHotKeys, uniqueElements } from '../dom.js'
import type { SessionActions } from './actions.js'
import type { SessionContext } from './context.js'

/** 会话级 DOM 事件处理器；均通过 capture 阶段监听 */
export interface SessionEvents {
  onPointerMove(event: PointerEvent): void
  onPointerDown(event: PointerEvent): void
  onPointerUp(event: PointerEvent): void
  onClick(event: MouseEvent): void
  onHotKeyUp(event: KeyboardEvent): void
  onKeyDown(event: KeyboardEvent): void
  /** 移除模块自行注册的 pointercancel / blur / visibilitychange 监听；幂等 */
  dispose(): void
}

export function createInteractions(ctx: SessionContext, actions: SessionActions): SessionEvents {
  const { state, host, normalized, isDisposed, preview, render, t, updateHighlights, dimPanel } = ctx

  // 面板结构由 panel.ts 的 Lit 模板维护，客户端只负责状态与副作用
  function onPointerMove(event: PointerEvent) {
    if (isDisposed()) return
    if (isInsideHost(event.target, host)) {
      dimPanel(false)
      preview.request(undefined)
      // 指针进入插件 UI：清掉页面上最后的悬停高亮，避免残留像仍被选中
      if (state.hoveredElement) {
        state.hoveredElement = undefined
        updateHighlights()
      }
      return
    }
    if (!state.selecting) {
      dimPanel(false)
      if (matchesHotKeys(event, normalized.hotKeys)) {
        // 面板未开时按住热键：实时预览“点击会跳转到的元素”，松开后消失
        const previewTarget = markedElement(event.target)
        // 可编辑控件豁免：悬停不发预览请求，与点击/按下的豁免契约一致
        preview.request(isEditable(event.target) ? undefined : previewTarget ?? undefined, { immediate: true })
        if (previewTarget !== state.hoveredElement) {
          state.hoveredElement = previewTarget
          updateHighlights()
        }
      }
      else {
        // 预览只在热键按住或面板打开时出现；面板关闭的普通悬停保持安静，可编辑控件同样豁免
        const candidate = state.open && !isEditable(event.target) ? markedElement(event.target) : undefined
        preview.request(candidate ?? undefined)
        if (state.hoveredElement && state.hoveredElement !== candidate) {
          state.hoveredElement = undefined
          updateHighlights()
        }
      }
      return
    }
    // 选择模式下指针在页面上工作：面板淡出避免遮挡视线，回到面板恢复
    dimPanel(true)
    if (state.dragging && state.dragStart) {
      state.dragEnd = { x: event.clientX, y: event.clientY }
      updateHighlights()
      return
    }
    const target = markedElement(event.target)
    preview.request(isEditable(event.target) ? undefined : target ?? undefined)
    if (target !== state.hoveredElement) {
      state.hoveredElement = target
      updateHighlights()
    }
  }

  function onPointerDown(event: PointerEvent) {
    if (isDisposed() || event.button !== 0 || isInsideHost(event.target, host) || isEditable(event.target)) return
    if (matchesHotKeys(event, normalized.hotKeys) && markedElement(event.target)) {
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (!state.selecting) return
    preview.request(undefined)
    state.dragging = true
    state.dragStart = { x: event.clientX, y: event.clientY }
    state.dragEnd = state.dragStart
    event.preventDefault()
    event.stopPropagation()
  }

  /** 放弃进行中的框选并收起拖框；未在拖动时无副作用 */
  function cancelDrag() {
    if (!state.dragging) return
    state.dragging = false
    state.dragStart = undefined
    state.dragEnd = undefined
    updateHighlights()
  }

  function onPointerUp(event: PointerEvent) {
    if (isDisposed() || !state.dragging) return
    // 在插件 UI 上松开或选择模式已关闭：视为放弃，事件照常交给面板
    if (!state.selecting || isInsideHost(event.target, host)) {
      cancelDrag()
      return
    }
    const start = state.dragStart
    const end = { x: event.clientX, y: event.clientY }
    state.dragging = false
    state.dragStart = undefined
    state.dragEnd = undefined
    const distance = Math.max(Math.abs(end.x - (start?.x ?? end.x)), Math.abs(end.y - (start?.y ?? end.y)))
    const elements = distance > 5 ? elementsInRect(start, end, host) : [markedElement(event.target)].filter(Boolean) as Element[]
    event.preventDefault()
    event.stopPropagation()
    if (elements.length > 0) void actions.chooseElements(uniqueElements(elements))
    else {
      state.status = t('statusNoMarked')
      render()
    }
  }

  function onClick(event: MouseEvent) {
    // 可编辑控件豁免：与按下/悬停一致，选择模式下仍可聚焦和输入页面表单
    if (isDisposed() || isInsideHost(event.target, host) || isEditable(event.target)) return
    const target = markedElement(event.target)
    if (target && matchesHotKeys(event, normalized.hotKeys)) {
      event.preventDefault()
      event.stopPropagation()
      void actions.openSource(target)
      return
    }
    // 选择模式下页面点击一律吞掉，未标记元素也不能触发页面跳转或业务处理
    if (!state.selecting) return
    event.preventDefault()
    event.stopPropagation()
  }

  /** 松开热键后面板未开时，清掉停留在原地的预览高亮 */
  function onHotKeyUp(event: KeyboardEvent) {
    if (isDisposed() || state.selecting || !state.hoveredElement) return
    if (matchesHotKeys(event, normalized.hotKeys)) return
    preview.request(undefined)
    state.hoveredElement = undefined
    updateHighlights()
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || isDisposed()) return
    // 输入法组合中的 Escape 只用于取消候选，已被处理的事件同样不再接管
    if (event.isComposing || event.keyCode === 229 || event.defaultPrevented) return
    // 仅接管面板内或选择模式下的 Escape，页面自己的弹窗等仍能收到
    if (!state.selecting && !state.dragging && !event.composedPath().includes(host)) return
    if (state.selecting || state.dragging) {
      preview.request(undefined)
      state.selecting = false
      state.dragging = false
      state.hoveredElement = undefined
      state.dragStart = undefined
      state.dragEnd = undefined
      dimPanel(false)
      render()
      event.preventDefault()
      event.stopPropagation()
      return
    }
    // 与关闭按钮一致：固化有效草稿后收起
    if (state.open) {
      event.preventDefault()
      event.stopPropagation()
      actions.handleAction('close-panel')
    }
  }

  /** 失焦或页面隐藏时 keyup / pointerup 可能永远不会到达：清掉拖框与热键预览，避免残留 */
  function resetTransient() {
    if (isDisposed()) {
      dispose()
      return
    }
    cancelDrag()
    preview.request(undefined)
    if (state.hoveredElement) {
      state.hoveredElement = undefined
      updateHighlights()
    }
  }

  function onPointerCancel() {
    if (isDisposed()) {
      dispose()
      return
    }
    cancelDrag()
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') resetTransient()
  }

  // 装配层未接管这几类监听：由本模块注册，dispose 时统一移除；卸载后首次触发也会自行移除
  const listeners = new AbortController()
  document.addEventListener('pointercancel', onPointerCancel, { capture: true, signal: listeners.signal })
  window.addEventListener('blur', resetTransient, { signal: listeners.signal })
  document.addEventListener('visibilitychange', onVisibilityChange, { signal: listeners.signal })

  function dispose() {
    listeners.abort()
  }

  return { onPointerMove, onPointerDown, onPointerUp, onClick, onHotKeyUp, onKeyDown, dispose }
}
