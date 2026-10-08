/**
 * 演示画布里的标注面板：复刻客户端面板的头部与主体布局
 * 只按传入的阶段渲染，不持有状态；文案与客户端 i18n 保持一致
 */
import { Show } from 'solid-js'
import { t } from '../../i18n'
import { Logo } from '../../Logo'

/** 面板所处阶段，由回放步骤映射而来 */
export interface MockPanelState {
  /** 面板已展开（展开即进入选择模式，选中后选择模式保持开启） */
  open: boolean
  /** 选择模式下指针在页面上：面板淡出到 0.3，与客户端 dimOpacity 默认值一致 */
  dimmed: boolean
  /** 已选中目标元素 */
  selected: boolean
  /** 输入框已获得焦点（打字中） */
  focused: boolean
  /** 当前已输入的问题文本 */
  typed: string
  /** 复制按钮按下 */
  pressing: boolean
  /** 状态行显示“问题已复制” */
  copied: boolean
}

export interface MockPanelProps {
  state: MockPanelState
  launcherRef: (el: HTMLDivElement) => void
  panelRef: (el: HTMLDivElement) => void
  inputRef: (el: HTMLDivElement) => void
  copyRef: (el: HTMLSpanElement) => void
}

export function MockPanel(props: MockPanelProps) {
  const s = () => props.state

  return (
    <>
      { /* 收起态：右下角启动按钮 */ }
      <div
        ref={ props.launcherRef }
        class={ `absolute right-4 bottom-4 transition-[opacity,scale,translate] duration-(--demo-dur-panel) ${
          s().open ? 'scale-75 opacity-0' : 'scale-100 opacity-100'
        }` }
        aria-hidden="true"
      >
        <Logo size={ 34 } />
      </div>

      { /* 展开态面板：头部（拖拽把手 / 选择开关 / 复制 / 关闭）+ 空状态或当前选择 + 状态行 */ }
      <div
        ref={ props.panelRef }
        class={ `absolute right-4 bottom-4 flex w-[268px] origin-bottom-right flex-col gap-3 rounded-xl border border-line bg-bg p-3.5 text-[12px] shadow-[0_16px_60px_rgb(0_0_0/0.08),0_2px_8px_rgb(0_0_0/0.03)] transition-[opacity,scale,translate] duration-(--demo-dur-panel) ease-[cubic-bezier(0.2,0.9,0.3,1.2)] ${
          !s().open
            ? 'pointer-events-none translate-y-2 scale-[0.96] opacity-0'
            : s().dimmed
            ? 'translate-y-0 scale-100 opacity-30'
            : 'translate-y-0 scale-100 opacity-100'
        }` }
        aria-hidden="true"
      >
        <div class="flex h-6 items-center gap-1.5">
          <svg width="8" height="13" viewBox="0 0 10 16" fill="currentColor" class="shrink-0 text-subtle">
            <circle cx="2" cy="2.5" r="1.4" />
            <circle cx="8" cy="2.5" r="1.4" />
            <circle cx="2" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="2" cy="13.5" r="1.4" />
            <circle cx="8" cy="13.5" r="1.4" />
          </svg>
          <span class="rounded-md bg-surface px-2 py-1 text-[11px] whitespace-nowrap">{ t('demoStop') }</span>
          { /* 复制入口：草稿有目标且写了问题后才出现 */ }
          <Show when={ s().typed }>
            <span
              ref={ props.copyRef }
              class={ `animate-demo-rise rounded-md bg-invert px-2 py-1 text-[11px] whitespace-nowrap text-on-invert transition-[scale] duration-(--demo-dur-press) ${
                s().pressing ? 'scale-[0.92]' : 'scale-100'
              }` }
            >
              { t('demoCopy') }
            </span>
          </Show>
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" class="mr-0.5 ml-auto shrink-0 text-muted">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </div>

        <Show
          when={ s().selected }
          fallback={
            <div class="flex flex-col gap-1">
              <p class="font-medium">{ t('demoEmptySelecting') }</p>
              <p class="text-[11px] leading-relaxed text-muted">{ t('demoEmptyHint') }</p>
            </div>
          }
        >
          <div class="flex animate-demo-rise flex-col gap-2">
            <p class="font-medium">{ t('demoSelected') }</p>
            { /* 目标卡：文件名 / 目录 / 行列，与客户端一致 */ }
            <div class="rounded-lg border border-line px-2.5 py-2">
              <p class="font-medium">ProductCard.tsx</p>
              <p class="mt-0.5 flex justify-between font-mono text-[10px] text-subtle">
                <span>src/components</span>
                <span>{ t('demoLineCol') }</span>
              </p>
            </div>
            <div
              ref={ props.inputRef }
              class={ `flex h-9 items-center rounded-lg border bg-surface px-2.5 transition-colors ${s().focused ? 'border-subtle' : 'border-line'}` }
            >
              <Show when={ s().typed } fallback={ <span class="truncate text-subtle">{ t('demoPlaceholder') }</span> }>
                <span class="truncate">{ s().typed }</span>
              </Show>
              <Show when={ s().focused && !s().copied }>
                <span class="ml-px h-3.5 w-px shrink-0 animate-demo-caret bg-ink" />
              </Show>
            </div>
          </div>
        </Show>

        { /* 状态行：客户端用一行静默文字反馈，不弹 toast */ }
        <Show when={ s().copied }>
          <p class="flex animate-demo-rise items-center gap-1.5 text-[11px] text-muted">
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" class="text-[#30a46c]">
              <path d="M20 6 9 17l-5-5" />
            </svg>
            { t('demoCopiedToast') }
          </p>
        </Show>
      </div>
    </>
  )
}
