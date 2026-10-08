/** 会话交互回归：选择模式吞点击、Escape 作用域、拖框收尾与热键预览失焦清理 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mountAnnotai } from '../src/index.js'

function config() {
  return {
    endpoint: '/__annotai',
    token: '',
    animation: false,
    hotKeys: ['altKey', 'shiftKey'] as Array<'altKey' | 'shiftKey'>,
    locale: 'zh' as const,
  }
}

const mounted: Array<() => void> = []

function mount() {
  const dispose = mountAnnotai(config())
  mounted.push(dispose)
  return dispose
}

function host() {
  return document.querySelector<HTMLElement>('[data-annotai-ui]')!
}

function panel() {
  return host().shadowRoot!
}

function action(name: string) {
  return panel().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)
}

function click(node: Element, options: MouseEventInit = {}) {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, composed: true, ...options }))
}

function pointer(type: string, node: Element, x: number, y: number) {
  node.dispatchEvent(new PointerEvent(type, { bubbles: true, composed: true, button: 0, clientX: x, clientY: y }))
}

function externalTarget(id: string, text = '操作') {
  const button = document.createElement('button')
  button.dataset.annotai = id
  button.textContent = text
  document.body.append(button)
  return button
}

beforeEach(() => {
  // 源码解析请求挂起即可：这些用例只关心事件流，不关心解析结果
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
})

afterEach(() => {
  mounted.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  localStorage.removeItem('annotai:launcher-position')
  vi.restoreAllMocks()
})

describe('session interactions', () => {
  it('swallows clicks on unmarked page elements while selecting', () => {
    mount()
    click(action('toggle-panel')!)
    expect(action('toggle-selection')!.getAttribute('aria-pressed')).toBe('true')

    const link = document.createElement('a')
    link.href = '#navigated'
    link.textContent = '普通链接'
    document.body.append(link)
    const appHandler = vi.fn()
    link.addEventListener('click', appHandler)

    const event = new MouseEvent('click', { bubbles: true, cancelable: true })
    link.dispatchEvent(event)
    expect(appHandler).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(true)
  })

  it('lets Escape from a page input reach the app while the panel is open', async () => {
    mount()
    click(action('toggle-panel')!)
    click(action('toggle-selection')!)
    expect(action('toggle-selection')!.getAttribute('aria-pressed')).toBe('false')

    const input = document.createElement('input')
    document.body.append(input)
    const appHandler = vi.fn()
    document.addEventListener('keydown', appHandler)
    try {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
      expect(appHandler).toHaveBeenCalledTimes(1)
      expect(appHandler.mock.calls[0][0].defaultPrevented).toBe(false)
      await Promise.resolve()
      expect(action('close-panel')).toBeTruthy()
    }
    finally {
      document.removeEventListener('keydown', appHandler)
    }
  })

  it('ignores Escape during IME composition inside the panel', async () => {
    mount()
    click(action('toggle-panel')!)
    click(action('toggle-selection')!)
    const target = panel().querySelector('textarea') ?? action('close-panel')!
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', isComposing: true, bubbles: true, composed: true }))
    await Promise.resolve()
    expect(action('close-panel')).toBeTruthy()
  })

  it('finishes a drag that ends over the panel instead of leaving the drag box behind', () => {
    mount()
    click(action('toggle-panel')!)
    pointer('pointerdown', document.body, 10, 10)
    pointer('pointermove', document.body, 200, 200)
    expect(panel().querySelector('.annotai-drag-box')).toBeTruthy()

    pointer('pointerup', action('close-panel')!, 200, 200)
    expect(panel().querySelector('.annotai-drag-box')).toBeNull()
    // 松开后无按键移动不应再拉出拖框
    pointer('pointermove', document.body, 300, 300)
    expect(panel().querySelector('.annotai-drag-box')).toBeNull()
  })

  it('clears the hotkey preview highlight when the window loses focus', () => {
    const target = externalTarget('preview')
    mount()
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    expect(panel().querySelector('.annotai-highlight.hovered')).toBeTruthy()

    window.dispatchEvent(new Event('blur'))
    expect(panel().querySelector('.annotai-highlight.hovered')).toBeNull()
  })
})
