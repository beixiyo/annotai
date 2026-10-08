/** 剪贴板写入：Clipboard API 不可用时退回临时选区复制，并恢复面板内焦点 */
export async function writeClipboard(shadow: ShadowRoot, value: string) {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(value)
    return true
  }
  catch {
    const focused = shadow.activeElement as HTMLElement | null
    const fallback = document.createElement('textarea')
    fallback.value = value
    fallback.style.cssText = 'position:fixed;opacity:0;pointer-events:none'
    shadow.append(fallback)
    try {
      fallback.focus()
      fallback.select()
      return document.execCommand('copy')
    }
    catch {
      return false
    }
    finally {
      fallback.remove()
      focused?.focus({ preventScroll: true })
    }
  }
}
