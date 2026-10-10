/** 面板动作与业务流程：选择解析、热键跳转、草稿固化与复制 Markdown */
import type { CapturedTarget, SourceContext, SourceRef } from '@annotai/protocol'
import { createDomPath, errorMessage, isAbort, selectChild, selectParent, sourceRefOf, SourceServiceError, textOf } from '../dom.js'
import { annotationsToMarkdown } from '../markdown.js'
import type { PanelAction } from '../panel-types.js'
import { TARGET_PREVIEW_CLASS } from '../panel.js'
import { writeClipboard } from './clipboard.js'
import type { SessionContext } from './context.js'
import { createRequestLifecycle, request } from './requests.js'

export interface SessionActions {
  /** 面板动作分发：开关、选择、丢弃、删除、复制与父子切换 */
  handleAction(action: PanelAction, index?: number): void
  /**
   * 解析选中的元素为带源码上下文的目标；在途请求互斥，晚到的旧结果丢弃
   * 页面选择（点击/框选）会先把已写问题的草稿固化为一条标注；
   * refine 表示父子级微调当前草稿，仅重解析不清问题
   */
  chooseElements(elements: Element[], options?: { refine?: boolean }): Promise<void>
  /** 热键点击跳转：请求编辑器打开元素源码 */
  openSource(target: Element): Promise<void>
  /** 中止跳转与复制的在途请求；卸载时调用，幂等 */
  cancelPending(): void
}

