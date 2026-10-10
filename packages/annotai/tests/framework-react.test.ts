/** 验证 React 组件使用处路径：调用点静态注入与组件根传播改写的各形态 */
import { parse } from '@babel/parser'
import { expect, test } from 'vitest'
import { reactTransform } from '../src/transforms/react.js'

const file = '/project/App.tsx'

function transform(code: string) {
  return reactTransform.transform({ code, file, environment: 'client' })
}

/** 单行代码里片段的 1 基列号，供断言静态注入位置 */
function columnOf(code: string, snippet: string) {
  return code.indexOf(snippet) + 1
}

test('组件标签注入使用处路径并登记使用处记录，原生元素不注入', () => {
  const code = 'export const App = () => <main><Card /><Card.Panel /><div /></main>'
  const result = transform(code)

  expect(result.sources.map((source) => source.tag)).toEqual(['main', 'Card', 'Card.Panel', 'div'])
  expect(result.code).toContain(`data-annotai-use-path="${file}:1:${columnOf(code, '<Card')}"`)
  expect(result.code).toContain(`data-annotai-use-path="${file}:1:${columnOf(code, '<Card.Panel')}"`)
  expect(result.code).not.toContain('<div data-annotai-use-path')

  // 使用处记录的 span 覆盖整个 JSX 元素，供服务端按明文位置反查与片段展示
  const use = result.sources.find((source) => source.tag === 'Card.Panel')
  expect(use).toMatchObject({ file, start: { line: 1, column: columnOf(code, '<Card.Panel') } })
  expect(code.slice(use!.start.offset, use!.end.offset)).toBe('<Card.Panel />')
})

test('无参组件补隐式 props 形参，根元素读取使用处路径', () => {
  const result = transform('export const Card = () => <div>卡</div>')

  expect(result.code).toContain('export const Card = (__annotaiProps) =>')
  expect(result.code).toContain('<div data-annotai-use-path={__annotaiProps && __annotaiProps["data-annotai-use-path"]}')
})

test('标识符 props 与解构 props 都能改写读取使用处路径', () => {
  const identifier = transform('function Card(props) { return <div>{props.title}</div> }')
  expect(identifier.code).toContain('data-annotai-use-path={props && props["data-annotai-use-path"]}')

  const destructured = transform('function Card({ title }) { return <div>{title}</div> }')
  expect(destructured.code).toContain('{"data-annotai-use-path": __annotaiUsePath,')
  expect(destructured.code).toContain('data-annotai-use-path={__annotaiUsePath}')
})

