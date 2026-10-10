/** React/Solid 组件使用处路径改写：React 没有 Vue 的 attrs fallthrough，组件标签上的属性只是普通 props；
 * 这里把组件函数改写为「根节点读取传入的使用处属性」，调用点传入的路径才能落到 DOM
 * 机制对照 code-inspector 的 transform-jsx，但属性名独立（data-annotai-use-path），
 * 不触碰原生元素的 data-annotai / data-annotai-path，定义处标注始终保留
 * 已知缺口：多根组件不传播（与 Vue fallthrough 语义一致）、portal 与 createElement 根不处理、
 * 未经转换的第三方组件收不到路径 */
import type {
  ArrowFunctionExpression,
  ClassDeclaration,
  ClassExpression,
  FunctionDeclaration,
  FunctionExpression,
  Identifier,
  JSXOpeningElement,
  Node,
  ObjectPattern,
  VariableDeclarator,
} from '@babel/types'
import { VISITOR_KEYS } from '@babel/types'
import type MagicString from 'magic-string'
import { SOURCE_USE_PATH_ATTRIBUTE } from './constants.js'

/** 解构 props 时注入的绑定名前缀；实际名按组件作用域避让已有标识符 */
const PROP_BINDING = '__annotaiUsePath'
/** 无参组件补出的隐式 props 形参名前缀 */
const IMPLICIT_PROPS_BINDING = '__annotaiProps'

type FunctionLike = FunctionDeclaration | FunctionExpression | ArrowFunctionExpression
type ClassLike = ClassDeclaration | ClassExpression

/** 改写所有可识别的组件函数与类组件；返回「根 opening element 起始 offset → 使用处读取表达式」
 * 静态注入阶段据此跳过已是组件根的组件标签，避免同一标签上出现重复属性 */
export function annotateComponentUsePaths(ast: Node, output: MagicString, code: string): Map<number, string> {
  const roots = new Map<number, string>()
  walk(ast, [], (node, ancestors) => {
    if (isFunctionLike(node)) {
      if (!isComponentFunction(node, ancestors)) return
      const expression = propExpression(node, output, code)
      if (expression) rewriteRoots(node.body, expression, output, roots)
      return
    }
    if (!isClassLike(node) || !node.superClass) return
    if (!isComponentLike(node, node.id?.name ?? declaratorName(ancestors), ancestors)) return
    const expression = `this.props && this.props[${JSON.stringify(SOURCE_USE_PATH_ATTRIBUTE)}]`
    for (const method of node.body.body) {
      if (method.type !== 'ClassMethod' || method.static) continue
      const key = method.key
      const isRender = key.type === 'Identifier' ? key.name === 'render' : key.type === 'StringLiteral' && key.value === 'render'
      if (isRender) rewriteRoots(method.body, expression, output, roots)
    }
  })
  return roots
}

/** Fragment 引用（裸 Fragment 或 React.Fragment）：Fragment 不能携带属性，按短写 Fragment 处理其子节点 */
export function isFragmentName(name: Node): boolean {
  if (name.type === 'JSXIdentifier') return name.name === 'Fragment'
  if (name.type !== 'JSXMemberExpression') return false
  return name.object.type === 'JSXIdentifier' && name.object.name === 'React' && name.property.type === 'JSXIdentifier' && name.property.name === 'Fragment'
}

/** 把使用处读取表达式注入根节点；每条 return 的根数量超过 1 时放弃（多根语义与 Vue 一致） */
function rewriteRoots(body: Node, expression: string, output: MagicString, roots: Map<number, string>) {
  for (const root of returnExpressions(body)) {
    if (estimateRootCount(root, body) > 1) continue

    for (const opening of collectRoots(root, body, new Set())) {
      if (opening.start == null || opening.end == null) continue
      // 多个 return 引用同一根时只注入一次，重复属性会让 jsxDEV 告警
      if (roots.has(opening.start)) continue
      const position = opening.end - (opening.selfClosing ? 2 : 1)
      output.appendLeft(position, ` ${SOURCE_USE_PATH_ATTRIBUTE}={${expression}}`)
      roots.set(opening.start, expression)
    }
  }
}

/** 带祖先链遍历，供组件归属判定使用 */
function walk(node: Node, ancestors: Node[], callback: (node: Node, ancestors: Node[]) => void) {
  callback(node, ancestors)
  const fields = node as unknown as Record<string, unknown>
  for (const key of VISITOR_KEYS[node.type] ?? []) {
    const children = Array.isArray(fields[key]) ? fields[key] : [fields[key]]
    for (const child of children as unknown[]) {
      if (child && typeof child === 'object' && 'type' in child) walk(child as Node, [...ancestors, node], callback)
    }
  }
}

