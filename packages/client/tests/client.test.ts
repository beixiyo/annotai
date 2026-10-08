import { afterEach, describe, expect, it, vi } from 'vitest'
import { mountAnnotai } from '../src/index.js'

const context = (id: string, line: number, file = '/workspace/src/App.tsx') => ({
  source: {
    id,
    file,
    tag: 'button',
    start: { line, column: 5, offset: 0 },
    end: { line, column: 28, offset: 23 },
  },
  path: file.replace('/workspace/', ''),
  snippet: `<button data-annotai="${id}">操作</button>`,
  startLine: line,
})

function config() {
  return {
    endpoint: '/__annotai',
    token: '',
    animation: false,
    context: {
      sourceLocation: true,
      sourceSnippet: true,
      className: true,
      text: true,
      domPath: false,
    },
    hotKeys: ['altKey', 'shiftKey'] as Array<'altKey' | 'shiftKey'>,
    locale: 'zh' as const,
  }
}

const mounted: Array<() => void> = []

function mount(configValue: Parameters<typeof mountAnnotai>[0] = config()) {
  const dispose = mountAnnotai(configValue)
  mounted.push(dispose)
  return dispose
}

function host() {
  const node = document.querySelector<HTMLElement>('[data-annotai-ui]')
  expect(node?.shadowRoot).toBeTruthy()
  return node!
}

function panel() {
  return host().shadowRoot!
}

function action(name: string) {
  const button = panel().querySelector<HTMLButtonElement>(`[data-action="${name}"]`)
  expect(button).toBeTruthy()
  return button!
}

function click(node: Element, options: MouseEventInit = {}) {
  node.dispatchEvent(new MouseEvent('click', { bubbles: true, ...options }))
}

function pointerClick(node: Element, options: MouseEventInit = {}) {
  const event = { bubbles: true, button: 0, clientX: 20, clientY: 20, ...options }
  node.dispatchEvent(new MouseEvent('pointerdown', event))
  node.dispatchEvent(new MouseEvent('pointerup', event))
}

/** 等待当前选择的源码上下文解析完成（目标预览卡出现） */
async function waitForTargets() {
  await waitFor(() => panel().querySelector('.annotai-target-preview') !== null)
}

function typeDraftQuestion(value: string) {
  const question = panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!
  question.value = value
  question.dispatchEvent(new Event('input', { bubbles: true }))
  return question
}

function externalTarget(id: string, text = '操作') {
  const button = document.createElement('button')
  button.dataset.annotai = id
  button.textContent = text
  document.body.append(button)
  return button
}

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response
}

function isSourceRequest(input: RequestInfo | URL) {
  const url = input instanceof Request ? input.url : String(input)
  return new URL(url, window.location.href).pathname === '/__annotai'
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
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
  localStorage.removeItem('annotai:launcher-position')
  document.documentElement.style.userSelect = ''
  vi.restoreAllMocks()
})