export function createActions(ctx: SessionContext): SessionActions {
  const { state, normalized, shadow, panel, motion, requests, preview, render, t, updateHighlights, dimPanel, isDisposed } = ctx

  // 跳转与复制各自独立代际：只互斥同类请求，热键跳转不会中止在途的选择解析，复制核实也不会
  // ctx.requests 归选择解析专用，卸载时由装配层取消；另两条通道的回写同样受 isDisposed 约束
  const openRequests = createRequestLifecycle(isDisposed)
  const copyRequests = createRequestLifecycle(isDisposed)

  // 最近一次选择解析的在途 Promise；复制与收起前先等它结束，确保草稿带着已解析的目标被固化
  let pendingSelection: Promise<void> = Promise.resolve()

  /** 草稿有效（目标已解析且写了问题）时固化为一条标注并清空草稿；返回是否固化 */
  function commitDraft(): boolean {
    if (state.selectedTargets.length === 0 || state.question.trim() === '') return false
    state.annotations.push({ id: createId(), question: state.question, targets: state.selectedTargets })
    state.selectedElements = []
    state.selectedTargets = []
    state.question = ''
    return true
  }

  async function chooseElements(elements: Element[], options: { refine?: boolean } = {}) {
    // 与当前选择完全相同视为重复点击，不重置草稿
    if (!options.refine && sameElements(state.selectedElements, elements)) return
    // 选新的页面区域时自动保留已写问题的草稿；父子级微调不算新选择
    if (!options.refine) commitDraft()
    state.selectedElements = elements
    state.selectedTargets = []
    if (!options.refine) state.question = ''
    state.loading = true
    state.status = t('statusReading')
    render()
    const { generation, signal } = requests.begin()
    // ids 与 usePaths 各自去重后分段发送：服务端响应按「先 ids 段后 usePaths 段」同序返回
    const refs = elements.map(sourceRefOf).filter((ref): ref is SourceRef => Boolean(ref))
    const ids = [...new Set(refs.flatMap((ref) => 'id' in ref ? [ref.id] : []))]
    const usePaths = [...new Set(refs.flatMap((ref) => 'usePath' in ref ? [ref.usePath] : []))]
    const operation = (async () => {
      try {
        const response = await request<{ sources: SourceContext[] }>(normalized, { action: 'resolve', ids, usePaths }, signal)
        if (!requests.isCurrent(generation)) return
        // 响应自描述关联，不依赖服务端返回顺序：ID 按值匹配，使用处按服务端回显的原始引用匹配（source.file 已规范化，不能重建）
        const byId = new Map<string, SourceContext>()
        const byUsePath = new Map<string, SourceContext>()
        for (const context of response.sources) {
          byId.set(context.source.id, context)
          if (context.usePath) byUsePath.set(context.usePath, context)
        }
        state.selectedTargets = elements.flatMap((element) => {
          const ref = sourceRefOf(element)
          if (!ref) return []
          const context = 'id' in ref ? byId.get(ref.id) : byUsePath.get(ref.usePath)
          return context ? [captureTarget(element, context)] : []
        })
        state.loading = false
        state.status = state.selectedTargets.length > 0 ? '' : t('statusStale')
        render()
        const previewCard = panel.querySelector<HTMLElement>(`.${TARGET_PREVIEW_CLASS}`)
        if (previewCard) motion.labelChanged(previewCard)
      }
      catch (error) {
        if (!requests.isCurrent(generation) || isAbort(error)) return
        state.loading = false
        state.status = errorMessage(error, t)
        state.selectedTargets = []
        render()
      }
    })()
    pendingSelection = operation
    await operation
  }

  async function openSource(target: Element) {
    const ref = sourceRefOf(target)
    if (!ref) return
    if (state.hoveredElement) {
      preview.request(undefined)
      state.hoveredElement = undefined
      updateHighlights()
    }
    state.status = t('statusOpening')
    render()
    const { generation, signal } = openRequests.begin()
    try {
      await request<{ ok: true }>(normalized, { action: 'open', ...ref }, signal)
      if (!openRequests.isCurrent(generation)) return
      state.status = t('statusOpened')
      render()
    }
    catch (error) {
      if (!openRequests.isCurrent(generation) || isAbort(error)) return
      state.status = errorMessage(error, t)
      render()
    }
  }

  function handleAction(action: PanelAction, index?: number) {
    switch (action) {
      case 'toggle-panel':
        state.open = true
        if (!state.annotations.length && !state.selectedElements.length) state.selecting = true
        render()
        return
      case 'close-panel':
        void closePanel()
        return
      case 'toggle-selection':
        state.selecting = !state.selecting
        state.status = ''
        dimPanel(false)
        render()
        return
      case 'discard-draft':
        Object.assign(state, { selectedElements: [], selectedTargets: [], question: '', status: '' })
        render()
        return
      case 'delete-annotation':
        if (index !== undefined && Number.isInteger(index)) state.annotations.splice(index, 1)
        render()
        return
      case 'copy-markdown':
        void copyMarkdown()
        return
      case 'select-parent':
        void chooseElements(selectParent(state.selectedElements), { refine: true })
        return
      case 'select-child':
        void chooseElements(selectChild(state.selectedElements), { refine: true })
        return
    }
  }

  /**
   * 收起面板：先固化有效草稿再重置会话状态
   * 选择解析在途时先等它结束（通常毫秒级），避免「解析中关面板」把已输入的问题连同源码读取一起丢掉；
   * 空闲时同步收起，保持按钮点击的即时反馈
   */
  async function closePanel() {
    if (state.loading) await pendingSelection
    if (isDisposed()) return
    commitDraft()
    requests.cancel()
    openRequests.cancel()
    copyRequests.cancel()
    preview.request(undefined)
    dimPanel(false)
    Object.assign(state, {
      open: false,
      selecting: false,
      dragging: false,
      loading: false,
      dragStart: undefined,
      dragEnd: undefined,
      hoveredElement: undefined,
      selectedElements: [],
      selectedTargets: [],
      status: '',
    })
    render()
  }

  /** 复制前先等在途选择解析结束并固化当前草稿，再重新 resolve，把标注上下文刷新为当前源码；失败则保留旧上下文 */
  async function copyMarkdown() {
    await pendingSelection
    commitDraft()
    const ids = [...new Set(state.annotations.flatMap((annotation) => annotation.targets.map((target) => target.context.source.id)))]
    if (ids.length > 0) {
      const { generation, signal } = copyRequests.begin()
      state.status = t('statusVerifying')
      render()
      try {
        // 服务端对 resolve 全有或全无，200 即代表全部 ID 仍然有效
        const response = await request<{ sources: SourceContext[] }>(normalized, { action: 'resolve', ids }, signal)
        if (!copyRequests.isCurrent(generation)) return
        const byId = new Map(response.sources.map((context) => [context.source.id, context]))
        state.annotations = state.annotations.map((annotation) => ({
          ...annotation,
          targets: annotation.targets.map((target) => ({ ...target, context: byId.get(target.context.source.id) ?? target.context })),
        }))
        state.status = ''
      }
      catch (error) {
        if (!copyRequests.isCurrent(generation) || isAbort(error)) return
        state.status = staleAnnotationMessage(error) ?? errorMessage(error, t)
        render()
        return
      }
    }
    const value = normalized.formatCopy
      ? normalized.formatCopy({ annotations: state.annotations, fields: state.fields })
      : annotationsToMarkdown(state.annotations, { ...state.fields, locale: normalized.locale })
    state.status = await writeClipboard(shadow, value) ? t('statusCopied') : t('statusCopyFailed')
    render()
  }

  /** 服务端 409 指出了过期的源码 ID 时，返回指向对应标注组（面板序号从 1 起）的提示 */
  function staleAnnotationMessage(error: unknown) {
    if (!(error instanceof SourceServiceError) || error.code !== 'stale-source' || !error.id) return undefined
    const index = state.annotations.findIndex((annotation) => annotation.targets.some((target) => target.context.source.id === error.id))
    return index === -1 ? undefined : t('statusStaleAnnotation', { n: index + 1 })
  }

  function cancelPending() {
    openRequests.cancel()
    copyRequests.cancel()
  }

  return { handleAction, chooseElements, openSource, cancelPending }
}

function captureTarget(target: Element, context: SourceContext): CapturedTarget {
  return {
    context,
    text: textOf(target),
    className: target.getAttribute('class') ?? '',
    domPath: createDomPath(target),
  }
}

/** 同长度且逐一相同的元素列表；用于忽略重复选择同一区域 */
function sameElements(a: Element[], b: Element[]) {
  return a.length === b.length && a.every((element, index) => element === b[index])
}

function createId() {
  return typeof crypto?.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`
}
