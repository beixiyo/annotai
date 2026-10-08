/** 宿主事件边界：面板内的真实输入与点击不外泄到页面监听器，预览卡随滚动对位 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { mountAnnotai } from '../src/index.js'

const context = (id: string, line: number) => ({
  source: {
    id,
    file: '/workspace/src/App.tsx',
    tag: 'button',
    start: { line, column: 5, offset: 0 },
    end: { line, column: 28, offset: 23 },
  },
  path: 'src/App.tsx',
  snippet: `<button data-annotai="${id}">操作</button>`,
  startLine: line,
})

const config = {
  endpoint: '/__annotai',
  token: '',
  animation: false,
  hotKeys: ['altKey', 'shiftKey'] as Array<'altKey' | 'shiftKey'>,
  locale: 'zh' as const,
}

const mounted: Array<() => void> = []
const cleanups: Array<() => void> = []

function shadow() {
  return document.querySelector<HTMLElement>('[data-annotai-ui]')!.shadowRoot!
}

function action(name: string) {
  return shadow().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!
}

function externalTarget(id: string) {
  const button = document.createElement('button')
  button.dataset.annotai = id
  button.textContent = '操作'
  document.body.append(button)
  return button
}

function mockSources(id: string) {
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ sources: [context(id, 12)] }) }) as Response)
}

/** 在页面上注册冒泡阶段监听器，记录收到的事件类型 */
function listen(target: Document | Window, types: string[]) {
  const received: string[] = []
  const record = (event: Event) => received.push(event.type)
  for (const type of types) target.addEventListener(type, record)
  cleanups.push(() => types.forEach((type) => target.removeEventListener(type, record)))
  return received
}

async function waitFor(predicate: () => boolean, timeout = 1500) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error('条件等待超时')
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  mounted.splice(0).forEach((dispose) => dispose())
  cleanups.splice(0).forEach((cleanup) => cleanup())
  document.body.replaceChildren()
  document.body.style.height = ''
  window.scrollTo(0, 0)
  localStorage.removeItem('annotai:launcher-position')
  vi.restoreAllMocks()
})

describe('annotai host event boundary', () => {
  it('keeps keys typed into the panel textarea away from page shortcuts while Escape still closes selection', async () => {
    const target = externalTarget('typing-1')
    mockSources('typing-1')
    mounted.push(mountAnnotai(config))
    await userEvent.click(action('toggle-panel'))
    await userEvent.click(target)
    await waitFor(() => shadow().querySelector('textarea') !== null)
    const textarea = shadow().querySelector('textarea')!

    const received = listen(window, ['keydown', 'keyup', 'keypress', 'input', 'beforeinput'])
    textarea.focus()
    await userEvent.keyboard('ab')
    expect(textarea.value).toBe('ab')
    expect(received).toEqual([])

    // annotai 自身在 window capture 阶段处理 Escape，边界不影响
    expect(action('toggle-selection').getAttribute('aria-pressed')).toBe('true')
    await userEvent.keyboard('{Escape}')
    await waitFor(() => action('toggle-selection').getAttribute('aria-pressed') === 'false')
  })

  it('does not fire page click-outside listeners for clicks inside the panel', async () => {
    mounted.push(mountAnnotai(config))
    const received = listen(document, ['pointerdown', 'mousedown', 'click', 'focusin'])
    // 页面自身的点击不受影响（面板打开后会进入选择模式接管页面点击，故先验证）
    const outside = document.createElement('button')
    outside.textContent = 'outside'
    document.body.append(outside)
    await userEvent.click(outside)
    expect(received).toContain('click')

    received.length = 0
    await userEvent.click(action('toggle-panel'))
    expect(shadow().querySelector('[data-action="close-panel"]')).toBeTruthy()
    expect(received).toEqual([])
  })

  it('keeps the hover preview card next to its element when the page scrolls', async () => {
    document.body.style.height = '3000px'
    const target = externalTarget('scroll-1')
    target.style.marginTop = '200px'
    mockSources('scroll-1')
    mounted.push(mountAnnotai({ ...config, hoverPreview: true }))
    await userEvent.click(action('toggle-panel'))
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    const card = () => shadow().querySelector<HTMLElement>('.annotai-hover-preview')
    await waitFor(() => card() !== null)
    const before = Number.parseFloat(card()!.style.top)

    window.scrollTo(0, 100)
    await waitFor(() => Number.parseFloat(card()?.style.top ?? 'NaN') !== before, 500)
    expect(Number.parseFloat(card()!.style.top)).toBe(Math.round(target.getBoundingClientRect().top))
  })

  it('aborts an in-flight hover preview request on dispose', async () => {
    const target = externalTarget('dispose-1')
    let signal: AbortSignal | undefined
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      signal = init?.signal ?? undefined
      return new Promise<Response>(() => {})
    })
    const dispose = mountAnnotai(config)
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => signal !== undefined)
    dispose()
    expect(signal!.aborted).toBe(true)
  })
})
