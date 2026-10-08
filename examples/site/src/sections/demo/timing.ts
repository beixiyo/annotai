/** 回放时间表单一来源：动画时长在此定义，挂载时注入为 CSS 变量供模板与 keyframes 引用 */

/** 动画时长（ms）。模板用 duration-(--demo-dur-*) 引用，@theme 的 animate token 用 var() 引用 */
export const STAGE_TIMING = {
  /** 光标移动过渡 */
  cursor: 750,
  /** 镜头推拉过渡 */
  camera: 1000,
  /** 面板开合过渡 */
  panel: 450,
  /** 选框 / 卡片浮现 */
  pop: 420,
  /** 标签 / 清单浮出 */
  rise: 380,
  /** 循环淡出 */
  fade: 600,
  /** 按钮按压 */
  press: 140,
} as const

export type StageTiming = typeof STAGE_TIMING

/** 人工节奏（非动画时长）：打字机速度、阅读停留、步间余量 */
export const PACING = {
  /** 打字机每字耗时 */
  perChar: 75,
  /** 源码预览停留阅读 */
  previewHold: 1500,
  /** 选中后停留，让位置标签被看清 */
  selectedHold: 900,
  /** 打完字后停留 */
  typedHold: 350,
  /** 复制入口出现后停留 */
  readyHold: 450,
  /** 复制提示停留 */
  copiedHold: 650,
  /** Markdown 粘贴进 AI 后的阅读停留 */
  pastedHold: 1500,
  /** AI 回复后停留 */
  replyHold: 900,
  /** 按钮变红后的收尾停留 */
  appliedHold: 1700,
  /** 循环重启间隔 */
  loopGap: 600,
  /** 每步视觉余量，叠加在动画时长上 */
  stepSlack: 120,
} as const

/** 把时间表注入舞台元素，作为 --demo-dur-* CSS 变量 */
export function injectTiming(stage: HTMLElement): void {
  for (const [name, ms] of Object.entries(STAGE_TIMING)) {
    stage.style.setProperty(`--demo-dur-${name}`, `${ms}ms`)
  }
}
