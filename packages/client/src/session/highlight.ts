/** Prism 语法高亮：按文件扩展名推断语法，整段 tokenize 后按行输出转义 HTML */
import Prism from 'prismjs'
import 'prismjs/components/prism-clike'
import 'prismjs/components/prism-css'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-jsx'
import 'prismjs/components/prism-json'
import 'prismjs/components/prism-markup'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-tsx'

/** 组件按依赖顺序副作用注册；vue 用 markup 近似 */
const languageByExtension: Record<string, string> = {
  tsx: 'tsx',
  ts: 'typescript',
  mts: 'typescript',
  cts: 'typescript',
  jsx: 'jsx',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  json: 'json',
  css: 'css',
  html: 'markup',
  vue: 'markup',
}

/** 按扩展名取 Prism 语法；未知扩展返回 undefined，调用方退回纯文本 */
export function grammarFor(path: string) {
  const extension = path.split('.').pop()?.toLowerCase() ?? ''
  const language = languageByExtension[extension]
  const grammar = language ? Prism.languages[language] : undefined
  return grammar instanceof Object ? grammar as Prism.Grammar : undefined
}

/** 每行返回可直接作为 innerHTML 的片段；所有文本均经 HTML 转义 */
export function highlightLines(code: string, grammar: Prism.Grammar): string[] {
  const tokens: Array<{ types: string[]; text: string }> = []
  flattenTokens(Prism.tokenize(code, grammar), [], tokens)

  const lines: Array<Array<{ types: string[]; text: string }>> = [[]]
  for (const token of tokens) {
    const parts = token.text.split('\n')
    parts.forEach((part, index) => {
      if (index > 0) lines.push([])
      if (part.length > 0) lines[lines.length - 1].push({ types: token.types, text: part })
    })
  }
  return lines.map((row) => row.map(renderSpan).join(''))
}

/** 展平嵌套 token 树；子 token 继承外层类型，保证嵌套结构（如模板串内插值）整体可着色 */
function flattenTokens(
  input: Array<string | Prism.Token>,
  inherited: string[],
  output: Array<{ types: string[]; text: string }>,
) {
  for (const entry of input) {
    if (typeof entry === 'string') {
      if (entry.length > 0) output.push({ types: inherited, text: entry })
      continue
    }
    const types = [...inherited, entry.type]
    if (typeof entry.content === 'string') {
      output.push({ types, text: entry.content })
    }
    else if (Array.isArray(entry.content)) {
      flattenTokens(entry.content, types, output)
    }
    else if (entry.content) {
      flattenTokens([entry.content], types, output)
    }
  }
}

function renderSpan(token: { types: string[]; text: string }) {
  const text = escapeHtml(token.text)
  return token.types.length > 0 ? `<span class="token ${token.types.join(' ')}">${text}</span>` : text
}

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
}
