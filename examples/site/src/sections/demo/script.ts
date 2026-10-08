/**
 * 回放剧本：步骤、章节、时间线、光标锚点与镜头焦点的单一来源
 * 组件只按当前步骤派生画面；新增或调整环节只改本文件
 */
import type { AnchorX, AnchorY } from './measure'
import { PACING, STAGE_TIMING } from './timing'

/**
 * 回放步骤（单向递增，由时间线推进）
 * approach 类步骤只移动光标与镜头，到位后下一步才点击
 */
export const STEPS = {
  idle: 0,
  launcherApproach: 1,
  panelOpen: 2,
  hoverTarget: 3,
  hoverPreview: 4,
  selected: 5,
  typingApproach: 6,
  typing: 7,
  ready: 8,
  copyApproach: 9,
  copied: 10,
  pasted: 11,
  agentReply: 12,
  applied: 13,
  fadeOut: 14,
} as const

export type Step = (typeof STEPS)[keyof typeof STEPS]

/** 章节：演示下方的三段叙事，章节内步骤连续 */
export type ChapterId = 'select' | 'annotate' | 'handoff'

/** 章节顺序与起始步骤；点击章节从起始步骤开始播放 */
export const CHAPTERS: readonly { id: ChapterId; from: Step }[] = [
  { id: 'select', from: STEPS.idle },
  { id: 'annotate', from: STEPS.typingApproach },
  { id: 'handoff', from: STEPS.copyApproach },
]

/** 步骤所属章节 */
export function chapterOf(step: Step): ChapterId {
  let current: ChapterId = CHAPTERS[0].id
  for (const chapter of CHAPTERS) {
    if (step >= chapter.from) current = chapter.id
  }
  return current
}

/** 时间线条目：进入该步骤后停留的毫秒数 */
export interface TimelineEntry {
  step: Step
  hold: number
}

/**
 * 按问题文案长度生成一轮时间线
 * 打字步骤时长 = 字数 × 每字耗时，其余由动画时长加阅读停留构成
 */
export function buildTimeline(questionLength: number): TimelineEntry[] {
  const { cursor, panel, camera, pop, rise, fade, press } = STAGE_TIMING
  const { stepSlack, perChar } = PACING
  return [
    { step: STEPS.idle, hold: PACING.loopGap },
    { step: STEPS.launcherApproach, hold: cursor + stepSlack },
    { step: STEPS.panelOpen, hold: panel + stepSlack },
    { step: STEPS.hoverTarget, hold: Math.max(cursor, camera) + stepSlack },
    { step: STEPS.hoverPreview, hold: PACING.previewHold },
    { step: STEPS.selected, hold: pop + PACING.selectedHold },
    { step: STEPS.typingApproach, hold: Math.max(cursor, camera) + stepSlack },
    { step: STEPS.typing, hold: questionLength * perChar + PACING.typedHold },
    { step: STEPS.ready, hold: rise + PACING.readyHold },
    { step: STEPS.copyApproach, hold: cursor + stepSlack },
    { step: STEPS.copied, hold: press + PACING.copiedHold },
    { step: STEPS.pasted, hold: camera + PACING.pastedHold },
    { step: STEPS.agentReply, hold: rise + PACING.replyHold },
    { step: STEPS.applied, hold: camera + PACING.appliedHold },
    { step: STEPS.fadeOut, hold: fade + stepSlack },
  ]
}

/** 各章节在一轮中的总时长，驱动章节进度条 */
export function chapterDurations(timeline: readonly TimelineEntry[]): Record<ChapterId, number> {
  const result: Record<ChapterId, number> = { select: 0, annotate: 0, handoff: 0 }
  for (const entry of timeline) result[chapterOf(entry.step)] += entry.hold
  return result
}

/** 可被光标或镜头指向的演示元素 */
export type AnchorElement = 'launcher' | 'target' | 'preview' | 'input' | 'copy' | 'panel' | 'app' | 'agent'

/** 光标锚点：指向元素上的某个点，dx/dy 为额外像素偏移 */
export interface CursorAnchor {
  el: AnchorElement
  x: AnchorX
  y: AnchorY
  dx?: number
  dy?: number
}

/**
 * 光标锚点表：每一步指向哪个元素、落在元素的哪个点
 * 无条目的步骤沿用上一步坐标
 */
export const CURSOR_ANCHORS: Partial<Record<Step, CursorAnchor>> = {
  [STEPS.idle]: { el: 'app', x: 'right', y: 'center', dx: -150, dy: 60 },
  [STEPS.launcherApproach]: { el: 'launcher', x: 'center', y: 'center' },
  [STEPS.hoverTarget]: { el: 'target', x: 'center', y: 'center', dx: 6, dy: 2 },
  [STEPS.typingApproach]: { el: 'input', x: 'left', y: 'center', dx: 18 },
  [STEPS.copyApproach]: { el: 'copy', x: 'center', y: 'center' },
  [STEPS.pasted]: { el: 'agent', x: 'right', y: 'bottom', dx: 30, dy: 10 },
  [STEPS.fadeOut]: { el: 'app', x: 'right', y: 'center', dx: -150, dy: 60 },
}

/** 触发点击涟漪的步骤 */
export const CLICK_STEPS: readonly Step[] = [STEPS.panelOpen, STEPS.selected, STEPS.typing, STEPS.copied]

/** 镜头焦点：对准若干元素的外接矩形中心并放大；无条目的步骤沿用上一步 */
export interface CameraFocus {
  el: readonly AnchorElement[]
  zoom: number
}

/** 镜头剧本：选择时推近目标，写问题时移向面板，交给 AI 时拉远看全局，生效时再推近 */
export const CAMERA_FOCUS: Partial<Record<Step, CameraFocus>> = {
  [STEPS.idle]: { el: ['app'], zoom: 1 },
  [STEPS.hoverTarget]: { el: ['target'], zoom: 1.4 },
  [STEPS.hoverPreview]: { el: ['target', 'preview'], zoom: 1.3 },
  [STEPS.selected]: { el: ['target', 'panel'], zoom: 1.2 },
  [STEPS.typingApproach]: { el: ['panel'], zoom: 1.45 },
  [STEPS.copyApproach]: { el: ['panel'], zoom: 1.3 },
  [STEPS.pasted]: { el: ['agent'], zoom: 1.3 },
  [STEPS.applied]: { el: ['target'], zoom: 1.4 },
  [STEPS.fadeOut]: { el: ['app'], zoom: 1 },
}

/** 沿剧本回溯，取不晚于 step 的最近一条记录 */
export function lookback<T>(table: Partial<Record<Step, T>>, step: Step): T | undefined {
  for (let s = step; s >= 0; s--) {
    const hit = table[s as Step]
    if (hit) return hit
  }
  return undefined
}
