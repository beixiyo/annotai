/** 在 JSX 原生元素注入实现位置，保持组件调用、props 和 React 生命周期不变 */
import { parse } from '@babel/parser'
import { VISITOR_KEYS } from '@babel/types'
import type { Node } from '@babel/types'
import type { SourceRecord, SourceTransform, TransformInput, TransformResult } from '@annotai/protocol'
import MagicString from 'magic-string'
import { createSourceId, createTransformResult, createVersion, isReservedAttribute, reservedAttributeError, sourceAttributes } from './shared.js'

/** React JSX/TSX 适配器；仅标记原生标签，不注入组件调用属性 */
export const reactTransform: SourceTransform = {
  name: 'react',
  supports: (file) => /\.[cm]?[jt]sx?$/.test(file),
  transform: transformReact,
}

/** 从原始 JSX 建立位置记录，返回可继续交给 React 编译器的源码 */
function transformReact(input: TransformInput): TransformResult {
  const { code, file } = input
  const ast = parse(code, {
    sourceType: 'unambiguous',
    plugins: /\.[cm]?tsx?$/.test(file) ? ['jsx', 'typescript'] : ['jsx'],
  })
  const output = new MagicString(code)
  const sources: SourceRecord[] = []
  const version = createVersion(file, code)

  visit(ast, (node) => {
    if (node.type !== 'JSXElement') return
    const element = node.openingElement
    if (element.name.type !== 'JSXIdentifier' || !/^[a-z]/.test(element.name.name)) return
    if (!element.loc || element.start == null || element.end == null || !node.loc || node.end == null) return
    for (const attribute of element.attributes) {
      if (attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' && isReservedAttribute(attribute.name.name)) {
        throw reservedAttributeError(file, attribute.name.name)
      }
    }
    const id = createSourceId(version, element.start)
    const start = { line: element.loc.start.line, column: element.loc.start.column + 1, offset: element.start }
    // 放在 spread 后，防止业务属性包覆盖工具的保留定位字段
    output.appendLeft(element.end - (element.selfClosing ? 2 : 1), sourceAttributes(id, file, start))
    sources.push({
      id,
      file,
      tag: element.name.name,
      start,
      end: { line: node.loc.end.line, column: node.loc.end.column + 1, offset: node.end },
    })
  })
  return createTransformResult(output, file, sources)
}

/** 只沿 Babel 定义的子节点遍历，不扫描 loc 等元数据 */
function visit(node: Node, callback: (node: Node) => void): void {
  callback(node)
  const fields = node as unknown as Record<string, unknown>
  for (const key of VISITOR_KEYS[node.type] ?? []) {
    const children = Array.isArray(fields[key]) ? fields[key] : [fields[key]]
    for (const child of children as unknown[]) {
      if (child && typeof child === 'object' && 'type' in child) visit(child as Node, callback)
    }
  }
}
