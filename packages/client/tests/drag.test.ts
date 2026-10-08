/** 拖拽回归：拖动中途重渲染不打断拖拽，拖动后未到达的 click 不吞掉下一次真实点击 */
import { afterEach, describe, expect, it } from 'vitest'
import { page, userEvent } from 'vitest/browser'
import { mountAnnotai } from '../src/index.js'

const STORAGE_KEY = 'annotai:launcher-position'
const mounted: Array<() => void> = []

function mount() {
  const dispose = mountAnnotai({
    endpoint: '/__annotai',
    token: '',
    animation: false,
    hotKeys: ['altKey', 'shiftKey'],
    locale: 'zh',
  })
  mounted.push(dispose)
}

function shadow() {
  const node = document.querySelector<HTMLElement>('[data-annotai-ui]')
  expect(node?.shadowRoot).toBeTruthy()
  return node!.shadowRoot!
}

function query<T extends HTMLElement = HTMLElement>(selector: string) {
  const node = shadow().querySelector<T>(selector)
  expect(node).toBeTruthy()
  return node!
}

/** 以 node 左上角为原点派发指针事件；合成事件无活动 pointer，不会产生 click */
function pointer(node: Element, type: string, x: number, y: number) {
  const rect = node.getBoundingClientRect()
  node.dispatchEvent(
    new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      button: 0,
      pointerId: 1,
      isPrimary: true,
      clientX: rect.left + x,
      clientY: rect.top + y,
    }),
  )
}

/** 面板容器在视口中的 left */
function panelLeft() {
  return query('.annotai-panel').getBoundingClientRect().left
}

afterEach(() => {
  mounted.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  localStorage.removeItem(STORAGE_KEY)
  document.documentElement.style.userSelect = ''
})

describe('panel drag', () => {
  it('keeps dragging and persists the final position when a render lands mid-drag', async () => {
    // 默认视口比展开面板窄，水平方向没有拖动余量
    await page.viewport(1280, 800)
    mount()
    query('[data-action="toggle-panel"]').click()
    const handle = query('.annotai-drag-handle')
    const start = handle.getBoundingClientRect()

    // 起点选在把手行左侧 grip 区域，避开行内按钮
    pointer(handle, 'pointerdown', 6, 6)
    pointer(handle, 'pointermove', -40, 6)
    const midLeft = panelLeft()

    // 拖动途中点击把手行内按钮触发一次真实重渲染
    const pressed = query('[data-action="toggle-selection"]').getAttribute('aria-pressed')
    query('[data-action="toggle-selection"]').click()
    expect(query('[data-action="toggle-selection"]').getAttribute('aria-pressed')).not.toBe(pressed)

    // 坐标按拖动起点换算，与把手当前位置无关
    const live = query('.annotai-drag-handle')
    pointer(live, 'pointermove', -80 + start.left - live.getBoundingClientRect().left, 6)
    expect(panelLeft()).toBeLessThan(midLeft - 20)

    pointer(live, 'pointerup', 0, 0)
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { left: number } | null
    expect(stored?.left).toBeCloseTo(panelLeft(), 0)
  })
})

describe('launcher drag', () => {
  it('does not swallow the next real click when the post-drag click never arrives', async () => {
    mount()
    const launcher = query('[data-action="toggle-panel"]')

    // 合成拖动以 pointerup 结束但不会派生 click，模拟松开在窗口外等 click 未到达的场景
    pointer(launcher, 'pointerdown', 10, 10)
    pointer(launcher, 'pointermove', -60, -80)
    pointer(launcher, 'pointerup', -60, -80)
    expect(localStorage.getItem(STORAGE_KEY)).not.toBeNull()

    // 另一次被系统取消的按下也不应残留状态
    pointer(launcher, 'pointerdown', 10, 10)
    pointer(launcher, 'pointercancel', 10, 10)

    await userEvent.click(query('[data-action="toggle-panel"]'))
    expect(shadow().querySelector('[data-action="toggle-selection"]')).not.toBeNull()
  })
})
