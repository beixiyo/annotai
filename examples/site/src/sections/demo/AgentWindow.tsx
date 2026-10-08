/**
 * 演示画布里的 AI 终端窗口：粘贴复制出的 Markdown，回复一段精确到行的修改
 * 深色终端在明暗主题下保持一致；Markdown 结构与客户端 annotationsToMarkdown 输出一致（节选）
 */
import { Show } from 'solid-js'
import { t } from '../../i18n'
import { DEMO_LOCATION } from './TargetOverlay'

export interface AgentWindowProps {
  /** 窗口可见（已粘贴） */
  open: boolean
  /** AI 已回复修改 */
  replied: boolean
  agentRef: (el: HTMLDivElement) => void
}

export function AgentWindow(props: AgentWindowProps) {
  return (
    <div
      ref={ props.agentRef }
      class={ `pointer-events-none absolute top-[64px] left-5 w-[372px] overflow-hidden rounded-xl border border-white/10 bg-[#141414] font-mono text-[10.5px] leading-[1.65] text-[#d4d4d4] shadow-[0_24px_70px_rgb(0_0_0/0.28)] transition-[opacity,scale,translate] duration-(--demo-dur-camera) ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
        props.open ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
      }` }
      aria-hidden="true"
    >
      <div class="flex h-7 items-center gap-1.5 border-b border-white/8 px-3">
        <span class="size-2 rounded-full bg-white/15" />
        <span class="size-2 rounded-full bg-white/15" />
        <span class="size-2 rounded-full bg-white/15" />
        <span class="ml-2 font-sans text-[10.5px] text-white/45">{ t('demoAgentTitle') }</span>
      </div>

      <div class="px-3.5 py-3">
        { /* 用户粘贴的 Markdown */ }
        <div class="flex gap-2">
          <span class="text-white/35">›</span>
          <div class="min-w-0 text-white/80">
            <p class="text-white">{ t('demoMdTitle') }</p>
            <p>{ t('demoMdAnnotation') }</p>
            <p>
              { t('demoMdQuestion') }
              <span class="text-white">{ t('demoQuestion') }</span>
            </p>
            <p>
              { t('demoMdLocation') }
              <span class="text-[#7cb7ff]">`src/components/{ DEMO_LOCATION }`</span>
            </p>
          </div>
        </div>

        { /* AI 回复：定位到第 23 行并修改 */ }
        <Show when={ props.replied }>
          <div class="mt-3 animate-demo-rise border-t border-white/8 pt-3">
            <p>
              <span class="text-[#4ade80]">●</span> { t('demoAgentEdited') } <span class="text-white">ProductCard.tsx</span>
            </p>
            <div class="mt-1.5 overflow-hidden rounded-md bg-white/4 text-[10px]">
              <p class="truncate bg-[#f87171]/10 px-2 whitespace-pre text-[#fca5a5]">23 - { '<button class="btn-cart">' }</p>
              <p class="truncate bg-[#4ade80]/10 px-2 whitespace-pre text-[#86efac]">23 + { '<button class="btn-cart bg-red-500">' }</p>
            </div>
          </div>
        </Show>
      </div>
    </div>
  )
}
