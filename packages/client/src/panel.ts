/**
 * 源码标注面板的 Lit 模板
 *
 * 面板只负责把状态表达为原生 DOM；请求、选择和剪贴板等副作用通过回调交给客户端
 * `annotai-*` 类名只用于 JS 与测试定位节点，外观全部由 Tailwind utility 表达
 */
import type { ContextOptions } from '@annotai/protocol'
import { live } from 'lit/directives/live.js'
import { repeat } from 'lit/directives/repeat.js'
import { html, nothing, render } from 'lit/html.js'
import { formatSourceLocation } from './dom.js'
import { createTranslator, type MessageKey, type Translator } from './i18n.js'
import type { PanelAction, PanelCallbacks, PanelState } from './panel-types.js'

const fields: Array<[keyof ContextOptions, MessageKey]> = [
  ['sourceLocation', 'fieldSourceLocation'],
  ['sourceSnippet', 'fieldSourceSnippet'],
  ['className', 'fieldClassName'],
  ['text', 'fieldText'],
  ['domPath', 'fieldDomPath'],
]

/** 收起过渡外壳的标记类；面板模板渲染，动画控制器按同名 data 属性查询 */
export const TRANSITION_SURFACE_ATTRIBUTE = 'data-annotai-transition-surface'
const TRANSITION_SURFACE_CLASS = 'annotai-transition-surface'

/** 选择目标预览卡；chooseElements 完成后对其播放轻微淡入 */
export const TARGET_PREVIEW_CLASS = 'annotai-target-preview'

/** 展开态的拖拽把手行；整行可拖动，行内按钮除外 */
export const DRAG_HANDLE_CLASS = 'annotai-drag-handle'

const panelBase =
  'annotai-panel fixed pointer-events-auto right-5 bottom-5 font-sn text-[13px] leading-[1.5] text-sn-text origin-bottom-right [@media(width<=480px)]:right-3 [@media(width<=480px)]:bottom-3'
const focusRing = 'focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-sn-focus focus-visible:outline-offset-3'
const textareaClass =
  `my-3.5 block min-h-23 w-full resize-y rounded-xl border border-solid border-transparent bg-sn-surface p-3 text-[13px] leading-[1.6] text-sn-text outline-none transition-[border-color] duration-140 ease-[ease] placeholder:text-sn-subtle focus:border-sn-focus`

/** 将面板状态渲染到已有的 section，Lit 会复用同一位置的输入节点 */
export interface PanelRenderOptions {
  /** 关闭过渡期间保留背景层，按钮仍然立即可访问 */
  preserveSurface?: boolean
  /** 文案翻译器；缺省用中文 */
  t?: Translator
}

export function renderAnnotaiPanel(
  container: HTMLElement,
  state: PanelState,
  callbacks: PanelCallbacks,
  options: PanelRenderOptions = {},
) {
  const t = options.t ?? createTranslator('en')
  container.className = state.open
    ? `${panelBase} w-[370px] [@media(width<=480px)]:w-[calc(100vw-24px)]`
    : `${panelBase} flex w-auto items-end justify-end`
  render(state.open ? openPanel(state, callbacks, t) : closedPanel(callbacks, options.preserveSurface ?? false, t), container)
  // Lit 模板属性名须静态：过渡外壳的 data 标记渲染后补上，供动画控制器查询
  const surface = container.querySelector<HTMLElement>(`.${TRANSITION_SURFACE_CLASS}`)
  if (surface) surface.setAttribute(TRANSITION_SURFACE_ATTRIBUTE, '')
}