/** 容器语句层遍历：不进入任何嵌套函数作用域，return 收集与绑定查找都在当前组件层完成 */
function walkStatements(node: Node, callback: (node: Node) => void) {
  callback(node)
  const fields = node as unknown as Record<string, unknown>
  for (const key of VISITOR_KEYS[node.type] ?? []) {
    const children = Array.isArray(fields[key]) ? fields[key] : [fields[key]]
    for (const child of children as unknown[]) {
      if (child && typeof child === 'object' && 'type' in child) {
        const typed = child as Node
        if (isScopeBoundary(typed)) continue
        walkStatements(typed, callback)
      }
    }
  }
}

/** 一切引入独立作用域的节点：函数、类、对象/类方法、静态块、命名空间 */
function isScopeBoundary(node: Node): boolean {
  return isFunctionLike(node)
    || isClassLike(node)
    || node.type === 'ObjectMethod'
    || node.type === 'ClassMethod'
    || node.type === 'ClassPrivateMethod'
    || node.type === 'StaticBlock'
    || node.type === 'TSModuleDeclaration'
}

function isFunctionLike(node: Node): node is FunctionLike {
  return node.type === 'FunctionDeclaration' || node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression'
}

function isClassLike(node: Node): node is ClassLike {
  return node.type === 'ClassDeclaration' || node.type === 'ClassExpression'
}

/** 组件判定：归属名（自身名或最近声明名）以大写开头；匿名则要求 export default 且确实返回可渲染内容 */
function isComponentFunction(fn: FunctionLike, ancestors: Node[]): boolean {
  const name = fn.type === 'FunctionDeclaration' || fn.type === 'FunctionExpression' ? fn.id?.name : undefined
  return isComponentLike(fn, name ?? declaratorName(ancestors), ancestors)
}

function isComponentLike(fn: FunctionLike | ClassLike, name: string | null | undefined, ancestors: Node[]): boolean {
  if (name) return /^[A-Z]/.test(name)
  if (!ancestors.some((node) => node.type === 'ExportDefaultDeclaration')) return false
  if (isFunctionLike(fn)) {
    return returnExpressions(fn.body).some((root) => collectRoots(root, fn.body, new Set()).length > 0)
  }
  // 匿名类组件：有 render 方法返回 JSX 才改写
  return fn.body.body.some(
    (method) =>
      method.type === 'ClassMethod'
      && !method.static
      && (method.key.type === 'Identifier' ? method.key.name === 'render' : method.key.type === 'StringLiteral' && method.key.value === 'render')
      && returnExpressions(method.body).some((root) => collectRoots(root, method.body, new Set()).length > 0),
  )
}

/** 组件归属名：函数自身名，或向上最近的变量声明 / 赋值目标名；遇到函数或类边界即止 */
function declaratorName(ancestors: Node[]): string | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const node = ancestors[index]
    if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') return node.id.name
    if (node.type === 'AssignmentExpression' && node.left.type === 'Identifier') return node.left.name
    if (isFunctionLike(node) || isClassLike(node) || node.type === 'ObjectMethod') return undefined
  }
  return undefined
}

/** 生成读取传入使用处属性的表达式，并按需改写参数列表；绑定名按组件子树避让已有标识符 */
function propExpression(fn: FunctionLike, output: MagicString, code: string): string | undefined {
  const used = new Set<string>()
  walk(fn, [], (node) => {
    if (node.type === 'Identifier') used.add(node.name)
  })

  const binding = uniqueName(PROP_BINDING, used)
  const first = fn.params[0]

  if (!first) {
    // 无参组件补一个隐式 props 形参，否则调用点传入的路径读不到
    const implicit = uniqueName(IMPLICIT_PROPS_BINDING, used)
    const position = emptyParamsInsertPosition(fn, code)
    if (position == null) return undefined
    output.appendLeft(position, implicit)
    return `${implicit} && ${implicit}[${JSON.stringify(SOURCE_USE_PATH_ATTRIBUTE)}]`
  }

  return paramExpression(first, output, binding)
}

function uniqueName(base: string, used: Set<string>): string {
  let name = base
  let suffix = 2
  while (used.has(name)) name = `${base}${suffix++}`
  used.add(name)
  return name
}

