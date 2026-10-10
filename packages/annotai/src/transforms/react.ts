/** 在 JSX 原生元素注入定义处定位，在组件标签注入使用处路径并登记使用处记录；定义处的 data-annotai / data-annotai-path 语义不变 */
import type { SourceRecord, SourceTransform, TransformInput, TransformResult } from '@annotai/protocol'
import { parse } from '@babel/parser'
import { VISITOR_KEYS } from '@babel/types'
import type { JSXIdentifier, JSXOpeningElement, Node } from '@babel/types'
import MagicString from 'magic-string'
import { annotateComponentUsePaths, isFragmentName } from './react-components.js'
import {
  createSourceId,
  createTransformResult,
  createVersion,
  isReservedAttribute,
  reservedAttributeError,
  sourceAttributes,
  usePathAttribute,
} from './shared.js'

/** React JSX/TSX 适配器；原生元素标记定义处，组件标签注入使用处路径并改写组件传播 */
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

  // 先改写组件传播：返回组件根的标签集合，供静态注入阶段避开重复属性
  const usePathRoots = annotateComponentUsePaths(ast, output, code)

  visit(ast, (node) => {
    if (node.type !== 'JSXElement') return
    const element = node.openingElement
    const name = element.name

    // Fragment 不能携带属性，跳过：注入会触发 React 开发告警且路径落不到 DOM
    const component = !isFragmentName(name)
      && (name.type === 'JSXMemberExpression' || (name.type === 'JSXIdentifier' && /^[A-Z]/.test(name.name)))
    const native = name.type === 'JSXIdentifier' && /^[a-z]/.test(name.name)

    if (!native && !component) return
    if (!element.loc || element.start == null || element.end == null || !node.loc || node.end == null) return

    for (const attribute of element.attributes) {
      if (attribute.type === 'JSXAttribute' && attribute.name.type === 'JSXIdentifier' && isReservedAttribute(attribute.name.name)) {
        throw reservedAttributeError(file, attribute.name.name)
      }
    }

    if (component) {
      // 组件标签不是 DOM 节点：注入使用处明文路径；作为组件根时已带动态传播属性，跳过静态注入
      if (usePathRoots.has(element.start)) return
      const start = { line: element.loc.start.line, column: element.loc.start.column + 1, offset: element.start }
      // 使用处同样登记为索引记录：未转换模块（预构建组件库）渲染的 DOM 只携带明文路径，
      // 服务端可按此处位置反查记录，使这些元素也能被选中、跳转与标注
      sources.push({
        id: createSourceId(version, element.start),
        file,
        tag: componentTag(name),
        start,
        end: { line: node.loc.end.line, column: node.loc.end.column + 1, offset: node.end },
      })
      output.appendLeft(element.end - (element.selfClosing ? 2 : 1), usePathAttribute(file, start))
      return
    }

    if (element.name.type !== 'JSXIdentifier') return
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

/** 组件标签名：标识符取原名，成员表达式取点分全名（Card.Panel），与 JSX 书写一致 */
function componentTag(name: JSXOpeningElement['name']) {
  const parts: string[] = []
  let current: Node = name
  while (current.type === 'JSXMemberExpression') {
    parts.unshift(current.property.name)
    current = current.object
  }
  return parts.length ? `${(current as JSXIdentifier).name}.${parts.join('.')}` : (current as JSXIdentifier).name
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
