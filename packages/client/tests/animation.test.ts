/**
 * 在真实 Chromium 读取动画中的几何位置：面板双向过渡、高亮框接续、减少动态效果与卸载清理
 * 不用 jsdom 推断视觉生命周期；通过暂停并推进 WAAPI 时间线取中间状态
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { commands, page } from 'vitest/browser'
import { mountAnnotai } from '../src/index.js'

declare module 'vitest/browser' {
  interface BrowserCommands {
    emulateMedia(options: { reducedMotion: 'reduce' | 'no-preference' }): Promise<void>
  }
}

interface Rect {
  left: number
  top: number
  width: number
  height: number
}

const mounted: Array<() => void> = []

function mount(config: Partial<Parameters<typeof mountAnnotai>[0]> = {}) {
  const dispose = mountAnnotai({ endpoint: '/__annotai', token: 't', ...config })
  mounted.push(dispose)
  return dispose
}

function root() {
  const host = document.querySelector<HTMLElement>('[data-annotai-ui]')
  expect(host?.shadowRoot).toBeTruthy()
  return host!.shadowRoot!
}

function click(action: string) {
  const button = root().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)
  expect(button, `缺少操作按钮: ${action}`).toBeTruthy()
  button!.click()
}

function panel() {
  return root().querySelector<HTMLElement>('.annotai-panel')!
}

function rectOf(element: Element): Rect {
  const { left, top, width, height } = element.getBoundingClientRect()
  return { left, top, width, height }
}

function expectNear(actual: Rect, expected: Rect, label: string) {
  for (const key of ['left', 'top', 'width', 'height'] as const) {
    expect(Math.abs(actual[key] - expected[key]), `${label}: ${key}`).toBeLessThanOrEqual(1)
  }
}

function isNear(a: Rect, b: Rect) {
  return (['left', 'top', 'width', 'height'] as const).every((key) => Math.abs(a[key] - b[key]) < 1)
}

/** 暂停元素（含子树）上的全部动画并推进到给定进度 */
function sample(element: Element, fraction: number) {
  const animations = element.getAnimations({ subtree: true })
  expect(animations.length, '没有实际过渡动画').toBeGreaterThan(0)
  for (const animation of animations) {
    animation.pause()
    animation.currentTime = Number(animation.effect!.getTiming().duration) * fraction
  }
  return rectOf(element)
}

async function finish(element: Element) {
  for (const animation of element.getAnimations({ subtree: true })) animation.finish()
  await nextFrames()
  return rectOf(element)
}

function nextFrames() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
}

/** 媒体偏好变更事件异步派发；等待浏览器通知，而不是用固定 sleep 猜测时间 */
async function setReducedMotion(reducedMotion: 'reduce' | 'no-preference') {
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  if (query.matches === (reducedMotion === 'reduce')) return
  const changed = new Promise<void>((resolve) => query.addEventListener('change', () => resolve(), { once: true }))
  await commands.emulateMedia({ reducedMotion })
  await changed
}

function hover(target: Element) {
  target.dispatchEvent(new PointerEvent('pointermove', { bubbles: true }))
}

beforeEach(async () => {
  await page.viewport(1200, 800)
  await setReducedMotion('no-preference')
  vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise(() => {}))
})

afterEach(async () => {
  mounted.splice(0).forEach((dispose) => dispose())
  document.body.replaceChildren()
  vi.restoreAllMocks()
  await setReducedMotion('no-preference')
})

describe('panel transition', () => {
  it('interpolates size in both directions and continues from the current rect on quick reversal', async () => {
    mount()
    const target = panel()
    const closed = rectOf(target)

    click('toggle-panel')
    expectNear(sample(target, 0), closed, '展开起点跳变')
    const openingMiddle = sample(target, 0.4)
    expect(openingMiddle.width).toBeGreaterThan(closed.width + 1)
    expect(openingMiddle.height).toBeGreaterThan(closed.height + 1)

    click('close-panel')
    const closingStart = sample(target, 0)
    expectNear(closingStart, openingMiddle, '中途收起跳变')
    const closingMiddle = sample(target, 0.4)
    expect(closingMiddle.width).toBeLessThan(closingStart.width)
    expect(closingMiddle.width).toBeGreaterThan(closed.width)

    // 收起过程中按钮固定在视口右下角，旧控件已移除
    const launcher = root().querySelector('.annotai-open-button')!.getBoundingClientRect()
    expect(Math.abs(launcher.right - (window.innerWidth - 20))).toBeLessThanOrEqual(1)
    expect(Math.abs(launcher.bottom - (window.innerHeight - 20))).toBeLessThanOrEqual(1)
    expect(root().querySelector('[data-action="toggle-selection"]')).toBeNull()

    click('toggle-panel')
    expectNear(sample(target, 0), closingMiddle, '中途重新展开跳变')
    const opened = await finish(target)
    expect(opened.width).toBeGreaterThan(openingMiddle.width)
    expect(opened.height).toBeGreaterThan(openingMiddle.height)

    click('close-panel')
    sample(target, 0)
    expectNear(await finish(target), closed, '收起终点没有回到按钮')
    expect(target.getAnimations({ subtree: true })).toHaveLength(0)
  })

  it('drops the running transition on resize and leaves no surface or animation behind', async () => {
    mount()
    const target = panel()
    const closed = rectOf(target)
    click('toggle-panel')
    await finish(target)
    click('close-panel')
    sample(target, 0.4)

    window.dispatchEvent(new Event('resize'))
    expectNear(rectOf(target), closed, '窗口变化后没有恢复按钮尺寸')
    const surface = root().querySelector<HTMLElement>('.annotai-transition-surface')
    if (surface) expect(getComputedStyle(surface).display).toBe('none')
    expect(target.getAnimations({ subtree: true })).toHaveLength(0)
  })
})