function paramExpression(param: Node, output: MagicString, binding: string): string | undefined {
  if (param.type === 'Identifier') return `${param.name} && ${param.name}[${JSON.stringify(SOURCE_USE_PATH_ATTRIBUTE)}]`
  if (param.type === 'AssignmentPattern') return paramExpression(param.left, output, binding)
  if (param.type !== 'ObjectPattern') return undefined
  const existing = existingObjectBinding(param)
  if (existing) return existing
  // 解构 props 时补出使用处绑定，其余键保持原样
  output.appendLeft((param.start ?? 0) + 1, `${JSON.stringify(SOURCE_USE_PATH_ATTRIBUTE)}: ${binding}, `)
  return binding
}

/** 业务代码已解构保留名时复用其绑定，避免注入重复键导致语法错误 */
function existingObjectBinding(param: ObjectPattern): string | undefined {
  for (const property of param.properties) {
    if (property.type !== 'ObjectProperty') continue
    const key = property.key
    const name = key.type === 'StringLiteral' ? key.value : key.type === 'Identifier' ? key.name : undefined
    if (name !== SOURCE_USE_PATH_ATTRIBUTE) continue
    if (property.value.type === 'Identifier') return property.value.name
    if (property.value.type === 'AssignmentPattern' && property.value.left.type === 'Identifier') return property.value.left.name
  }
  return undefined
}

/** 在零参函数参数列表的右括号处插入形参
 * 逐 token 定位（跳过注释、空白、泛型），不全文搜索括号：注释里的 `)` 与返回类型中的括号都会误导文本搜索；
 * 无法确定位置（如带返回类型的零参函数）时返回 undefined，放弃改写而不是插错位置 */
function emptyParamsInsertPosition(fn: FunctionLike, code: string): number | undefined {
  const end = fn.body.start
  if (fn.start == null || end == null) return undefined
  let cursor: number

  if (fn.type !== 'ArrowFunctionExpression' && fn.id && fn.id.end != null) {
    cursor = fn.id.end
  }
  else {
    cursor = fn.start
    if (fn.async) {
      if (!code.startsWith('async', cursor)) return undefined
      cursor = skipTrivia(code, cursor + 'async'.length, end)
    }
    if (fn.type !== 'ArrowFunctionExpression') {
      if (!code.startsWith('function', cursor)) return undefined
      cursor = skipTrivia(code, cursor + 'function'.length, end)
    }
  }

  cursor = skipTrivia(code, cursor, end)
  cursor = skipTypeParameters(code, cursor, end)
  cursor = skipTrivia(code, cursor, end)
  if (code[cursor] !== '(') return undefined
  cursor = skipTrivia(code, cursor + 1, end)
  if (code[cursor] !== ')') return undefined
  return cursor
}

function skipTrivia(code: string, index: number, end: number): number {
  while (index < end) {
    const char = code[index]
    if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      index += 1
      continue
    }
    if (char === '/' && code[index + 1] === '/') {
      const newline = code.indexOf('\n', index)
      if (newline === -1 || newline >= end) return end
      index = newline + 1
      continue
    }
    if (char === '/' && code[index + 1] === '*') {
      const close = code.indexOf('*/', index + 2)
      if (close === -1 || close + 2 > end) return end
      index = close + 2
      continue
    }
    return index
  }
  return index
}

