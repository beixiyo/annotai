/** 界面与 Markdown 导出文案的双语字典与翻译器；文案 key 为唯一契约 */
import type { Locale } from '@annotai/protocol'

/** zh 为基准字典：key 集合即文案契约，en 必须逐 key 对齐 */
const zh = {
  panelTitle: '源码标注',
  launcherTitle: '源码标注（可拖动）',
  close: '关闭',
  startSelection: '选择元素',
  endSelection: '结束选择',
  copyQuestions: '复制问题',
  emptyTitleSelecting: '点击或框选页面区域',
  emptyTitleIdle: '从一个想修改的地方开始',
  emptyHint: '写好问题再选下一处，已写好的会自动保留；最后一起复制给 AI。',
  selectHint: '点击元素选择；拖动可选择一组。Alt+Shift+点击直接打开源码。',
  selectionCount: '当前选择（{count} 个元素）',
  parent: '父级',
  child: '子级',
  questionLabel: '当前选择的问题',
  questionPlaceholder: '描述你想让 AI 修改的内容',
  contextLabel: '附带的上下文',
  discard: '丢弃',
  fieldSourceLocation: '位置',
  fieldSourceSnippet: '源码片段',
  fieldClassName: '类名',
  fieldText: '文本',
  fieldDomPath: 'DOM 路径',
  lineColumn: '第 {line} 行 · 第 {column} 列',
  targetN: '目标 {n}',
  savedCount: '已保存（{count} 组）',
  targetsCount: '{count} 个目标',
  editQuestionN: '编辑第 {n} 组问题',
  delete: '删除',

  statusReading: '正在读取源码…',
  statusStale: '源码已更新，请重新选择元素',
  statusStaleAnnotation: '第 {n} 组的源码已更新，请删除后重新选择元素',
  statusNoMarked: '没有找到源码标记元素',
  statusOpening: '正在打开源码…',
  statusOpened: '已在编辑器中打开',
  statusVerifying: '正在核实源码…',
  statusCopied: '问题已复制',
  statusCopyFailed: '复制失败，请允许剪贴板访问后重试',
  serviceFailed: '源码服务请求失败（{status}）',

  mdTitle: '# 源码标注',
  mdAnnotationN: '## 标注 {n}',
  mdQuestion: '问题：',
  mdUnfilled: '（未填写）',
  mdNoTarget: '目标：未找到源码位置',
  mdTargetN: '### 目标 {n}',
  mdLocation: '位置：',
  mdClass: '类名：',
  mdText: '文本：',
  mdDomPath: 'DOM 路径：',
  mdSnippet: '源码片段：',
} as const

export type MessageKey = keyof typeof zh

const en: Record<MessageKey, string> = {
  panelTitle: 'Annotate',
  launcherTitle: 'Annotate (draggable)',
  close: 'Close',
  startSelection: 'Select element',
  endSelection: 'Stop selecting',
  copyQuestions: 'Copy questions',
  emptyTitleSelecting: 'Click or drag to select a region',
  emptyTitleIdle: 'Start from something you want changed',
  emptyHint: 'Type a question and pick the next spot — finished groups are kept. Copy everything to AI when done.',
  selectHint: 'Click to select an element; drag to select a group. Alt+Shift+click opens the source.',
  selectionCount: 'Selection ({count})',
  parent: 'Parent',
  child: 'Child',
  questionLabel: 'Question for this selection',
  questionPlaceholder: 'Describe what you want AI to change',
  contextLabel: 'Attached context',
  discard: 'Discard',
  fieldSourceLocation: 'Location',
  fieldSourceSnippet: 'Snippet',
  fieldClassName: 'Class',
  fieldText: 'Text',
  fieldDomPath: 'DOM path',
  lineColumn: 'Line {line} · Col {column}',
  targetN: 'Target {n}',
  savedCount: 'Saved ({count})',
  targetsCount: 'Targets: {count}',
  editQuestionN: 'Edit question {n}',
  delete: 'Delete',

  statusReading: 'Reading source…',
  statusStale: 'Source changed, reselect the element',
  statusStaleAnnotation: 'Source of group {n} changed; delete it and reselect the element',
  statusNoMarked: 'No source-marked element found',
  statusOpening: 'Opening source…',
  statusOpened: 'Opened in editor',
  statusVerifying: 'Verifying source…',
  statusCopied: 'Questions copied',
  statusCopyFailed: 'Copy failed; allow clipboard access and retry',
  serviceFailed: 'Source service request failed ({status})',

  mdTitle: '# Source Notes',
  mdAnnotationN: '## Annotation {n}',
  mdQuestion: 'Question: ',
  mdUnfilled: '(empty)',
  mdNoTarget: 'Target: no source location found',
  mdTargetN: '### Target {n}',
  mdLocation: 'Location: ',
  mdClass: 'Class: ',
  mdText: 'Text: ',
  mdDomPath: 'DOM path: ',
  mdSnippet: 'Snippet: ',
}

const dictionaries: Record<Locale, Record<MessageKey, string>> = { zh, en }

export type Translator = (key: MessageKey, params?: Record<string, string | number>) => string

/** {placeholder} 插值；未提供的占位符原样保留，便于排查漏传 */
export function createTranslator(locale: Locale): Translator {
  const dictionary = dictionaries[locale]
  return (key, params) => {
    const template = dictionary[key]
    if (!params) return template
    return template.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match))
  }
}
