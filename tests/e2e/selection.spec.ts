/** 框选、父子层级、Portal 定位与输入控件的快捷键隔离 */
import { expect, test } from '@playwright/test'
import { closePanel, copyMarkdown, launcher, saveQuestion } from './helpers.js'

test('drag selection keeps only the card, supports parent/child and locates Portal content', async ({ page }) => {
  await page.clock.install()
  await page.goto('/')
  await launcher(page).click()
  const card = page.getByRole('heading', { name: '框选标注', exact: true }).locator('..')
  await card.scrollIntoViewIfNeeded()
  const box = await card.boundingBox()
  expect(box).toBeTruthy()
  await page.mouse.move(box!.x - 2, box!.y - 2)
  await page.mouse.down()
  await page.mouse.move(box!.x + box!.width + 2, box!.y + box!.height + 2, { steps: 15 })
  await page.mouse.up()
  await page.getByRole('heading', { name: '当前选择（1 个元素）', exact: true }).waitFor()
  await page.getByRole('button', { name: '父级', exact: true }).click()
  await page.getByRole('button', { name: '子级', exact: true }).click()
  await saveQuestion(page, '特性卡片换成两列网格')

  const markdown = await copyMarkdown(page)
  expect(markdown).toContain('sections/Features.tsx:')
  expect(markdown).not.toContain('### 目标 2')
  await closePanel(page)

  // 业务态先弹出 Portal toast，冻结时间使其常驻，再进入选择模式标注 body 直挂内容
  await page.locator('#top').getByRole('button', { name: '复制安装命令', exact: true }).click()
  const toast = page.getByRole('status').filter({ hasText: '安装命令已复制' })
  await toast.waitFor()
  await page.clock.pauseAt((await page.evaluate(() => Date.now())) + 250)
  await launcher(page).click()
  await page.getByRole('button', { name: '选择元素', exact: true }).click()
  await toast.click()
  await saveQuestion(page, '复制成功的提示挪到右上角')
  const portalMarkdown = await copyMarkdown(page)
  expect(portalMarkdown).toContain('sections/Hero.tsx:')
  await page.clock.resume()
  await closePanel(page)
})

test('editable controls never trigger source requests with the hot keys', async ({ page }) => {
  await page.goto('/')
  let requests = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/__annotai')) requests += 1
  })
  const search = page.getByRole('searchbox', { name: '搜索常见问题', exact: true })
  await search.click({ modifiers: ['Alt', 'Shift'] })
  await search.fill('HMR')
  await expect(page.locator('#faq details')).toHaveCount(1)
  expect(requests).toBe(0)
})