/** 平衡跳过泛型参数 `<...>`；未闭合时停在边界，由后续 token 校验兜底 */
function skipTypeParameters(code: string, cursor: number, end: number): number {
  if (code[cursor] !== '<') return cursor
  let depth = 0
  for (let index = cursor; index < end; index += 1) {
    if (code[index] === '<') depth += 1
    else if (code[index] === '>') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return end
}

/** 组件 body 的顶层返回：箭头直接表达式体，块语句收集 return 参数 */
function returnExpressions(body: Node): Node[] {
  if (body.type !== 'BlockStatement') return [body]
  const roots: Node[] = []
  walkStatements(body, (node) => {
    if (node.type === 'ReturnStatement' && node.argument) roots.push(node.argument)
  })
  return roots
}

/** 展开包裹表达式：括号与 TS 断言不影响根节点判定 */
function unwrap(node: Node): Node {
  if (
    node.type === 'TSAsExpression' || node.type === 'TSSatisfiesExpression' || node.type === 'TSNonNullExpression'
    || node.type === 'TSTypeAssertion' || node.type === 'ParenthesizedExpression'
  ) return unwrap(node.expression)
  return node
}

/** 估算表达式渲染时的根节点数量：条件与逻辑表达式运行时只渲染一支，取两支的最大值 */
function estimateRootCount(node: Node, body: Node, path = new Set<number>()): number {
  const target = unwrap(node)
  if (target.type === 'JSXElement') {
    if (isFragmentName(target.openingElement.name)) return estimateListCount(fragmentChildren(target), body, path)
    return 1
  }
  if (target.type === 'JSXFragment') return estimateListCount(fragmentChildren(target), body, path)
  if (target.type === 'ConditionalExpression') {
    return Math.max(estimateRootCount(target.consequent, body, path), estimateRootCount(target.alternate, body, path))
  }
  if (target.type === 'LogicalExpression') {
    return Math.max(estimateRootCount(target.left, body, path), estimateRootCount(target.right, body, path))
  }
  if (target.type === 'SequenceExpression') return estimateRootCount(target.expressions[target.expressions.length - 1], body, path)
  if (target.type === 'ArrayExpression') return estimateListCount(target.elements as Node[], body, path)
  if (target.type === 'Identifier') return identifierRootCount(target, body, path)
  return 0
}

function estimateListCount(items: Node[], body: Node, path: Set<number>): number {
  let total = 0
  for (const item of items) {
    if (!item) continue
    const child = item.type === 'SpreadElement' ? item.argument : item
    total += estimateRootCount(child, body, path)
    if (total > 1) return 2
  }
  return total
}

/** 收集表达式可能渲染出的所有根 opening element；与估算使用同一套结构规则
 * path 只防环（同一路径上的绑定只展开一次），同一绑定在不同位置出现时各自计数 */
function collectRoots(node: Node, body: Node, path: Set<number>): JSXOpeningElement[] {
  const target = unwrap(node)
  if (target.type === 'JSXElement') {
    if (isFragmentName(target.openingElement.name)) return fragmentChildren(target).flatMap((child) => collectRoots(child, body, path))
    return [target.openingElement]
  }
  if (target.type === 'JSXFragment') {
    return fragmentChildren(target).flatMap((child) => collectRoots(child, body, path))
  }
  if (target.type === 'ConditionalExpression') {
    return [...collectRoots(target.consequent, body, path), ...collectRoots(target.alternate, body, path)]
  }
  if (target.type === 'LogicalExpression') {
    return [...collectRoots(target.left, body, path), ...collectRoots(target.right, body, path)]
  }
  if (target.type === 'SequenceExpression') {
    return collectRoots(target.expressions[target.expressions.length - 1], body, path)
  }
  if (target.type === 'ArrayExpression') {
    return (target.elements as Node[]).flatMap((element) => {
      if (!element) return []
      return collectRoots(element.type === 'SpreadElement' ? element.argument : element, body, path)
    })
  }
  if (target.type === 'Identifier') return identifierRoots(target, body, path)
  return []
}

/** Fragment 的元素子节点与表达式容器子节点；同样适用于长写 React.Fragment 元素 */
function fragmentChildren(fragment: Node): Node[] {
  const children = (fragment as unknown as { children: Node[] }).children ?? []
  return children.flatMap((child) => {
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') return [child]
    if (child.type === 'JSXExpressionContainer') return [child.expression]
    return []
  })
}

function identifierRootCount(id: Identifier, body: Node, path: Set<number>): number {
  const declarator = identifierDeclarator(id, body)
  if (!declarator || declarator.init == null || declarator.start == null) return 0
  if (path.has(declarator.start)) return 0
  path.add(declarator.start)
  const count = estimateRootCount(declarator.init, body, path)
  path.delete(declarator.start)
  return count
}

function identifierRoots(id: Identifier, body: Node, path: Set<number>): JSXOpeningElement[] {
  const declarator = identifierDeclarator(id, body)
  if (!declarator || declarator.init == null || declarator.start == null) return []
  if (path.has(declarator.start)) return []
  path.add(declarator.start)
  const roots = collectRoots(declarator.init, body, path)
  path.delete(declarator.start)
  return roots
}

/** 仅跟随 body 顶层语句里的 const 声明：嵌套块中的同名声明不参与（作用域不可静态证明），
 * let 可能被重赋值（跟随初始值会绑错），多处声明无法唯一确定 */
function identifierDeclarator(id: Identifier, body: Node): VariableDeclarator | undefined {
  if (body.type !== 'BlockStatement') return undefined
  const matches: VariableDeclarator[] = []
  for (const statement of body.body) {
    if (statement.type !== 'VariableDeclaration' || statement.kind !== 'const') continue
    for (const declarator of statement.declarations) {
      if (declarator.id.type === 'Identifier' && declarator.id.name === id.name) matches.push(declarator)
    }
  }
  return matches.length === 1 ? matches[0] : undefined
}
