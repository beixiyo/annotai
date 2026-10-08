/** 完整标注流程：多组问题自动保留、编辑、字段开关、真实剪贴板、关闭后业务交互恢复、Alt+Shift 跳转到真实 Neovim */
import { expect, test } from '@playwright/test'
import { closePanel, copyMarkdown, launcher, questionBox } from './helpers.js'
import { queryNvim } from './nvim.js'

test('records two questions, edits them, copies Markdown and restores page interaction', async ({ page }) => {
  await page.goto('/')
  const featureTitle = page.getByRole('heading', { name: '框选标注', exact: true })
  await launcher(page).click()
  await featureTitle.click()
  await questionBox(page).fill('补一条框选交互的示意动图')
  // 直接选下一处，已写问题的第一组自动保留
  await page.getByRole('heading', { level: 1 }).click()
  await questionBox(page).fill('主标语换行节奏再紧一点')
  await page.getByText('附带的上下文', { exact: true }).click()
  await page.getByRole('checkbox', { name: '源码片段', exact: true }).uncheck()
  await page.getByRole('textbox', { name: '编辑第 1 组问题', exact: true }).fill('补一条框选交互的完整动图')

  const markdown = await copyMarkdown(page)
  expect(markdown).toContain('完整动图')
  expect(markdown).toContain('主标语换行节奏再紧一点')
  expect(markdown).toContain('sections/Features.tsx:')
  expect(markdown).toContain('sections/Hero.tsx:')
  expect(markdown).not.toContain('源码片段：')

  await closePanel(page)
  const search = page.getByRole('searchbox', { name: '搜索常见问题', exact: true })
  await search.fill('HMR')
  await expect(page.locator('#faq details')).toHaveCount(1)
  await search.fill('')
  await expect(page.locator('#faq details')).toHaveCount(3)

  await launcher(page).click()
  await page.getByRole('button', { name: '删除', exact: true }).last().click()
  await expect(page.getByRole('textbox', { name: '编辑第 2 组问题', exact: true })).toHaveCount(0)
})

test('launcher can be dragged and remembers the position across reloads', async ({ page }) => {
  await page.goto('/')
  const launcher = page.getByRole('button', { name: '源码标注', exact: true })
  const before = await launcher.boundingBox()
  expect(before).toBeTruthy()

  await page.mouse.move(before!.x + before!.width / 2, before!.y + before!.height / 2)
  await page.mouse.down()
  await page.mouse.move(before!.x - 180, before!.y - 120, { steps: 10 })
  await page.mouse.up()
  const dragged = await launcher.boundingBox()
  expect(dragged!.x).toBeLessThan(before!.x - 150)
  expect(dragged!.y).toBeLessThan(before!.y - 90)

  // 拖动后的那次 click 被吞掉，面板不应打开
  await expect(page.getByRole('heading', { name: '当前选择', exact: true })).toHaveCount(0)

  await page.reload()
  const restored = await page.getByRole('button', { name: '源码标注', exact: true }).boundingBox()
  expect(restored!.x).toBeCloseTo(dragged!.x, 1)
  expect(restored!.y).toBeCloseTo(dragged!.y, 1)
})

test('panel stays inside the viewport after opening from a dragged position', async ({ page }) => {
  await page.goto('/')
  const viewport = page.viewportSize()!
  const launcher = page.getByRole('button', { name: '源码标注', exact: true })
  const before = await launcher.boundingBox()

  // 拖到右下角，展开后的面板尺寸必然超出视口，验证钳制
  await page.mouse.move(before!.x + 10, before!.y + 10)
  await page.mouse.down()
  await page.mouse.move(viewport.width - 12, viewport.height - 12, { steps: 10 })
  await page.mouse.up()

  await launcher.click()
  const surface = page.locator('.annotai-panel-surface')
  await expect(surface).toBeVisible()
  await page.waitForTimeout(450)
  const box = await surface.boundingBox()
  expect(box).toBeTruthy()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
  expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
})

test('Alt+Shift click opens the DOM-declared location in the real Neovim instance', async ({ page }) => {
  await page.goto('/')
  // FeatureCard 的标题行是纯 ASCII，UTF-8 字节列与 UTF-16 列一致，可与 Neovim 光标逐项比对
  const target = page.getByRole('heading', { name: '明文位置', exact: true })
  const declared = await target.getAttribute('data-annotai-path')
  expect(declared).toMatch(/sections\/Features\.tsx:\d+:\d+$/)
  const [, file, line, column] = declared!.match(/^(.+):(\d+):(\d+)$/)!

  const response = page.waitForResponse((item) => item.url().endsWith('/__annotai') && item.request().postDataJSON()?.action === 'open')
  await target.click({ modifiers: ['Alt', 'Shift'] })
  expect((await response).status()).toBe(200)

  const cursor = await queryNvim<[string, number, number]>('[expand("%:p"), line("."), col(".")]')
  expect(cursor[0]).toBe(file)
  expect(cursor[1]).toBe(Number(line))
  expect(cursor[2]).toBe(Number(column))
})
