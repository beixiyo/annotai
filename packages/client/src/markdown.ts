/** 将标注转为 Markdown；纯函数，不依赖 DOM 或客户端状态 */
import type { Annotation, CapturedTarget, ContextOptions, Locale } from '@annotai/protocol'
import { defaultContext, defaultLocale } from './defaults.js'
import { createTranslator, type Translator } from './i18n.js'

/** Markdown 导出时可独立于客户端状态覆盖的字段与语言 */
export type MarkdownOptions = Partial<ContextOptions> & { locale?: Locale }

/**
 * 将源码标注转为可直接粘贴给 AI 的 Markdown
 * 源码围栏长度会根据片段中最长的反引号序列自动增加
 */
export function annotationsToMarkdown(annotations: Annotation[], options: MarkdownOptions = {}) {
  const fields = { ...defaultContext, ...options }
  const t = createTranslator(options.locale ?? defaultLocale)
  const blocks = [t('mdTitle')]

  annotations.forEach((annotation, annotationIndex) => {
    blocks.push('', t('mdAnnotationN', { n: annotationIndex + 1 }), `${t('mdQuestion')}${annotation.question.trim() || t('mdUnfilled')}`)

    const targets = uniqueTargets(annotation.targets)
    if (targets.length === 0) {
      blocks.push('', t('mdNoTarget'))
      return
    }

    targets.forEach((target, targetIndex) => {
      blocks.push('', t('mdTargetN', { n: targetIndex + 1 }))
      appendTarget(blocks, target, fields, t)
    })
  })

  return `${blocks.join('\n')}\n`
}

function appendTarget(lines: string[], target: CapturedTarget, fields: ContextOptions, t: Translator) {
  const { context } = target
  if (fields.sourceLocation) {
    const { file, start } = context.source
    const path = context.path || file
    lines.push(`${t('mdLocation')}\`${path}:${start.line}:${start.column}\``)
  }

  if (fields.className && target.className) lines.push(`${t('mdClass')}\`${target.className}\``)
  if (fields.text && target.text) lines.push(`${t('mdText')}${target.text}`)
  if (fields.domPath && target.domPath) lines.push(`${t('mdDomPath')}\`${target.domPath}\``)
  if (fields.sourceSnippet && context.snippet) {
    lines.push(t('mdSnippet'))
    const fence = createFence(context.snippet)
    lines.push(fence, context.snippet, fence)
  }
}

function uniqueTargets(targets: CapturedTarget[]) {
  const seen = new Set<string>()
  return targets.filter((target) => {
    const key = [
      target.context.source.id,
      target.context.source.start.offset,
      target.context.source.end.offset,
      target.context.path,
      target.context.snippet,
      target.text,
      target.className,
      target.domPath,
    ].join('\u0000')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function createFence(snippet: string) {
  const runs = snippet.match(/`+/g) ?? []
  const longest = runs.reduce((max, run) => Math.max(max, run.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}
