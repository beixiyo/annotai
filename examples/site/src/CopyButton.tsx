/** 复制按钮：点击写入剪贴板（Clipboard API 不可用时自动降级 execCommand），图标短暂切换为对勾 */
import { createSignal, onCleanup, Show } from 'solid-js'

export interface CopyButtonProps {
  text: string
  label?: string
  class?: string
  /** 复制完成后的回调，宿主可用它触发页面级提示 */
  onCopied?: () => void
}

export function CopyButton(props: CopyButtonProps) {
  const [copied, setCopied] = createSignal(false)

  let resetTimer = 0
  // SSR 下也会执行清理，用全局 clearTimeout 而非 window.*
  onCleanup(() => clearTimeout(resetTimer))

  async function copy() {
    if (await copyToClipboard(props.text)) {
      setCopied(true)
      window.clearTimeout(resetTimer)
      resetTimer = window.setTimeout(() => setCopied(false), 1600)
      props.onCopied?.()
    }
  }

  return (
    <button
      type="button"
      onClick={ copy }
      aria-label={ props.label ?? '复制' }
      class={ `inline-flex shrink-0 cursor-pointer items-center p-1 text-subtle transition-colors hover:text-ink ${props.class ?? ''}` }
    >
      <Show when={ copied() } fallback={ <CopyIcon /> }>
        <CheckIcon />
      </Show>
    </button>
  )
}

/** Clipboard API 优先（非安全上下文如局域网 IP 访问时不存在），降级临时选区 execCommand */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  }
  catch {
    const textarea = document.createElement('textarea')
    textarea.value = text
    Object.assign(textarea.style, {
      position: 'absolute',
      top: '0',
      left: '0',
      transform: 'translate(-9999px, -9999px)',
    })
    // 选中临时 textarea 会抢走焦点，复制后还给原元素，键盘用户不丢失位置
    const previous = document.activeElement as HTMLElement | null
    document.body.appendChild(textarea)
    textarea.select()
    try {
      return document.execCommand('copy')
    }
    finally {
      textarea.remove()
      previous?.focus()
    }
  }
}

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d="M20 6 9 17l-5-5" />
    </svg>
  )
}
