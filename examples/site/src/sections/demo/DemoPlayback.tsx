/**
 * 标注回放：用 DOM 动画编排一段产品操作演示，进入视口自动循环播放
 * 画布按固定逻辑尺寸排版，再整体缩放适配容器，任意宽度下构图一致；镜头在画布内平滑推拉到当前焦点
 * 叙事：选中元素（拿到 file:line:col）→ 写下问题 → 复制给 AI，AI 改对那一行，按钮变红
 */
import { createEffect, createMemo, createSignal, on, onCleanup, onMount } from 'solid-js'
import { locale, t } from '../../i18n'
import { AgentWindow } from './AgentWindow'
import { ChapterRail } from './ChapterRail'
import { anchorPoint, cameraFor, inflate, layoutBox, type StageBox, type StageOffset, unionBox } from './measure'
import { MockApp } from './MockApp'
import { MockPanel } from './MockPanel'
import { createPlayback } from './playback'
import {
  type AnchorElement,
  buildTimeline,
  CAMERA_FOCUS,
  chapterDurations,
  type ChapterId,
  chapterOf,
  CHAPTERS,
  CLICK_STEPS,
  CURSOR_ANCHORS,
  lookback,
  type Step,
  STEPS,
} from './script'
import { TargetOverlay } from './TargetOverlay'
import { injectTiming, PACING } from './timing'

/** 画布逻辑尺寸（px，16:10）：所有画面按此排版，外层等比缩放 */
const CANVAS = { width: 720, height: 450 } as const

export interface DemoPlaybackProps {
  /** 忽略视口可见性，挂载即循环播放（录制用） */
  autoplay?: boolean
}

