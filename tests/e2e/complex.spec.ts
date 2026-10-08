/** 跨文件定位、重复组件实例、客户端状态与原生交互共存、长列表下的复制入口 */
import { expect, test } from '@playwright/test'
import { closePanel, copyMarkdown, launcher, saveQuestion } from './helpers.js'

test('client-side filtering and details toggling work with source markers present', async ({ page }) => {
  await page.goto('/')
  const search = page.getByRole('searchbox', { name: '搜索常见问题', exact: true })
  await search.fill('完全不存在的关键词')
  await expect(page.locator('#faq details')).toHaveCount(0)
  await search.fill('HMR')
  await expect(page.locator('#faq details')).toHaveCount(1)
  await search.fill('')

  // 原生 details 开合不受标注脚本影响，且属性始终在场
  const first = page.locator('#faq details').first()
  await first.locator('summary').click()
  await expect(first).toHaveAttribute('open', '')
  expect(await first.getAttribute('data-annotai')).toBeTruthy()
  expect(await first.getAttribute('data-annotai-path')).toMatch(/sections\/Faq\.tsx:\d+:\d+$/)
  await first.locator('summary').click()
  await expect(first).not.toHaveAttribute('open')
})

test('repeated card instances share one JSX location and keep their own text in Markdown', async ({ page }) => {
  await page.goto('/')
  const first = page.getByRole('heading', { name: '框选标注', exact: true })
  const second = page.getByRole('heading', { name: '明文位置', exact: true })
  const firstId = await first.getAttribute('data-annotai')
  expect(firstId).toBeTruthy()
  expect(await second.getAttribute('data-annotai')).toBe(firstId)
  expect(await second.getAttribute('data-annotai-path')).toBe(await first.getAttribute('data-annotai-path'))

  await launcher(page).click()
  for (const [target, question] of [[first, '给框选标注配动图'], [second, '明文位置示例换成中文路径']] as const) {
    await target.click()
    await saveQuestion(page, question)
  }
  // 收起面板把当前草稿固化为第 2 组，再展开构造超长内容验证滚动下的复制入口
  await closePanel(page)
  await launcher(page).click()

  // 多条问题增高后，滚动到底部仍能直接点击顶部复制入口
  await page.getByRole('textbox', { name: '编辑第 2 组问题', exact: true }).evaluate((node) => {
    node.style.height = '900px'
  })
  const toolbar = await page.locator('.annotai-panel-surface').evaluate((surface) => {
    surface.scrollTop = surface.scrollHeight
    const button = surface.querySelector('[data-action="copy-markdown"]')!
    const outer = surface.getBoundingClientRect()
    const rect = button.getBoundingClientRect()
    return { scrollTop: surface.scrollTop, top: rect.top, bottom: rect.bottom, outerTop: outer.top, outerBottom: outer.bottom }
  })
  expect(toolbar.scrollTop).toBeGreaterThan(0)
  expect(toolbar.top).toBeGreaterThanOrEqual(toolbar.outerTop)
  expect(toolbar.bottom).toBeLessThanOrEqual(toolbar.outerBottom)
  await expect(page.getByRole('textbox', { name: 'Markdown 预览', exact: true })).toHaveCount(0)

  const markdown = await copyMarkdown(page)
  expect(markdown.match(/sections\/Features\.tsx:\d+:\d+/g)).toHaveLength(2)
  expect(markdown).toContain('给框选标注配动图')
  expect(markdown).toContain('明文位置示例换成中文路径')
  await closePanel(page)
})