function closedPanel(callbacks: PanelCallbacks, preserveSurface: boolean, t: Translator) {
  return html`
    ${
    preserveSurface
      ? html`<div aria-hidden="true" class="${TRANSITION_SURFACE_CLASS} pointer-events-none absolute inset-0 rounded-2xl border border-solid border-sn-line bg-sn-panel shadow-sn"></div>`
      : ''
  }
    <button
      type="button"
      class="annotai-open-button relative z-10 inline-flex size-8 shrink-0 cursor-grab touch-none items-center justify-center rounded-lg bg-sn-primary text-sn-on-primary shadow-sn transition-colors hover:bg-sn-primary hover:text-sn-on-primary focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-3"
      data-action="toggle-panel"
      aria-label=${t('panelTitle')}
      title=${t('launcherTitle')}
      @click=${() => callbacks.onAction('toggle-panel')}
    >
      <svg width="16" height="16" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <rect x="8" y="8" width="16" height="16" rx="2" stroke="currentColor" stroke-width="2.5" stroke-dasharray="4.5 3.5" />
        <circle cx="16" cy="16" r="3" fill="currentColor" />
      </svg>
    </button>
  `
}

function openPanel(state: PanelState, callbacks: PanelCallbacks, t: Translator) {
  // 草稿已写问题即可随复制一起固化；仅选中未写问题时还无可复制内容
  const canCopy = state.annotations.length > 0 || (state.selectedTargets.length > 0 && state.question.trim() !== '')
  return html`
    <div class="annotai-panel-surface box-border min-w-92.5 w-full max-h-[min(760px,calc(100dvh-40px))] overflow-auto rounded-2xl border border-solid border-sn-line bg-sn-panel p-5 shadow-sn scrollbar-thin [scrollbar-color:var(--sn-line)_transparent] [@media(width<=480px)]:min-w-[calc(100vw-24px)] [@media(width<=480px)]:max-h-[calc(100dvh-24px)] [@media(width<=480px)]:p-4">
    <div class="${DRAG_HANDLE_CLASS} sticky -top-5 z-20 -mx-5 mb-4 flex cursor-grab touch-none select-none items-center gap-1.5 bg-sn-panel px-5 pb-2.5 pt-3 [@media(width<=480px)]:-top-4 [@media(width<=480px)]:-mx-4 [@media(width<=480px)]:px-4">
      ${gripIcon()}
      ${actionButton(state.selecting ? t('endSelection') : t('startSelection'), 'toggle-selection', callbacks, { pressed: state.selecting })}
      ${canCopy ? actionButton(t('copyQuestions'), 'copy-markdown', callbacks, { variant: 'primary', className: 'min-h-8' }) : ''}
      <span class="min-w-3 flex-1 self-stretch" aria-hidden="true"></span>
      ${
    actionButton(t('close'), 'close-panel', callbacks, {
      variant: 'ghost',
      icon: 'x',
      className: 'size-8 rounded-lg text-sn-muted hover:bg-sn-surface hover:text-sn-text',
    })
  }
    </div>

    ${
    !state.selectedElements.length && !state.annotations.length
      ? html`
        <div class="px-2 pb-5 pt-7 text-center">
          <strong class="mb-2 block text-[13px] font-medium">${state.selecting ? t('emptyTitleSelecting') : t('emptyTitleIdle')}</strong>
          <p class="text-xs leading-[1.8] text-sn-muted">${t('emptyHint')}</p>
        </div>
      `
      : ''
  }

    ${
    // 空态由标题引导；选中后提示可继续多选与快捷键，避免与空态提示叠加
    state.selecting && state.selectedElements.length > 0
      ? html`<p class="mb-3 text-[11px] leading-[1.7] text-sn-muted">${t('selectHint')}</p>`
      : ''}
    ${
    // 状态行常驻作为 live region：条件渲染会让读屏器错过首次播报；无状态时视觉隐藏
    html`<p role="status" aria-live="polite" class=${state.status ? 'my-3 text-[12px] leading-normal text-sn-muted' : 'sr-only'}>${state.status}</p>`}
    ${state.selectedElements.length ? draftPanel(state, callbacks, t) : ''}
    ${annotationsPanel(state, callbacks, t)}
    </div>
  `
}

