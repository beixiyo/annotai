/** 渲染协调：Lit 模板挂载、焦点恢复、面板几何过渡与拖拽把手绑定 */
import { applyLauncherPosition, bindDrag, clampLauncherPosition, isLauncherPositioned, writeLauncherPosition } from '../launcher.js'
import type { PanelAction } from '../panel-types.js'
import { DRAG_HANDLE_CLASS, renderAnnotaiPanel } from '../panel.js'
import type { SessionActions } from './actions.js'
import type { SessionContext } from './context.js'

export interface RenderLoop {
  /** 把当前状态渲染到面板；处理焦点恢复、开关动画与拖拽重绑定 */
  render(): void
  /** 已脱离默认停靠时，按当前尺寸把面板拉回视口内；展开、收起、内容增减后都会重新钳制 */
  clampPanelIntoView(): void
  /** 解绑拖拽把手；卸载时调用 */
  dispose(): void
}

export function createRenderLoop(ctx: SessionContext, actions: SessionActions): RenderLoop {
  const { state, shadow, panel, motion, t, updateHighlights } = ctx
  let previousOpen = false
  let unbindDrag: () => void = () => {}
  let boundHandle: HTMLElement | null = null

  function render() {
    const focused = shadow.activeElement as HTMLElement | null
    const action = focused?.dataset.action
    const label = focused?.getAttribute('aria-label')
    const name = focused?.getAttribute('name')
    const restoreFocus = () => {
      const nextAction = action === 'toggle-panel' && state.open
        ? 'toggle-selection'
        : action === 'close-panel' && !state.open
        ? 'toggle-panel'
        : action
      const selector = nextAction
        ? `[data-action="${CSS.escape(nextAction)}"]`
        : label
        ? `[aria-label="${CSS.escape(label)}"]`
        : name
        ? `[name="${CSS.escape(name)}"]`
        : undefined
      if (!selector) return
      const next = shadow.querySelector<HTMLElement>(selector)
      if (!next) return
      // Lit 保留的输入节点无需重新聚焦，避免影响光标或输入法组合态
      if (shadow.activeElement !== next) next.focus({ preventScroll: true })
    }
    const shouldAnimate = state.open !== previousOpen && panel.childElementCount > 0
    const previousPanelRect = shouldAnimate ? panel.getBoundingClientRect() : undefined
    if (shouldAnimate) motion.stopTarget(panel)
    previousOpen = state.open
    renderAnnotaiPanel(panel, state, {
      onAction: actions.handleAction,
      onQuestionChange(question, index) {
        if (index === undefined) {
          state.question = question
          // 草稿有效性决定复制入口的出现，输入后立即反映到界面
          render()
        }
        else {
          const annotation = state.annotations[index]
          if (annotation) annotation.question = question
        }
      },
      onFieldChange(field, checked) {
        state.fields[field] = checked
        render()
      },
    }, { preserveSurface: shouldAnimate && !state.open, t: ctx.t })
    clampPanelIntoView()
    updateHighlights()
    if (shouldAnimate && previousPanelRect) {
      const nextPanelRect = panel.getBoundingClientRect()
      motion.panelTransition(panel, previousPanelRect, nextPanelRect, state.open ? undefined : render)
    }
    restoreFocus()
    bindDragHandle()
  }

  /** 按动作名查面板按钮；值受 PanelAction 约束，避免无类型检查的裸字符串 */
  function actionButton(action: PanelAction) {
    return panel.querySelector<HTMLElement>(`[data-action="${action}"]`)
  }

  /**
   * 渲染后按需绑定拖拽：收起态拖启动按钮，展开态拖面板头部把手行
   * 把手行内的按钮不参与拖拽，避免单击被拖拽逻辑干扰；两者共用同一持久化位置
   * 仅在把手节点变化时重绑：Lit 复用节点时保留绑定，拖动途中的异步渲染不会重置进行中的拖拽
   */
  function bindDragHandle() {
    const handle = state.open
      ? panel.querySelector<HTMLElement>(`.${DRAG_HANDLE_CLASS}`)
      : actionButton('toggle-panel')
    if (handle === boundHandle) return
    unbindDrag()
    unbindDrag = () => {}
    boundHandle = handle
    if (!handle) return
    unbindDrag = bindDrag(handle, panel, {
      ignore: state.open ? (event) => event.target instanceof Element && event.target.closest('button') !== null : undefined,
      onDragged: writeLauncherPosition,
    })
  }

  function clampPanelIntoView() {
    if (!isLauncherPositioned(panel)) return
    const left = Number.parseFloat(panel.style.left)
    const top = Number.parseFloat(panel.style.top)
    if (!Number.isFinite(left) || !Number.isFinite(top)) return
    applyLauncherPosition(panel, clampLauncherPosition({ left, top }, panel))
  }

  function dispose() {
    unbindDrag()
    unbindDrag = () => {}
    boundHandle = null
  }

  return { render, clampPanelIntoView, dispose }
}
