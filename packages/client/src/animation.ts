/**
 * 仅动画化工具自身元素：面板开关、高亮框位移与标签淡入
 *
 * 直接使用 WAAPI 且 fill: none，动画结束或取消后元素回到自身的样式，不向 DOM 提交内联样式
 * Motion 只负责把弹簧参数转换为 linear() easing
 */
import { generateLinearEasing, spring } from 'motion'
import { TRANSITION_SURFACE_ATTRIBUTE } from './panel.js'

/** 视口坐标中的目标矩形，不携带业务 DOM 或组件状态 */
export interface HighlightRect {
  left: number
  top: number
  width: number
  height: number
}

/** 面板开关前后的外壳矩形；left/top 随宽高一起过渡，拖动定位过的面板展开时不再跳变 */
export type PanelRect = HighlightRect

interface Playback {
  /** 动画结束或被取消时都会执行，用于恢复临时样式 */
  settle?: () => void
  /** 只在自然完成时执行 */
  complete?: () => void
}

export interface MotionController {
  /** 面板开关的连续几何过渡；动画外壳矩形和透明度，不用 transform 拉伸文字 */
  panelTransition(panel: HTMLElement, from: PanelRect, to: PanelRect, onComplete?: () => void): void
  /** 高亮框移动到新矩形；immediate 时直接定位，不追赶旧坐标 */
  moveHighlight(target: HTMLElement, rect: HighlightRect, immediate: boolean): void
  /** 标签或预览内容更新后的轻微模糊淡入 */
  labelChanged(target: HTMLElement): void
  /** 取消某个元素上的全部动画；元素立即回到自身样式 */
  stopTarget(target: Element): void
  dispose(): void
}

/** 无回弹弹簧转为 WAAPI 时长与 linear() 曲线；Motion 的生成器以毫秒计算 */
function springTiming(durationMs: number): KeyframeAnimationOptions {
  const { duration = durationMs, ease } = spring.applyToOptions({ duration: durationMs, bounce: 0 })
  return { duration, easing: typeof ease === 'function' ? generateLinearEasing(ease, duration) : 'ease-out' }
}
const panelTiming = springTiming(300)
const highlightTiming = springTiming(280)
const labelTiming: KeyframeAnimationOptions = { duration: 160, easing: 'ease-out' }

/**
 * 统一管理浏览器客户端动画
 *
 * 只在状态边界调用，不绑定到每次输入或 pointermove，避免连续 render 反复创建动画
 * 所有动画都可被中断，被中断的动画不会触发完成回调
 */
export function createMotionController(enabled: boolean): MotionController {
  const active = new Map<Animation, Playback>()
  const media = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : undefined

  // 媒体状态可能先于 change 事件更新，因此每次播放前直接读取而不缓存
  const prefersReduced = () => media?.matches ?? false
  const onMediaChange = (event: MediaQueryListEvent) => {
    if (event.matches) stopAll()
  }
  media?.addEventListener('change', onMediaChange)

  function play(target: Element, keyframes: PropertyIndexedKeyframes, timing: KeyframeAnimationOptions, playback: Playback = {}) {
    if (!enabled || prefersReduced()) {
      stopAll()
      return false
    }
    const animation = target.animate(keyframes, { ...timing, fill: 'none' })
    active.set(animation, playback)
    // 被 stopTarget/stopAll 取消的动画已经移出集合并同步清理，这里只处理自然完成
    animation.finished.then(() => {
      if (!active.delete(animation)) return
      playback.settle?.()
      playback.complete?.()
    }, () => active.delete(animation))
    return true
  }

  function stop(animation: Animation, playback: Playback) {
    active.delete(animation)
    animation.cancel()
    playback.settle?.()
  }

  function stopTarget(target: Element) {
    for (const [animation, playback] of active) {
      if ((animation.effect as KeyframeEffect | null)?.target === target) stop(animation, playback)
    }
  }

  function stopAll() {
    for (const [animation, playback] of active) stop(animation, playback)
  }

  return {
    panelTransition(panel, from, to, onComplete) {
      stopTarget(panel)
      const transitionSurface = panel.querySelector<HTMLElement>(`[${TRANSITION_SURFACE_ATTRIBUTE}]`)
      // Lit 仍持有这个节点；隐藏而不是直接 remove，交给下一次模板提交回收
      const hideTransitionSurface = () => {
        if (transitionSurface) transitionSurface.hidden = true
      }
      if (from.width <= 0 && from.height <= 0) {
        hideTransitionSurface()
        onComplete?.()
        return
      }
      const originalOverflow = panel.style.getPropertyValue('overflow')
      panel.style.setProperty('overflow', 'hidden')
      const settle = () => {
        if (originalOverflow) panel.style.setProperty('overflow', originalOverflow)
        else panel.style.removeProperty('overflow')
        hideTransitionSurface()
      }
      const started = play(
        panel,
        {
          left: [`${from.left}px`, `${to.left}px`],
          top: [`${from.top}px`, `${to.top}px`],
          width: [`${Math.max(1, from.width)}px`, `${Math.max(1, to.width)}px`],
          height: [`${Math.max(1, from.height)}px`, `${Math.max(1, to.height)}px`],
          opacity: [0.84, 1],
          filter: ['blur(2px)', 'blur(0px)'],
        },
        panelTiming,
        { settle, complete: onComplete },
      )
      if (!started) {
        settle()
        onComplete?.()
      }
    },

    moveHighlight(target, rect, immediate) {
      // 先读取正在显示的矩形，再取消旧动画；连续切换不会跳回上一个目标
      const current = target.getBoundingClientRect()
      stopTarget(target)
      const next = { left: `${rect.left}px`, top: `${rect.top}px`, width: `${rect.width}px`, height: `${rect.height}px` }
      Object.assign(target.style, next)
      if (immediate) return
      play(target, {
        left: [`${current.left}px`, next.left],
        top: [`${current.top}px`, next.top],
        width: [`${current.width}px`, next.width],
        height: [`${current.height}px`, next.height],
      }, highlightTiming)
    },

    labelChanged(target) {
      stopTarget(target)
      play(target, { opacity: [0.35, 1], filter: ['blur(3px)', 'blur(0px)'] }, labelTiming)
    },

    stopTarget,

    dispose() {
      stopAll()
      media?.removeEventListener('change', onMediaChange)
    },
  }
}
