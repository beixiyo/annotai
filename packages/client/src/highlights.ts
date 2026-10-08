/** 复用高亮框节点，负责多目标框、标签及拖框的增删与位置同步 */
import type { HighlightRect, MotionController } from './animation.js'
import { element } from './dom.js'

/** 创建高亮层；动画资源由共享动画控制器管理 */
export function createHighlightLayer(container: HTMLElement, motion: MotionController) {
  const slots = new Map<string, HighlightSlot>()
  let dragBox: HTMLElement | undefined

  function removeSlot(key: string, slot: HighlightSlot) {
    motion.stopTarget(slot.box)
    motion.stopTarget(slot.label)
    slot.box.remove()
    slots.delete(key)
  }

  return {
    /** 同一角色和序号复用节点；相同目标的异步回写不会重启动画 */
    update({ targets, dragRect, immediate = false }: HighlightUpdate) {
      const retained = new Set<string>()

      for (const { key, target, kind } of targets) {
        if (!target.isConnected) continue
        const rect = target.getBoundingClientRect()
        if (rect.width <= 0 || rect.height <= 0) continue

        retained.add(key)
        let slot = slots.get(key)
        const first = !slot

        if (!slot) {
          const box = element('div', `annotai-highlight ${kind}`)
          const label = element('span', 'annotai-highlight-label')
          box.append(label)
          container.append(box)
          slot = { box, label, target, rect }
          slots.set(key, slot)
        }

        if (first || immediate || !sameRect(slot.rect, rect)) {
          motion.moveHighlight(slot.box, rect, first || immediate)
        }

        const text = `${target.tagName.toLowerCase()} · ${Math.round(rect.width)} × ${Math.round(rect.height)}`
        if (slot.target !== target || slot.label.textContent !== text) {
          slot.label.textContent = text
          if (!immediate) motion.labelChanged(slot.label)
        }

        // 顶边靠近视口时将标签放入框内，避免裁出屏幕
        slot.label.style.top = rect.top < 28 ? '3px' : '-25px'
        slot.label.style.left = `${Math.min(-2, window.innerWidth - rect.left - slot.label.offsetWidth - 6)}px`
        slot.target = target
        slot.rect = rect
      }

      for (const [key, slot] of slots) {
        if (!retained.has(key)) removeSlot(key, slot)
      }

      if (dragRect) {
        dragBox ??= element('div', 'annotai-drag-box')
        if (!dragBox.isConnected) container.append(dragBox)
        Object.assign(dragBox.style, {
          left: `${dragRect.left}px`,
          top: `${dragRect.top}px`,
          width: `${dragRect.width}px`,
          height: `${dragRect.height}px`,
        })
      }
      else {
        dragBox?.remove()
        dragBox = undefined
      }
    },

    /** 清空节点并取消动画，可重复调用 */
    clear() {
      for (const [key, slot] of slots) removeSlot(key, slot)
      dragBox?.remove()
      dragBox = undefined
    },
  }
}

function sameRect(a: HighlightRect, b: HighlightRect) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height
}

interface HighlightSlot {
  box: HTMLElement
  label: HTMLElement
  target: Element
  rect: HighlightRect
}

export type HighlightLayer = ReturnType<typeof createHighlightLayer>

interface HighlightUpdate {
  targets: Array<{ key: string; target: Element; kind: 'selected' | 'hovered' }>
  dragRect?: HighlightRect
  /** 滚动、缩放与拖框时直接同步，不追赶旧坐标。 @default false */
  immediate?: boolean
}