describe('mountAnnotai browser behavior', () => {
  it('preserves the question caret when source context arrives and keeps field toggles controlled', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const target = externalTarget('pending')
    let resolveFetch: (response: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    )
    mount()
    click(action('toggle-panel'))
    pointerClick(target)
    const question = panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!
    question.value = '保留正在编辑的问题'
    question.dispatchEvent(new Event('input', { bubbles: true }))
    question.focus()
    question.setSelectionRange(2, 4)

    resolveFetch(jsonResponse({ sources: [context('pending', 12)] }))
    await waitForTargets()
    const active = panel().activeElement as HTMLTextAreaElement
    expect(active?.value).toBe('保留正在编辑的问题')
    expect([active?.selectionStart, active?.selectionEnd]).toEqual([2, 4])

    const location = panel().querySelector<HTMLInputElement>('[name="sourceLocation"]')!
    location.click()
    expect(panel().querySelector<HTMLInputElement>('[name="sourceLocation"]')!.checked).toBe(false)
    // 复制时自动固化当前草稿，无需单独保存
    click(action('copy-markdown'))
    // 复制流程先等在途选择解析结束，延后到 fetch 被发出后再放行新响应
    await settle()
    resolveFetch(jsonResponse({ sources: [context('pending', 12)] }))
    await waitFor(() => writeText.mock.calls.length === 1)
    expect(writeText.mock.calls[0][0]).toContain('保留正在编辑的问题')
    expect(writeText.mock.calls[0][0]).not.toContain('位置：')
  })

  it('keeps a typed question automatically when selecting the next element and copies both groups', async () => {
    const first = externalTarget('first', '保存')
    const second = externalTarget('second', '删除')
    const realFetch = globalThis.fetch.bind(globalThis)
    const sourceRequests: Array<{ action: string; ids?: string[] }> = []
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (!isSourceRequest(input)) return realFetch(input, init)
      const body = JSON.parse(String(init?.body)) as { action: string; ids?: string[] }
      sourceRequests.push(body)
      const sources = (body.ids ?? []).map((id) => context(id, id === 'first' ? 8 : 16))
      return jsonResponse({ sources })
    })
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    const dispose = mount()

    click(action('toggle-panel'))
    expect(action('toggle-selection').getAttribute('aria-pressed')).toBe('true')
    pointerClick(first)
    await waitForTargets()
    typeDraftQuestion('调整保存按钮')

    // 重复点击同一目标不重置草稿
    pointerClick(first)
    expect(panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!.value).toBe('调整保存按钮')

    // 直接选下一个元素：上一组连同问题自动保留，无需手动保存
    pointerClick(second)
    await waitFor(() => panel().textContent!.includes('已保存（1 组）'))
    expect(panel().querySelector<HTMLTextAreaElement>('[aria-label="编辑第 1 组问题"]')!.value).toBe('调整保存按钮')

    typeDraftQuestion('删除按钮需要危险色')
    click(action('copy-markdown'))
    await waitFor(() => writeText.mock.calls.length === 1)
    expect(writeText.mock.calls[0][0]).toContain('调整保存按钮')
    expect(writeText.mock.calls[0][0]).toContain('删除按钮需要危险色')
    expect(writeText.mock.calls[0][0]).toContain('src/App.tsx:8:5')
    expect(writeText.mock.calls[0][0]).toContain('src/App.tsx:16:5')
    // 两次选择 + 复制前的一次性批量核实
    expect(sourceRequests).toHaveLength(3)
    expect(panel().textContent).toContain('已保存（2 组）')
    click(action('close-panel'))
    click(action('toggle-panel'))
    expect(action('toggle-selection').getAttribute('aria-pressed')).toBe('false')
    dispose()
  })

  it('keeps the typed question while refining the selection with parent and child', async () => {
    const outer = document.createElement('div')
    outer.dataset.annotai = 'outer'
    const inner = document.createElement('button')
    inner.dataset.annotai = 'inner'
    inner.textContent = '内层'
    outer.append(inner)
    document.body.append(outer)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('outer', 4), context('inner', 9)] }))
    mount()

    click(action('toggle-panel'))
    pointerClick(inner)
    await waitForTargets()
    typeDraftQuestion('外层加内边距')

    // 父级/子级是调整当前草稿，已输入的问题保留
    click(action('select-parent'))
    // 父级解析期间预览卡先消失再回来，轮询需容忍瞬态
    await waitFor(() => panel().querySelector('.annotai-target-preview')?.textContent?.includes('第 4 行') === true)
    expect(panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!.value).toBe('外层加内边距')
    click(action('select-child'))
    await waitFor(() => panel().querySelector('.annotai-target-preview')?.textContent?.includes('第 9 行') === true)
    expect(panel().querySelector<HTMLTextAreaElement>('[aria-label="当前选择的问题"]')!.value).toBe('外层加内边距')
    expect(panel().textContent).not.toContain('已保存')
  })

  it('discards an unfinished draft but keeps a valid one when closing the panel', async () => {
    const first = externalTarget('keep-close', '保留')
    const second = externalTarget('discard-me', '丢弃')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('keep-close', 5), context('discard-me', 7)] }))
    mount()

    click(action('toggle-panel'))
    pointerClick(second)
    await waitForTargets()
    typeDraftQuestion('这条不要了')
    click(action('discard-draft'))
    expect(panel().textContent).not.toContain('当前选择')

    pointerClick(first)
    await waitForTargets()
    typeDraftQuestion('关闭面板也不丢')
    click(action('close-panel'))
    click(action('toggle-panel'))
    expect(panel().textContent).toContain('已保存（1 组）')
    expect(panel().querySelector<HTMLTextAreaElement>('[aria-label="编辑第 1 组问题"]')!.value).toBe('关闭面板也不丢')
  })

  it('does not intercept marked business clicks after repeated dispose and remount cleanup', () => {
    const business = document.createElement('button')
    business.dataset.annotai = 'business'
    let clicks = 0
    let lastEvent: MouseEvent | undefined
    business.addEventListener('click', (event) => {
      clicks += 1
      lastEvent = event
    })
    document.body.append(business)

    const firstDispose = mount()
    const firstUi = host()
    click(action('toggle-panel'))
    expect(host()).toBe(firstUi)
    firstDispose()
    firstDispose()
    expect(document.querySelector('[data-annotai-ui]')).toBeNull()

    const firstClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    business.dispatchEvent(firstClick)
    expect(clicks).toBe(1)
    expect(lastEvent).toBe(firstClick)
    expect(firstClick.defaultPrevented).toBe(false)

    const secondDispose = mount()
    const recreated = host()
    expect(recreated).not.toBe(firstUi)
    click(action('toggle-panel'))
    secondDispose()
    expect(document.querySelector('[data-annotai-ui]')).toBeNull()

    const secondClick = new MouseEvent('click', { bubbles: true, cancelable: true })
    business.dispatchEvent(secondClick)
    expect(clicks).toBe(2)
    expect(lastEvent).toBe(secondClick)
    expect(secondClick.defaultPrevented).toBe(false)
  })

  it.each(['close', 'dispose'] as const)('discards the questionless draft after %s，late resolve never renders', async (mode) => {
    const target = externalTarget('late')
    let resolveFetch: (response: Response) => void = () => {}
    vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    )
    const dispose = mount()
    click(action('toggle-panel'))
    pointerClick(target)
    await waitFor(() => panel().textContent?.includes('正在读取源码') ?? false)
    if (mode === 'close') {
      click(action('close-panel'))
      // 关闭会等在途解析结束，面板暂时仍在
      expect(document.querySelector('[data-annotai-ui]')).not.toBeNull()
    }
    else {
      dispose()
      expect(document.querySelector('[data-annotai-ui]')).toBeNull()
    }
    resolveFetch(jsonResponse({ sources: [context('late', 22)] }))
    if (mode === 'close') {
      // 迟到的解析只用于收尾，未写问题的草稿直接舍弃，面板收起后不残留目标内容
      await waitFor(() => panel().querySelector('[data-action="toggle-panel"]') !== null)
      expect(panel().textContent).not.toContain('当前选择')
      expect(panel().textContent).not.toContain('目标 1')
    }
    else {
      expect(document.querySelector('[data-annotai-ui]')).toBeNull()
    }
    dispose()
  })

  it('keeps page selection and native drag out of the launcher drag', async () => {
    const dispose = mount()
    const launcherButton = action('toggle-panel')
    const rect = launcherButton.getBoundingClientRect()
    const base = { bubbles: true, button: 0, pointerId: 1, isPrimary: true, cancelable: true }
    const at = (x: number, y: number) => ({ ...base, clientX: rect.left + x, clientY: rect.top + y })

    // pointerdown 阻止默认行为：原生文本选择与拖拽不会从把手启动
    const down = new PointerEvent('pointerdown', at(10, 10))
    launcherButton.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(true)

    // 把手内的原生 dragstart 一律阻止
    const drag = new DragEvent('dragstart', { bubbles: true, cancelable: true })
    launcherButton.dispatchEvent(drag)
    expect(drag.defaultPrevented).toBe(true)

    // 超过阈值进入拖动：页面选择被锁住；松开后恢复，位置持久化（受视口钳制）且拖动后的 click 被吞掉
    launcherButton.dispatchEvent(new PointerEvent('pointermove', at(-60, -80)))
    expect(document.documentElement.style.userSelect).toBe('none')
    launcherButton.dispatchEvent(new PointerEvent('pointerup', at(-60, -80)))
    expect(document.documentElement.style.userSelect).toBe('')
    const stored = JSON.parse(localStorage.getItem('annotai:launcher-position')!) as { left: number; top: number }
    expect(stored.left).toBeLessThan(rect.left - 40)
    expect(stored.top).toBeLessThan(rect.top - 60)
    launcherButton.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(panel().querySelector('[data-action="toggle-selection"]')).toBeNull()
    dispose()
  })

  it('applies theme dim opacity and css variables from config', async () => {
    const target = externalTarget('theme-1')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('theme-1', 3)] }))
    const dispose = mount({
      endpoint: '/__annotai',
      token: '',
      theme: { dimOpacity: 0.7, vars: { '--sn-primary': 'rgb(255, 0, 0)', '--sn-highlight': '#00ff00', bogus: 'x' } },
    })
    const ui = document.querySelector<HTMLElement>('[data-annotai-ui]')!
    // 合法 --sn-* 变量写入根节点，非法键被忽略
    expect(ui.style.getPropertyValue('--sn-primary')).toBe('rgb(255, 0, 0)')
    expect(ui.style.getPropertyValue('--sn-highlight')).toBe('#00ff00')
    expect(ui.style.getPropertyValue('bogus')).toBe('')

    // 选择模式下指针移到页面上：面板淡出到配置的透明度
    click(action('toggle-panel'))
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    const panelNode = ui.shadowRoot!.querySelector<HTMLElement>('.annotai-panel')!
    expect(panelNode.style.opacity).toBe('0.7')
    // 回到面板恢复不透明：真实指针事件被重定向到 host，合成事件直接派发到 host 等价模拟
    ui.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 200, clientY: 200 }))
    await settle()
    expect(panelNode.style.opacity).toBe('')
    dispose()
  })

  it('applies default hot keys and context from a minimal config and keeps Alt+Shift away from editable controls', async () => {
    const sourceButton = externalTarget('open')
    const editable = document.createElement('input')
    editable.dataset.annotai = 'editable'
    editable.value = '编辑内容'
    document.body.append(editable)
    const requests: Array<{ action: string; id?: string }> = []
    const realFetch = globalThis.fetch.bind(globalThis)
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      if (!isSourceRequest(input)) return realFetch(input, init)
      const body = JSON.parse(String(init?.body)) as { action: string; id?: string; ids?: string[] }
      requests.push(body)
      if (body.action === 'resolve') return jsonResponse({ sources: (body.ids ?? []).map((id) => context(id, 3)) })
      return jsonResponse({ ok: true })
    })
    // 只给必填字段：hotKeys 与 context 由客户端归一化，是宿主透传配置的前提
    const dispose = mount({ endpoint: '/__annotai', token: '' })

    click(sourceButton, { altKey: true, shiftKey: true })
    await waitFor(() => requests.length === 1)
    expect(requests[0]).toEqual({ action: 'open', id: 'open' })

    editable.focus()
    click(editable, { altKey: true, shiftKey: true })
    await settle()
    expect(requests).toHaveLength(1)
    expect(document.activeElement).toBe(editable)

    click(action('toggle-panel'))
    pointerClick(sourceButton)
    await waitFor(() => panel().querySelector('[name="domPath"]') !== null)
    expect(panel().querySelector<HTMLInputElement>('[name="sourceSnippet"]')!.checked).toBe(true)
    expect(panel().querySelector<HTMLInputElement>('[name="domPath"]')!.checked).toBe(false)
    dispose()
  })

  it('previews the jump target as a highlight while hot keys are held with the panel closed', async () => {
    const target = externalTarget('preview')
    const dispose = mount({ endpoint: '/__annotai', token: '', hoverPreview: false })
    const highlights = () => panel().querySelectorAll('.annotai-highlight')

    // 按住热键移动：出现预览高亮
    document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => highlights().length === 1)
    expect(highlights()[0].className).toContain('hovered')

    // 鼠标移到未标注区域：预览消失
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => highlights().length === 0)

    // 再按住出现后，仅松开热键（鼠标不动）：预览也消失
    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => highlights().length === 1)
    window.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, shiftKey: false }))
    await waitFor(() => highlights().length === 0)
    dispose()
  })

  it('copies the formatter output when formatCopy is provided', async () => {
    const target = externalTarget('format-copy')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('format-copy', 8)] }))
    mount({
      ...config(),
      formatCopy: ({ annotations, fields }) => `CUSTOM:${annotations.length}:${fields.domPath}:${annotations[0]?.question ?? ''}`,
    })

    click(action('toggle-panel'))
    pointerClick(target)
    await waitForTargets()
    typeDraftQuestion('换个颜色')
    click(action('copy-markdown'))
    await waitFor(() => writeText.mock.calls.length === 1)
    expect(writeText.mock.calls[0][0]).toBe('CUSTOM:1:false:换个颜色')
  })

  it('renders the panel in English by default and exports English Markdown', async () => {
    const target = externalTarget('i18n-en')
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('i18n-en', 12)] }))
    mount({ ...config(), locale: 'en' })

    click(action('toggle-panel'))
    pointerClick(target)
    await waitForTargets()
    const question = panel().querySelector<HTMLTextAreaElement>('[aria-label="Question for this selection"]')!
    question.value = 'make it red'
    question.dispatchEvent(new Event('input', { bubbles: true }))
    click(action('copy-markdown'))
    await waitFor(() => writeText.mock.calls.length === 1)
    const markdown = writeText.mock.calls[0][0] as string
    expect(panel().textContent).toContain('Saved (1)')
    expect(markdown).toContain('# Source Notes')
    expect(markdown).toContain('Question: make it red')
    expect(markdown).toContain('Location: `src/App.tsx:12:5`')
  })

  it('shows a source preview card while selecting with the panel open, and hides it on leave', async () => {
    const target = externalTarget('hover-1')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('hover-1', 12)] }))
    mount({ ...config(), hoverPreview: true })
    // 空面板打开后自动进入选择模式
    click(action('toggle-panel'))
    const card = () => panel().querySelector('.annotai-hover-preview')

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await waitFor(() => card() !== null, 1500)
    expect(card()!.textContent).toContain('src/App.tsx:12:5')
    expect(card()!.textContent).toContain('data-annotai="hover-1"')
    // 元素自身行在片段中高亮，能一眼定位目标代码
    const highlighted = card()!.querySelector<HTMLElement>('.annotai-preview-row-active')
    expect(highlighted?.textContent).toContain('data-annotai="hover-1"')
    // 选择模式下悬停即高亮，预览卡指向同一元素
    await waitFor(() => panel().querySelectorAll('.annotai-highlight').length === 1)

    // 移开到未标注区域：卡片与高亮一起消失
    document.body.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 500, clientY: 300 }))
    await waitFor(() => card() === null)
    await waitFor(() => panel().querySelectorAll('.annotai-highlight').length === 0)
  })

  it('skips the dwell delay for the hover preview while hot keys are held', async () => {
    const target = externalTarget('hover-2')
    let resolveFetch: (response: Response) => void = () => {}
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve
      })
    )
    mount({ ...config() })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    // 立即路径不等停留延时：微任务内即已发请求（默认开启 hoverPreview）
    await settle()
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    // 预览请求按显示行数向服务端取片段，不受全局 surroundingLines 限制
    const previewBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(previewBody.surroundingLines).toBe(20)
    resolveFetch(jsonResponse({ sources: [context('hover-2', 7)] }))
    await waitFor(() => panel().querySelector('.annotai-hover-preview') !== null)
    expect(panel().querySelector('.annotai-hover-preview')!.textContent).toContain('src/App.tsx:7:5')
  })

  it('keeps plain dwelling quiet while the panel is closed', async () => {
    const target = externalTarget('hover-quiet')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('hover-quiet', 9)] }))
    mount()

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 5, clientY: 5 }))
    await new Promise((resolve) => setTimeout(resolve, 450))
    expect(panel().querySelector('.annotai-hover-preview')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('hides the hover preview entirely when explicitly disabled', async () => {
    const target = externalTarget('hover-off')
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('hover-off', 3)] }))
    mount({ ...config(), hoverPreview: false })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await settle()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(panel().querySelector('.annotai-hover-preview')).toBeNull()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('applies the configured preview size and wraps long snippet lines instead of clipping', async () => {
    const target = externalTarget('hover-size')
    const longSnippet = Array.from(
      { length: 12 },
      (_, index) => `${index}: const value = someVeryLongFunctionCall(withManyArguments${index}, andEvenMoreArguments))`,
    ).join('\n')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [{ ...context('hover-size', 12), snippet: longSnippet }] }))
    mount({ ...config(), hoverPreview: { width: 480, maxLines: 3 } })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true, clientX: 5, clientY: 5 }))
    await waitFor(() => panel().querySelector('.annotai-hover-preview') !== null, 1500)
    const card = panel().querySelector<HTMLElement>('.annotai-hover-preview')!
    expect(card.style.width).toBe('480px')
    const code = card.querySelector<HTMLElement>('pre')!
    expect(code.style.maxHeight).toBe('54px')
    // 真实布局：长行自动换行后不横向溢出
    expect(code.scrollWidth).toBeLessThanOrEqual(code.clientWidth + 1)
  })

  it('syntax-highlights preview lines and keeps multi-line tokens colored on every row', async () => {
    const target = externalTarget('hover-hl')
    const snippet = ['/**', ' * 多行注释说明', ' */', 'const label = "text"'].join('\n')
    const record = context('hover-hl', 4)
    record.startLine = 1
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [{ ...record, snippet }] }))
    mount({ ...config(), hoverPreview: { width: 560, maxLines: 20 } })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => panel().querySelector('.annotai-hover-preview') !== null)
    const code = panel().querySelector('.annotai-hover-preview pre')!
    // 关键字与字符串有着色 token
    expect(code.querySelectorAll('.token.keyword, .token.string').length).toBeGreaterThan(0)
    // 跨行注释的每一行都保留着色，而不是只有首行
    const rows = [...code.children]
    expect(rows[0].querySelector('.token.comment')).toBeTruthy()
    expect(rows[1].querySelector('.token.comment')).toBeTruthy()
    expect(rows[2].querySelector('.token.comment')).toBeTruthy()
    // 高亮行与 token 着色共存：行青景与 span 颜色叠加
    expect(rows[3].className).toContain('annotai-preview-row-active')
    expect(rows[3].querySelector('.token.string')).toBeTruthy()
  })

  it('falls back to plain text for unknown file extensions', async () => {
    const target = externalTarget('hover-plain')
    const record = context('hover-plain', 1, '/workspace/src/CHANGELOG')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [record] }))
    mount({ ...config(), hoverPreview: true })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => panel().querySelector('.annotai-hover-preview') !== null)
    const code = panel().querySelector('.annotai-hover-preview pre')!
    expect(code.querySelectorAll('.token').length).toBe(0)
    expect(code.textContent).toContain('data-annotai="hover-plain"')
  })

  it('keeps the highlighted element row visible when the snippet exceeds the card height', async () => {
    const target = externalTarget('hover-scroll')
    // 元素在第 25 行、片段从第 5 行起：高亮行在 41 行片段的第 20 行，超出 20 行可视高度
    const record = context('hover-scroll', 25)
    record.startLine = 5
    const snippet = Array.from({ length: 41 }, (_, index) => `line-${index + 5}`).join('\n')
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [{ ...record, snippet }] }))
    mount({ ...config(), hoverPreview: { width: 560, maxLines: 20 } })

    target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await waitFor(() => panel().querySelector('.annotai-hover-preview') !== null)
    const code = panel().querySelector<HTMLElement>('.annotai-hover-preview pre')!
    expect(code.scrollTop).toBeGreaterThan(0)
    const row = panel().querySelector<HTMLElement>('.annotai-hover-preview .annotai-preview-row-active')!
    const codeRect = code.getBoundingClientRect()
    const rowRect = row.getBoundingClientRect()
    // 高亮行整体落在可视区内
    expect(rowRect.top).toBeGreaterThanOrEqual(codeRect.top - 1)
    expect(rowRect.bottom).toBeLessThanOrEqual(codeRect.bottom + 1)
  })

  it('never requests a hover preview for editable controls even with hot keys held', async () => {
    const input = document.createElement('input')
    input.dataset.annotai = 'editable-1'
    document.body.append(input)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => jsonResponse({ sources: [context('editable-1', 5)] }))
    mount({ ...config(), hoverPreview: true })

    input.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, altKey: true, shiftKey: true }))
    await settle()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(panel().querySelector('.annotai-hover-preview')).toBeNull()
  })
})
