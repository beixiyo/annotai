/**
 * 演示下方的章节导航：三段叙事 + 进度条，点击章节从该处播放
 * 文字在缩放画布之外以真实字号渲染，窄屏下仍可读
 */
import { For } from 'solid-js'
import { type SiteMessageKey, t } from '../../i18n'
import { CHAPTERS, type ChapterId } from './script'

/** 章节文案 key */
const COPY: Record<ChapterId, { title: SiteMessageKey; desc: SiteMessageKey }> = {
  select: { title: 'demoChSelect', desc: 'demoChSelectDesc' },
  annotate: { title: 'demoChAnnotate', desc: 'demoChAnnotateDesc' },
  handoff: { title: 'demoChHandoff', desc: 'demoChHandoffDesc' },
}

export interface ChapterRailProps {
  /** 当前章节 */
  active: ChapterId
  /** 各章节时长（ms），驱动进度条动画 */
  durations: Record<ChapterId, number>
  /** 进度条动画是否运行；false 时当前章节显示为满格 */
  playing: boolean
  /** 进度动画重启键：每轮或跳转时变化 */
  runKey: number
  onSelect: (id: ChapterId) => void
}

export function ChapterRail(props: ChapterRailProps) {
  const activeIndex = () => CHAPTERS.findIndex((chapter) => chapter.id === props.active)

  return (
    <ol class="mt-5 grid grid-cols-3 gap-3 sm:gap-5">
      <For each={ CHAPTERS }>
        { (chapter, index) => {
          const state = () => (index() < activeIndex() ? 'done' : index() === activeIndex() ? 'active' : 'todo')
          return (
            <li>
              <button
                type="button"
                onClick={ () => props.onSelect(chapter.id) }
                aria-current={ state() === 'active' ? 'step' : undefined }
                class="group w-full cursor-pointer text-left focus-visible:outline-none"
              >
                <span class="block h-0.5 overflow-hidden rounded-full bg-line">
                  { /* 按 runKey 重建节点以重启动画 */ }
                  <For each={ [props.runKey] }>
                    { () => (
                      <span
                        class={ `block h-full origin-left rounded-full bg-ink ${
                          state() === 'done' || (state() === 'active' && !props.playing)
                            ? 'scale-x-100'
                            : state() === 'active'
                            ? 'animate-demo-progress'
                            : 'scale-x-0'
                        }` }
                        style={ state() === 'active' && props.playing
                          ? { 'animation-duration': `${props.durations[chapter.id]}ms` }
                          : undefined }
                      />
                    ) }
                  </For>
                </span>
                <span class="mt-3 flex items-baseline gap-2">
                  <span class="font-mono text-[11px] text-subtle">0{ index() + 1 }</span>
                  <span
                    class={ `text-sm font-medium transition-colors group-hover:text-ink group-focus-visible:underline ${
                      state() === 'active' ? 'text-ink' : 'text-muted'
                    }` }
                  >
                    { t(COPY[chapter.id].title) }
                  </span>
                </span>
                <span class="mt-1 hidden text-xs leading-relaxed text-subtle sm:block">{ t(COPY[chapter.id].desc) }</span>
              </button>
            </li>
          )
        } }
      </For>
    </ol>
  )
}
