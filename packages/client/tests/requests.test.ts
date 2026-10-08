/** 请求生命周期与源码服务错误映射的回归测试：跳转不打断解析、非 JSON 错误响应、复制时过期标注定位 */
import { afterEach, describe, expect, it, vi } from 'vitest'
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

const mounted: Array<() => void> = []

function mount() {
  mounted.push(mountAnnotai({
    endpoint: '/__annotai',
    token: '',
    animation: false,
    hotKeys: ['altKey', 'shiftKey'],
    locale: 'zh',
  }))
}

function panel() {
  return document.querySelector<HTMLElement>('[data-annotai-ui]')!.shadowRoot!
}

function action(name: string) {
  return panel().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)!
}

function click(node: Element, options: MouseEventInit = {}) {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, ...options }))
}

function pointerClick(node: Element) {
  const event = { bubbles: true, button: 0, clientX: 20, clientY: 20 }
  node.dispatchEvent(new MouseEvent('pointerdown', event))
  node.dispatchEvent(new MouseEvent('pointerup', event))
}

function typeDraftQuestion(value: string) {
  const question = panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!
  question.value = value
  question.dispatchEvent(new Event('input', { bubbles: true }))
}

function externalTarget(id: string) {
  const button = document.createElement('button')
  button.dataset.annotai = id
  button.textContent = '操作'
  document.body.append(button)
  return button
}

function jsonResponse(body: unknown, status = 200) {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as Response
}

function mockClipboard() {
  const writeText = vi.fn().mockResolvedValue(undefined)
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}

async function waitFor(predicate: () => boolean, timeout = 250) {
  const started = Date.now()
  while (!predicate()) {
    if (Date.now() - started > timeout) throw new Error(`条件等待超时: ${panel().textContent?.slice(-160)}`)
    await new Promise((resolve) => setTimeout(resolve, 0))
  }
}

afterEach(() => {
  mounted.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe('source service request lifecycle', () => {
  it('keeps resolving the draft target when Alt+Shift opens another source meanwhile', async () => {
    const selected = externalTarget('selected')
    const jumped = externalTarget('jumped')
    let resolveSelection: (response: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation((_input, init) => {
      const body = JSON.parse(String(init?.body)) as { action: string }
      if (body.action === 'open') return Promise.resolve(jsonResponse({ ok: true }))
      return new Promise<Response>((resolve) => {
        resolveSelection = resolve
      })
    })
    const writeText = mockClipboard()
    mount()

    click(action('toggle-panel'))
    pointerClick(selected)
    click(jumped, { altKey: true, shiftKey: true })
    await waitFor(() => panel().textContent!.includes('已在编辑器中打开'))

    resolveSelection(jsonResponse({ sources: [context('selected', 4)] }))
    await waitFor(() => panel().querySelector('.annotai-target-preview') !== null)
    typeDraftQuestion('跳转后输入的问题')
    click(action('copy-markdown'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    resolveSelection(jsonResponse({ sources: [context('selected', 4)] }))
    await waitFor(() => writeText.mock.calls.length === 1)
    expect(writeText.mock.calls[0][0]).toContain('跳转后输入的问题')
  })

  it('maps a non-JSON error page to the localized service failure message', async () => {
    const target = externalTarget('proxied')
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => JSON.parse('<!doctype html><title>Bad Gateway</title>'),
    } as Response)
    mount()

    click(action('toggle-panel'))
    pointerClick(target)
    await waitFor(() => panel().textContent!.includes('源码服务请求失败（502）'))
    expect(panel().textContent).not.toContain('Unexpected token')
  })

  it('names the stale annotation when copy verification returns 409 with its id', async () => {
    const first = externalTarget('first')
    const second = externalTarget('second')
    let verifying = false
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as { ids: string[] }
      if (verifying) return jsonResponse({ error: 'stale-source', id: 'second' }, 409)
      return jsonResponse({ sources: body.ids.map((id) => context(id, 8)) })
    })
    const writeText = mockClipboard()
    mount()

    click(action('toggle-panel'))
    pointerClick(first)
    await waitFor(() => panel().querySelector('.annotai-target-preview') !== null)
    typeDraftQuestion('第一组')
    pointerClick(second)
    await waitFor(() => panel().textContent!.includes('已保存（1 组）') && panel().querySelector('.annotai-target-preview') !== null)
    typeDraftQuestion('第二组')

    verifying = true
    click(action('copy-markdown'))
    await waitFor(() => panel().textContent!.includes('第 2 组的源码已更新'))
    expect(writeText).not.toHaveBeenCalled()
  })
})
