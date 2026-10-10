/** DOM 查询、选区几何与捕获文本；不持有面板状态或全局监听器 */
import { SOURCE_ATTRIBUTE, SOURCE_USE_PATH_ATTRIBUTE } from '@annotai/protocol'
import type { HotKey, SourceRef } from '@annotai/protocol'
import type { Translator } from './i18n.js'
import type { Point } from './types.js'

/** 可选中的标记元素：定义处索引或使用处明文路径，取最近者 */
const MARKED_SELECTOR = `[${SOURCE_ATTRIBUTE}],[${SOURCE_USE_PATH_ATTRIBUTE}]`

export function element<K extends keyof HTMLElementTagNameMap>(tag: K, className = '') {
  const node = document.createElement(tag)
  if (className) node.className = className
  return node
}

/** 事件目标所在的最近标记元素；预构建模块渲染的 DOM 只带使用处路径，同样可选中 */
export function markedElement(target: EventTarget | null) {
  return target instanceof Element ? target.closest(MARKED_SELECTOR) ?? undefined : undefined
}

/** 元素的定位引用：优先定义处索引 ID；仅有使用处明文路径时按位置反查（响应返回真实 ID，后续锚定仍走 ID） */
export function sourceRefOf(target: Element): SourceRef | undefined {
  const id = target.getAttribute(SOURCE_ATTRIBUTE)
  if (id) return { id }
  const usePath = target.getAttribute(SOURCE_USE_PATH_ATTRIBUTE)
  return usePath ? { usePath } : undefined
}

export function isEditable(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, textarea, select, [contenteditable="true"]'))
}

export function isInsideHost(target: EventTarget | null, host: HTMLElement) {
  return target instanceof Node && host.contains(target)
}

const ALL_HOT_KEYS: HotKey[] = ['altKey', 'shiftKey', 'ctrlKey', 'metaKey']

/** 修饰键组合精确匹配：配置的键全部按下且其余修饰键均未按下；PointerEvent 与 KeyboardEvent 均适用 */
export function matchesHotKeys(event: Pick<MouseEvent, HotKey>, keys: HotKey[]) {
  return keys.length > 0 && ALL_HOT_KEYS.every((key) => event[key] === keys.includes(key))
}

export function uniqueElements(elements: Element[]) {
  return [...new Set(elements)]
}

/** 完整位于框内的可见标记元素，排除已选祖先的后代 */
export function elementsInRect(start: Point | undefined, end: Point, host: HTMLElement) {
  if (!start) return []
  const rect = rectFromPoints(start, end)
  const candidates = [...document.querySelectorAll<HTMLElement>(MARKED_SELECTOR)].filter((element) => {
    if (host.contains(element)) return false
    const item = element.getBoundingClientRect()
    if (item.width <= 0 || item.height <= 0) return false
    const style = getComputedStyle(element)
    if (style.display === 'none' || style.visibility === 'hidden') return false
    return item.left >= rect.left && item.right <= rect.right && item.top >= rect.top && item.bottom <= rect.bottom
  })
  const visible = candidates.filter((element) => !candidates.some((parent) => parent !== element && parent.contains(element)))
  return visible.slice(0, 100)
}

export function selectParent(elements: Element[]) {
  return uniqueElements(elements.map((element) => element.parentElement?.closest(MARKED_SELECTOR)).filter(Boolean) as Element[])
}

export function selectChild(elements: Element[]) {
  return uniqueElements(elements.flatMap((element) => [element.querySelector(MARKED_SELECTOR)].filter(Boolean) as Element[]))
}

export function textOf(element: Element) {
  return (element.textContent ?? '').trim().replace(/\s+/g, ' ').slice(0, 1000)
}

export function createDomPath(element: Element) {
  const parts: string[] = []
  let current: Element | null = element
  while (current && current !== document.documentElement && parts.length < 8) {
    let part = current.tagName.toLowerCase()
    if (current.id) part += `#${CSS.escape(current.id)}`
    else {
      const classes = [...current.classList].slice(0, 2).map(CSS.escape)
      if (classes.length) part += `.${classes.join('.')}`
    }
    parts.unshift(part)
    current = current.parentElement
  }
  return parts.join(' > ')
}

export function formatSourceLocation(path: string, line: number, column: number) {
  return path ? `${path}:${line}:${column}` : ''
}

export function rectFromPoints(start: Point, end: Point) {
  return {
    left: Math.min(start.x, end.x),
    top: Math.min(start.y, end.y),
    right: Math.max(start.x, end.x),
    bottom: Math.max(start.y, end.y),
    width: Math.abs(start.x - end.x),
    height: Math.abs(start.y - end.y),
  }
}

/**
 * 源码服务返回的结构化错误；code 与服务端响应体中的 error 字段一致
 * id 为服务端指出的出错源码 ID（如 409 stale-source），便于定位具体标注
 */
export class SourceServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message?: string, readonly id?: string) {
    super(message ?? code)
    this.name = 'SourceServiceError'
  }
}

const STALE_CODES = new Set(['stale-source', 'source-not-found'])

/** 面板展示用的错误文案；源码过期类错误统一提示重新选择 */
export function errorMessage(error: unknown, t: Translator) {
  if (error instanceof SourceServiceError) {
    if (STALE_CODES.has(error.code)) return t('statusStale')
    // 未带 message 时 Error.message 回落为 code，此时展示本地化的通用失败文案
    return error.message && error.message !== error.code ? error.message : t('serviceFailed', { status: error.status })
  }
  return error instanceof Error ? error.message : t('serviceFailed', { status: 0 })
}

export function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === 'AbortError'
}
