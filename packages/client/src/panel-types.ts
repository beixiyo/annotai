/** 面板与客户端编排层之间的状态和回调契约 */
import type { ContextOptions } from '@annotai/protocol'
import type { ClientState } from './types.js'

/** 面板可触发的行为；数据读取和副作用由浏览器客户端负责 */
export type PanelAction =
  | 'toggle-panel'
  | 'close-panel'
  | 'toggle-selection'
  | 'discard-draft'
  | 'delete-annotation'
  | 'copy-markdown'
  | 'select-parent'
  | 'select-child'

/** 面板模板向外报告的交互 */
export interface PanelCallbacks {
  onAction(action: PanelAction, index?: number): void
  onQuestionChange(question: string, index?: number): void
  onFieldChange(field: keyof ContextOptions, checked: boolean): void
}

/** Lit 面板渲染需要的状态快照 */
export type PanelState = Pick<
  ClientState,
  | 'open'
  | 'selecting'
  | 'loading'
  | 'selectedElements'
  | 'selectedTargets'
  | 'annotations'
  | 'fields'
  | 'question'
  | 'status'
>
