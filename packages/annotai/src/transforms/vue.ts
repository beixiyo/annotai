/** Vue SFC template 适配器：复用 compiler-sfc 已解析的 template AST，在原生元素注入源码位置 */
import type { SourceRecord, SourceTransform, TransformInput, TransformResult } from '@annotai/protocol'
import { ElementTypes, NodeTypes } from '@vue/compiler-dom'
import type { ElementNode, Node, SourceLocation } from '@vue/compiler-dom'
import { parse } from '@vue/compiler-sfc'
import MagicString from 'magic-string'
import { createSourceId, createTransformResult, createVersion, isReservedAttribute, reservedAttributeError, sourceAttributes } from './shared.js'

/** Vue 适配器；只处理 HTML template，不处理 Pug 等模板语言 */
export const vueTransform: SourceTransform = {
  name: 'vue',
  supports: (file) => /\.vue$/i.test(file),
  transform: transformVue,
}

/** 在 SFC 的原始 template 内容上注入位置标记，供后续 Vue 编译器继续处理 */
function transformVue(input: TransformInput): TransformResult {
  const { code, file } = input
  const parsed = parse(code, { filename: file })
  if (parsed.errors.length > 0) throw toParseError(parsed.errors[0])
  const output = new MagicString(code)
  const sources: SourceRecord[] = []
  const template = parsed.descriptor.template

  if (!template) return createTransformResult(output, file, sources)
  if (template.lang && template.lang !== 'html') {
    throw new Error(`${file}: Vue template language "${template.lang}" is unsupported by annotai`)
  }
  // compiler-sfc 已解析 template，节点 loc 是相对整个 SFC 的绝对 offset 与一基行列
  if (!template.ast) return createTransformResult(output, file, sources)
  const version = createVersion(file, code)

  visit(template.ast, (node) => {
    // compiler-core 的 Node 不是判别联合，按 type 判断后显式收窄
    if (node.type !== NodeTypes.ELEMENT) return
    const element = node as ElementNode
    // template/slot/组件等节点不一定产生可选中的 DOM 元素
    if (element.tagType !== ElementTypes.ELEMENT) return
    const reserved = findReservedAttribute(element)
    if (reserved) throw reservedAttributeError(file, reserved)

    const openingEnd = findOpeningTagEnd(code, element.loc)
    if (openingEnd == null) return
    const id = createSourceId(version, element.loc.start.offset)
    const start = toPosition(element.loc.start)
    output.appendLeft(openingEnd, sourceAttributes(id, file, start))
    sources.push({ id, file, tag: element.tag, start, end: toPosition(element.loc.end) })
  })

  return createTransformResult(output, file, sources)
}

function toPosition(position: SourceLocation['start']) {
  return { line: position.line, column: position.column, offset: position.offset }
}

function toParseError(error: unknown): Error {
  if (error instanceof Error) return error
  return new Error(String(error))
}

/** 静态属性或静态 v-bind 参数命中保留名时返回该名称 */
function findReservedAttribute(node: ElementNode) {
  for (const prop of node.props) {
    if (prop.type === NodeTypes.ATTRIBUTE && isReservedAttribute(prop.name)) return prop.name
    if (prop.type !== NodeTypes.DIRECTIVE || prop.name !== 'bind') continue
    const argument = prop.arg
    if (argument?.type === NodeTypes.SIMPLE_EXPRESSION && argument.isStatic && isReservedAttribute(argument.content)) return argument.content
  }
  return undefined
}

/** 在一个元素源码中找到 opening tag 的结束位置，忽略属性值中的 `>` */
function findOpeningTagEnd(source: string, loc: SourceLocation): number | undefined {
  const start = loc.start.offset
  const end = loc.end.offset
  let quote: string | undefined
  for (let offset = start; offset < end; offset += 1) {
    const char = source[offset]
    if (quote) {
      if (char === quote) quote = undefined
      continue
    }
    if (char === '"' || char === '\'') {
      quote = char
      continue
    }
    if (char !== '>') continue
    let previous = offset - 1
    while (previous >= start && /\s/.test(source[previous])) previous -= 1
    return source[previous] === '/' ? previous : offset
  }
  return undefined
}

/** 仅遍历模板 AST 子节点，不进入 loc 元数据 */
function visit(node: Node, callback: (node: Node) => void): void {
  callback(node)
  if (!('children' in node) || !Array.isArray(node.children)) return
  for (const child of node.children) visit(child, callback)
}