export function DemoPlayback(props: DemoPlaybackProps) {
  const question = () => Array.from(t('demoQuestion'))
  const timeline = () => buildTimeline(question().length)

  const playback = createPlayback({
    timeline,
    questionLength: () => question().length,
    perChar: PACING.perChar,
  })
  const { step } = playback

  /** 外框宽度 / 画布宽度；未测量前为 0，画布保持透明 */
  const [fit, setFit] = createSignal(0)
  /** 布局版本：语言或字体变化后递增，触发重新测量 */
  const [layoutVersion, setLayoutVersion] = createSignal(0)

  let frame: HTMLDivElement | undefined
  let canvas: HTMLDivElement | undefined
  const refs: Partial<Record<AnchorElement, HTMLElement>> = {}
  const bind = (name: AnchorElement) => (el: HTMLElement) => {
    refs[name] = el
  }

  /** 各锚点元素的画布逻辑矩形；只依赖布局版本，与镜头和外层缩放无关 */
  const boxes = createMemo(() => {
    layoutVersion()
    const result: Partial<Record<AnchorElement, StageBox>> = {}
    if (!canvas) return result
    for (const [name, el] of Object.entries(refs) as [AnchorElement, HTMLElement][]) {
      const box = layoutBox(el, canvas)
      if (box) result[name] = box
    }
    return result
  })

  // 面板随步骤增减内容（输入框、已保存条目），每步 DOM 更新后重测
  createEffect(on(step, () => queueMicrotask(() => setLayoutVersion((v) => v + 1)), { defer: true }))
  // 切换语言后文本宽度变化，等 DOM 更新完再测
  createEffect(on(locale, () => requestAnimationFrame(() => setLayoutVersion((v) => v + 1)), { defer: true }))

  let lastSpot: StageOffset = { x: CANVAS.width * 0.6, y: CANVAS.height * 0.6 }
  /** 光标坐标：按剧本回溯到最近一条锚点 */
  const spot = (): StageOffset => {
    const anchor = lookback(CURSOR_ANCHORS, step())
    const box = anchor && boxes()[anchor.el]
    if (anchor && box) {
      const point = anchorPoint(box, anchor.x, anchor.y)
      lastSpot = { x: point.x + (anchor.dx ?? 0), y: point.y + (anchor.dy ?? 0) }
    }
    return lastSpot
  }

  /** 镜头变换：按剧本回溯焦点 */
  const camera = () => {
    const focus = lookback(CAMERA_FOCUS, step())
    const measured = boxes()
    const box = focus && unionBox(focus.el.flatMap((name) => measured[name] ?? []))
    if (!focus || !box) return { x: 0, y: 0, zoom: 1 }
    return cameraFor(box, focus.zoom, CANVAS)
  }

  const targetBox = () => {
    const box = boxes().target
    return box ? inflate(box, 5) : null
  }

  /** 高亮标签：与客户端一致显示 `标签名 · 宽 × 高`（元素实际尺寸） */
  const targetLabel = () => {
    const box = boxes().target
    return box ? `button · ${box.width} × ${box.height}` : 'button'
  }

  const at = (target: Step) => step() >= target
  const typed = () => question().slice(0, playback.typedCount()).join('')
  const durations = createMemo(() => chapterDurations(timeline()))

  /** 章节点击：从章节起点开始播放 */
  function selectChapter(id: ChapterId) {
    const chapter = CHAPTERS.find((item) => item.id === id)
    playback.play(chapter?.from)
  }

  onMount(() => {
    if (!frame) return
    injectTiming(frame)

    const resizeObserver = new ResizeObserver(() => {
      if (frame) setFit(frame.clientWidth / CANVAS.width)
    })
    resizeObserver.observe(frame)
    onCleanup(() => resizeObserver.disconnect())

    void document.fonts.ready.then(() => setLayoutVersion((v) => v + 1))
    setLayoutVersion((v) => v + 1)

    // 可见且页面在前台才播放；离开后停在 idle，回来从头播
    const [inView, setInView] = createSignal(false)
    const [pageVisible, setPageVisible] = createSignal(document.visibilityState === 'visible')
    const intersection = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold: 0.3 })
    intersection.observe(frame)
    const syncPage = () => setPageVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', syncPage)
    onCleanup(() => {
      intersection.disconnect()
      document.removeEventListener('visibilitychange', syncPage)
    })

    createEffect(() => {
      if (props.autoplay) {
        playback.play()
        return
      }
      if (inView() && pageVisible()) playback.play()
      else playback.stop()
    })
  })

  onCleanup(() => playback.stop())

  return (
    <figure class="animate-demo-enter">
      <div
        ref={ frame }
        class="relative overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_1px_2px_rgb(0_0_0/0.04),0_24px_60px_-24px_rgb(0_0_0/0.18)]"
        style={ { 'aspect-ratio': `${CANVAS.width} / ${CANVAS.height}` } }
        role="img"
        aria-label={ t('demoStageAria') }
        data-demo-stage
        data-demo-loop={ playback.runKey() }
        data-demo-step={ step() }
      >
        { /* 适配层：逻辑画布等比缩放到外框宽度 */ }
        <div
          ref={ canvas }
          class={ `absolute top-0 left-0 origin-top-left transition-opacity duration-300 ${fit() ? 'opacity-100' : 'opacity-0'}` }
          style={ { width: `${CANVAS.width}px`, height: `${CANVAS.height}px`, transform: `scale(${fit() || 1})` } }
          aria-hidden="true"
        >
          { /*
            镜头层：平移 + 缩放，过渡走合成层
            透明度单独用淡出时长：淡出在 fadeOut 步内走完，回到 idle 时延迟淡入，状态复位发生在全透明期间，循环首尾无跳变
          */ }
          <div
            class={ `absolute inset-0 origin-top-left will-change-transform ${step() === STEPS.fadeOut ? 'opacity-0' : 'opacity-100'}` }
            style={ {
              transform: `translate(${camera().x}px, ${camera().y}px) scale(${camera().zoom})`,
              transition: `transform var(--demo-dur-camera) cubic-bezier(0.65, 0, 0.35, 1), opacity var(--demo-dur-fade) ease ${
                step() === STEPS.idle ? 'var(--demo-dur-panel)' : '0ms'
              }`,
            } }
          >
            <MockApp applied={ at(STEPS.applied) } appRef={ bind('app') } targetRef={ bind('target') } />

            <TargetOverlay
              box={ targetBox() }
              label={ targetLabel() }
              hovered={ step() === STEPS.hoverTarget || step() === STEPS.hoverPreview }
              selected={ at(STEPS.selected) && !at(STEPS.applied) }
              preview={ step() === STEPS.hoverPreview }
              previewRef={ bind('preview') }
              canvasWidth={ CANVAS.width }
            />

            <MockPanel
              state={ {
                open: at(STEPS.panelOpen),
                // 选择模式下指针停在页面上时面板淡出，光标回到面板时恢复
                dimmed: at(STEPS.hoverTarget) && !at(STEPS.typingApproach),
                selected: at(STEPS.selected),
                focused: at(STEPS.typing),
                typed: typed(),
                pressing: step() === STEPS.copied,
                copied: at(STEPS.copied),
              } }
              launcherRef={ bind('launcher') }
              panelRef={ bind('panel') }
              inputRef={ bind('input') }
              copyRef={ bind('copy') }
            />

            <AgentWindow agentRef={ bind('agent') } open={ at(STEPS.pasted) && !at(STEPS.applied) } replied={ at(STEPS.agentReply) } />

            { /* 演示光标 */ }
            <div
              class="pointer-events-none absolute top-0 left-0 z-10 transition-transform duration-(--demo-dur-cursor) ease-[cubic-bezier(0.65,0,0.35,1)]"
              style={ { transform: `translate(${spot().x}px, ${spot().y}px)` } }
            >
              <svg width="18" height="18" viewBox="0 0 24 24" class="block drop-shadow-[0_1px_2px_rgb(0_0_0/0.25)]">
                <path d="M5.5 3.5 19 10.9l-5.9 1.7-2.6 5.7z" fill="var(--bg)" stroke="var(--ink)" stroke-width="1.5" stroke-linejoin="round" />
              </svg>
              { CLICK_STEPS.includes(step()) && <span class="absolute -top-2 -left-2 size-6 animate-demo-ripple rounded-full border-2 border-ink" /> }
            </div>
          </div>
        </div>
      </div>

      <ChapterRail
        active={ chapterOf(step()) }
        durations={ durations() }
        playing={ playback.playing() }
        runKey={ playback.runKey() }
        onSelect={ selectChapter }
      />
    </figure>
  )
}
