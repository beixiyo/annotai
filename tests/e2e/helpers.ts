/** 面向示例页面公开交互的操作封装；只通过角色与文案定位，不依赖内部结构 */
import type { Page } from '@playwright/test'

export function launcher(page: Page) {
  return page.getByRole('button', { name: '源码标注', exact: true })
}

export function questionBox(page: Page) {
  return page.getByRole('textbox', { name: '当前选择的问题', exact: true })
}

/** 等待当前选择读取完成后填写问题；新模型下保存是自动的 */
export async function saveQuestion(page: Page, question: string) {
  await questionBox(page).fill(question)
}

/** 点击复制并读取真实系统剪贴板 */
export async function copyMarkdown(page: Page) {
  await page.getByRole('button', { name: '复制问题', exact: true }).click()
  await page.getByText('问题已复制', { exact: true }).waitFor()
  return page.evaluate(() => navigator.clipboard.readText())
}

/** 点击面板关闭按钮；Escape 只在选择模式或焦点位于面板内时才会收起面板，不适合作为通用关闭方式 */
export async function closePanel(page: Page) {
  await page.getByRole('button', { name: '关闭', exact: true }).click()
}