function draftPanel(state: PanelState, callbacks: PanelCallbacks, t: Translator) {
  return html`
    <section>
      <div class="mb-2 flex items-center gap-2">
        <h2 class="text-[12px] font-medium leading-normal text-sn-muted">${t('selectionCount', { count: state.selectedElements.length })}</h2>
        ${actionButton(t('discard'), 'discard-draft', callbacks, { variant: 'ghost', className: 'ml-auto min-h-6 px-2 py-0.5 text-[11px]' })}
      </div>
      <div class="mb-3 flex items-center gap-1">
        ${actionButton(t('parent'), 'select-parent', callbacks, { variant: 'compact' })}
        ${actionButton(t('child'), 'select-child', callbacks, { variant: 'compact' })}
      </div>
      ${targetPreview(state, t)}
      <textarea
        id="annotai-question"
        class=${textareaClass}
        aria-label=${t('questionLabel')}
        placeholder=${t('questionPlaceholder')}
        rows="3"
        .value=${live(state.question)}
        @input=${(event: Event) => callbacks.onQuestionChange((event.target as HTMLTextAreaElement).value)}
      ></textarea>
      <details class="mt-1">
        <summary class=${`cursor-pointer text-[11px] text-sn-muted marker:text-sn-subtle ${focusRing}`}>${t('contextLabel')}</summary>
        <div class="mb-4.5 mt-3 grid grid-cols-3 gap-x-2 gap-y-2.5">
        ${
    fields.map(([field, labelKey]) =>
      html`
          <label class="inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap text-[11px] text-sn-muted">
            <input
              type="checkbox"
              class=${`m-0 h-3.25 w-3.25 accent-sn-primary ${focusRing}`}
              name=${field}
              aria-label=${t(labelKey)}
              .checked=${live(state.fields[field])}
              @change=${(event: Event) => callbacks.onFieldChange(field, (event.target as HTMLInputElement).checked)}
            />
            <span>${t(labelKey)}</span>
          </label>
        `
    )
  }
        </div>
      </details>
    </section>
  `
}

function targetPreview(state: PanelState, t: Translator) {
  if (!state.selectedTargets.length) return ''
  return html`
    <div class="${TARGET_PREVIEW_CLASS} mb-4 mt-3 overflow-hidden rounded-xl bg-sn-surface">
      ${
    state.selectedTargets.map((target, index) => {
      const path = target.context.path || target.context.source.file
      const location = formatSourceLocation(path, target.context.source.start.line, target.context.source.start.column)
      const slash = path.lastIndexOf('/')
      return html`
          <details class=${`group/source-target p-3 ${index > 0 ? 'border-t border-solid border-sn-line' : ''}`} open>
            <summary class=${`relative grid cursor-pointer list-none gap-1 pr-5 [&::-webkit-details-marker]:hidden after:absolute after:right-0.5 after:top-0 after:text-[18px] after:text-sn-subtle after:content-['›'] group-open/source-target:after:rotate-90 text-[12px] leading-normal ${focusRing}`} title=${location}>
              ${
        state.fields.sourceLocation && location
          ? html`
                  <span class="wrap-anywhere text-[12px] font-medium">${path.slice(slash + 1)}</span>
                  <span class="block wrap-anywhere font-sn-mono text-[10px] leading-normal text-sn-muted">${slash >= 0 ? path.slice(0, slash + 1) : ''}</span>
                  <span class="text-[10px] text-sn-subtle">${
            t('lineColumn', { line: target.context.source.start.line, column: target.context.source.start.column })
          }</span>
                `
          : t('targetN', { n: index + 1 })
      }
            </summary>
            ${targetField(t('fieldClassName'), target.className, state.fields.className)}
            ${targetField(t('fieldText'), target.text, state.fields.text)}
            ${targetField(t('fieldDomPath'), target.domPath, state.fields.domPath)}
            ${targetField(t('fieldSourceSnippet'), target.context.snippet, state.fields.sourceSnippet, true)}
          </details>
        `
    })
  }
    </div>
  `
}

function targetField(label: string, value: string, enabled: boolean, code = false) {
  if (!enabled || !value) return ''
  return html`
    <details class="mt-2.5">
      <summary class=${`cursor-pointer marker:text-[10px] marker:text-sn-subtle text-[11px] text-sn-muted ${focusRing}`}>${label}</summary>
      ${
    code
      ? html`<pre class="my-2 max-h-45 overflow-auto whitespace-pre-wrap font-sn-mono text-[11px] leading-[1.6] text-sn-muted">${value}</pre>`
      : html`<p class="my-2 wrap-anywhere text-[12px] leading-normal text-sn-muted">${value}</p>`
  }
    </details>
  `
}