describe('motion lifecycle', () => {
  it('uses real WAAPI, cancels on reopen, honors reduced motion at runtime and cleans up on dispose', async () => {
    const dispose = mount()
    click('toggle-panel')
    const opening = panel().getAnimations().map((animation) => (animation.effect as KeyframeEffect).getKeyframes())
    expect(opening.length, '面板打开没有真实动画').toBeGreaterThan(0)

    // Motion mini 可为不同属性分别创建 WAAPI 动画；重开后不应超过一次打开的数量
    click('close-panel')
    click('toggle-panel')
    expect(panel().getAnimations()).toHaveLength(opening.length)

    await setReducedMotion('reduce')
    expect(panel().getAnimations(), '减少动态效果未停止动画').toHaveLength(0)
    click('close-panel')
    click('toggle-panel')
    expect(panel().getAnimations(), '减少动态效果仍启动动画').toHaveLength(0)

    await setReducedMotion('no-preference')
    click('close-panel')
    click('toggle-panel')
    const target = panel()
    expect(target.getAnimations().length).toBeGreaterThan(0)
    dispose()
    dispose()
    expect(document.querySelector('[data-annotai-ui]')).toBeNull()
    expect(target.getAnimations()).toHaveLength(0)
  })

  it('never animates when animation is disabled explicitly', () => {
    mount({ animation: false })
    click('toggle-panel')
    expect(panel().getAnimations({ subtree: true })).toHaveLength(0)
  })
})

describe('highlight transition', () => {
  function targets() {
    const list: HTMLElement[] = []
    for (let index = 0; index < 3; index += 1) {
      const heading = document.createElement('h3')
      heading.dataset.annotai = `heading-${index}`
      heading.textContent = `标题 ${index}`
      heading.style.cssText = `position:absolute;left:${40 + index * 120}px;top:${60 + index * 90}px;width:${160 + index * 40}px;height:32px;margin:0`
      document.body.append(heading)
      list.push(heading)
    }
    const spacer = document.createElement('div')
    spacer.style.height = '2000px'
    document.body.append(spacer)
    return list
  }

  it('reuses one box, continues from the current rect when retargeted mid-animation and snaps on scroll', async () => {
    const [first, second, third] = targets()
    window.scrollTo(0, 0)
    await nextFrames()
    mount()
    click('toggle-panel')

    hover(first)
    const box = root().querySelector<HTMLElement>('.annotai-highlight.selected')!
    expect(box).toBeTruthy()
    const initial = rectOf(box)
    expectNear(initial, rectOf(first), '首次出现位置错误')

    hover(second)
    expect(root().querySelector('.annotai-highlight.selected'), '切换时重建了高亮节点').toBe(box)
    expectNear(rectOf(box), initial, '切换直接跳到了终点')
    const animations = box.getAnimations()
    expect(animations.length, '高亮框没有几何动画').toBeGreaterThan(0)
    for (const animation of animations) {
      animation.pause()
      animation.currentTime = Number(animation.effect!.getTiming().duration) * 0.35
    }
    const middle = rectOf(box)
    expect(isNear(middle, initial) || isNear(middle, rectOf(second)), '没有真实中间位置').toBe(false)

    hover(third)
    expectNear(rectOf(box), middle, '动画中途换目标发生跳变')
    const label = box.querySelector('.annotai-highlight-label')!
    expect(
      label.getAnimations().some((animation) => (animation.effect as KeyframeEffect).getKeyframes().some((frame) => 'filter' in frame)),
      '标签缺少模糊过渡',
    ).toBe(true)

    // 真实滚动后，高亮应立即对齐目标，不能继续追赶旧视口坐标
    window.scrollBy(0, 100)
    await nextFrames()
    expect(Math.abs(box.getBoundingClientRect().top - third.getBoundingClientRect().top)).toBeLessThanOrEqual(1)
    expect(box.getAnimations()).toHaveLength(0)
  })

  it('positions directly under reduced motion and removes boxes on close', async () => {
    const [first] = targets()
    mount()
    click('toggle-panel')
    await setReducedMotion('reduce')

    hover(first)
    const box = root().querySelector<HTMLElement>('.annotai-highlight.selected')!
    expect(Math.abs(box.getBoundingClientRect().left - first.getBoundingClientRect().left)).toBeLessThanOrEqual(1)
    expect(box.getAnimations()).toHaveLength(0)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(root().querySelectorAll('.annotai-highlight')).toHaveLength(0)
  })
})
