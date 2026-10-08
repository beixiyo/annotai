/**
 * 代码块：Prism 同步高亮，SSR 预渲染产出带 token span 的静态 HTML，客户端零运行时
 * 新语言需先在 prism-setup 之后追加对应 components import
 */
import type Prism from 'prismjs'
import { createMemo } from 'solid-js'
import './highlight/prism-setup'
import 'prismjs/components/prism-javascript'
import 'prismjs/components/prism-typescript'
import 'prismjs/components/prism-bash'

export type CodeLang = 'ts' | 'bash'

const GRAMMAR_LANG: Record<CodeLang, string> = { ts: 'typescript', bash: 'bash' }

/** grammar 组件挂载在全局 Prism 上（见 prism-setup），这里取回类型化引用 */
const prism = (globalThis as { Prism: typeof Prism }).Prism

/** 单行 shell 命令的 bash 高亮 HTML；供安装命令等内联场景复用 */
export function highlightBash(code: string) {
  return prism.highlight(code, prism.languages.bash, 'bash')
}

export function CodeBlock(props: { code: string; lang: CodeLang }) {
  const html = createMemo(() => {
    const lang = GRAMMAR_LANG[props.lang]
    return prism.highlight(props.code, prism.languages[lang], lang)
  })
  return (
    <pre class="qs-code overflow-x-auto rounded-md bg-bg p-4 font-mono text-xs leading-relaxed">
      <code class={ `language-${GRAMMAR_LANG[props.lang]}` } innerHTML={ html() } />
    </pre>
  )
}