function annotationsPanel(state: PanelState, callbacks: PanelCallbacks, t: Translator) {
  if (!state.annotations.length) return ''
  return html`
    <section>
      <h2 class="mb-3 mt-5 text-[12px] font-medium leading-normal text-sn-muted">${t('savedCount', { count: state.annotations.length })}</h2>
      ${
    repeat(state.annotations, (annotation) => annotation.id, (annotation, index) =>
      html`
        <article class="mb-4.5 mt-3">
          <div class="flex items-center gap-2">
            <span class="text-[11px] text-sn-muted">${index + 1}. ${t('targetsCount', { count: annotation.targets.length })}</span>
            ${actionButton(t('delete'), 'delete-annotation', callbacks, { variant: 'ghost', index, className: 'ml-auto min-h-6 px-2 py-0.5 text-[11px]' })}
          </div>
          <textarea
            id=${`annotai-annotation-${annotation.id}`}
            class=${textareaClass}
            aria-label=${t('editQuestionN', { n: index + 1 })}
            rows="2"
            .value=${live(annotation.question)}
            @input=${(event: Event) => callbacks.onQuestionChange((event.target as HTMLTextAreaElement).value, index)}
          ></textarea>
        </article>
      `)
  }
    </section>
  `
}

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'compact'

/** 视觉变体只描述外观；尺寸与布局由调用处的 className 决定 */
const variantClasses: Record<ButtonVariant, string> = {
  primary: 'bg-sn-primary px-3 py-1.5 text-xs text-sn-on-primary',
  secondary: 'min-h-8 bg-sn-surface px-3 py-1.5 text-xs text-sn-text hover:bg-sn-hover',
  ghost: 'min-h-8 bg-transparent px-2 py-1 text-xs text-sn-muted hover:bg-sn-surface hover:text-sn-text',
  compact: 'min-h-7 bg-sn-surface px-2.5 py-[3px] text-[11px] text-sn-text hover:bg-sn-hover',
}

interface ActionButtonOptions {
  /** @default 'secondary' */
  variant?: ButtonVariant
  className?: string
  disabled?: boolean
  pressed?: boolean
  index?: number
  /** 图标按钮：渲染对应图标代替文字，text 用作可访问名 */
  icon?: 'x'
}

function actionButton(text: string, action: PanelAction, callbacks: PanelCallbacks, options: ActionButtonOptions = {}) {
  const { variant = 'secondary', className = '' } = options
  return html`
    <button
      type="button"
      class=${`inline-flex cursor-pointer items-center justify-center rounded-lg font-medium leading-5 transition-colors ${focusRing} disabled:cursor-default disabled:opacity-40 ${
    variantClasses[variant]
  } ${className}`}
      data-action=${action}
      ?disabled=${options.disabled ?? false}
      aria-pressed=${options.pressed === undefined ? nothing : String(options.pressed)}
      aria-label=${options.icon === undefined ? nothing : text}
      data-index=${options.index === undefined ? '' : options.index}
      @click=${() => callbacks.onAction(action, options.index)}
    >${options.icon === 'x' ? xIcon() : text}</button>
  `
}

/** 关闭按钮的叉号图标 */
function xIcon() {
  return html`
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  `
}

/** 把手行的拖拽提示图标：两列三行圆点 */
function gripIcon() {
  return html`
    <svg class="mx-1 shrink-0 text-sn-subtle" width="10" height="16" viewBox="0 0 10 16" fill="currentColor" aria-hidden="true">
      <circle cx="2" cy="2.5" r="1.4" />
      <circle cx="8" cy="2.5" r="1.4" />
      <circle cx="2" cy="8" r="1.4" />
      <circle cx="8" cy="8" r="1.4" />
      <circle cx="2" cy="13.5" r="1.4" />
      <circle cx="8" cy="13.5" r="1.4" />
    </svg>
  `
}