test('条件分支两支都注入，多根组件不传播', () => {
  const conditional = transform('export const Card = (props) => props.ok ? <a>好</a> : <b>坏</b>')
  expect(conditional.code.match(/data-annotai-use-path=\{props/g)).toHaveLength(2)

  for (const code of ['export const Card = (props) => [<a />, <b />]', 'export const Card = (props) => <><a /><b /></>']) {
    const multiRoot = transform(code)
    expect(multiRoot.code).not.toContain('data-annotai-use-path={')
  }
})

test('类组件 render 读取 this.props 的使用处路径', () => {
  const result = transform('class Card extends React.Component { render() { return <div>卡</div> } }')

  expect(result.code).toContain('data-annotai-use-path={this.props && this.props["data-annotai-use-path"]}')
})

test('组件根是另一个组件时只注入动态传播属性，避免重复且不登记使用处', () => {
  const code = 'function Inner(props) { return <div /> }\nexport const Card = (props) => <Inner />'
  const result = transform(code)

  expect(result.code).toContain('<Inner')
  expect(result.code.match(/data-annotai-use-path=\{/g)).toHaveLength(2)
  expect(result.code).not.toContain('<Inner data-annotai-use-path="')
  // Inner 作为 Card 的根，静态注入被跳过：其 DOM 上的明文来自外层使用处，自身不登记记录
  expect(result.sources.map((source) => source.tag)).toEqual(['div'])
})

test('return 的 JSX 变量绑定也能识别为根', () => {
  const result = transform('export const Card = (props) => { const root = <section>卡</section>; return root }')

  expect(result.code).toContain('<section data-annotai-use-path={props && props["data-annotai-use-path"]}')
})

test('保留属性在组件标签上同样拒绝', () => {
  expect(() => transform('export const App = () => <Card data-annotai-use-path="x" />')).toThrow(
    'data-annotai-use-path is reserved',
  )
})

test('边界写法下输出仍可解析', () => {
  const cases = [
    'function Card() /* ) */ { return <div>卡</div> }',
    'function Card(): JSX.Element { return <div>卡</div> }',
    'function Card<T>() { return <div>卡</div> }',
    'async function Card() { return <div>卡</div> }',
    'const Card = () => <div>卡</div>',
    'const Card = async () => <div>卡</div>',
    'const Card = function () { return <div>卡</div> }',
    'function Card({ __annotaiUsePath }) { return <div>{__annotaiUsePath}</div> }',
    'function Panel() { const __annotaiProps = {}; return <div>{__annotaiProps}</div> }',
    'function Card(props) { const root = <div />; if (props.ok) return root; return root }',
    'function Card(props) { const root = <div />; return [root, root] }',
    'function Card(props) { const helper = { make() { const root = <span />; return root } }; return <main>{helper}</main> }',
    'const root = <aside />\nfunction Card(props) {\n  { const root = <span />; void root }\n  return root\n}',
    'const Card = class extends React.Component { render() { return <div>卡</div> } }',
    'const Card = (props) => <React.Fragment><div>{props.x}</div></React.Fragment>',
    'const Card = (props) => <Fragment><div>{props.x}</div></Fragment>',
  ]
  for (const code of cases) {
    const result = transform(code)
    expect(() => parse(result.code, { sourceType: 'unambiguous', plugins: ['jsx', 'typescript'] }), code).not.toThrow()
  }
})

test('注释里的括号不阻断隐式形参，返回类型场景安全跳过', () => {
  const commented = transform('function Card() /* ) */ { return <div>卡</div> }')
  expect(commented.code).toContain('function Card(__annotaiProps) /* ) */')

  const typed = transform('function Card(): JSX.Element { return <div>卡</div> }')
  expect(typed.code).toContain('function Card(__annotaiProps): JSX.Element')
})

test('同名 return 根只注入一次，重复引用数组按多根跳过', () => {
  const twice = transform('function Card(props) { const root = <div />; if (props.ok) return root; return root }')
  expect(twice.code.match(/data-annotai-use-path=\{/g)).toHaveLength(1)

  const duplicated = transform('function Card(props) { const root = <div />; return [root, root] }')
  expect(duplicated.code).not.toContain('data-annotai-use-path={')
})

test('生成绑定名与业务标识符冲突时自动避让', () => {
  const result = transform('function Card({ __annotaiUsePath }) { return <div>{__annotaiUsePath}</div> }')
  expect(result.code).toContain('"data-annotai-use-path": __annotaiUsePath2')
})

test('React.Fragment 根传播到子元素，自身不携带属性', () => {
  const result = transform('const Card = (props) => <React.Fragment><div>卡</div></React.Fragment>')
  expect(result.code).not.toContain('<React.Fragment data-annotai-use-path')
  expect(result.code).toContain('<div data-annotai-use-path={props && props["data-annotai-use-path"]}')
})

test('匿名类组件按声明名识别', () => {
  const result = transform('const Card = class extends React.Component { render() { return <div>卡</div> } }')
  expect(result.code).toContain('data-annotai-use-path={this.props && this.props["data-annotai-use-path"]}')
})

test('块级遮蔽的同名声明不参与根绑定', () => {
  const code = 'const root = <aside />\nfunction Card(props) {\n  { const root = <span />; void root }\n  return root\n}'
  const result = transform(code)
  expect(result.code).not.toContain('data-annotai-use-path={')
})
