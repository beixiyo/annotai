import type { Annotation } from '@annotai/protocol'
import { describe, expect, it } from 'vitest'
import { annotationsToMarkdown } from '../src/markdown.js'

function target(id: string, snippet: string, overrides: Partial<Annotation['targets'][number]> = {}) {
  return {
    context: {
      source: {
        id,
        file: '/workspace/src/App.tsx',
        tag: 'button',
        start: { line: 12, column: 4, offset: 10 },
        end: { line: 12, column: 25, offset: 31 },
      },
      path: 'src/App.tsx',
      snippet,
      startLine: 12,
    },
    text: '保存 *现在*',
    className: 'rounded [data-x="`"]',
    domPath: 'main > button',
    ...overrides,
  }
}

describe('annotationsToMarkdown', () => {
  it('exports multiple annotations and removes duplicate captures', () => {
    const annotation: Annotation = {
      id: 'a',
      question: '调整按钮间距',
      targets: [
        target('same', '<button>保存</button>'),
        target('same', '<button>保存</button>'),
        target('same', '<button>保存</button>', { text: '收藏项目 · 1' }),
      ],
    }
    const markdown = annotationsToMarkdown([annotation, { id: 'b', question: '修改标题', targets: [target('title', '<h1>标题</h1>')] }], { locale: 'zh' })
    expect(markdown).toContain('## 标注 1')
    expect(markdown).toContain('## 标注 2')
    expect(markdown.match(/### 目标/g)).toHaveLength(3)
  })

  it('supports disabling each context field', () => {
    const markdown = annotationsToMarkdown([{ id: 'a', question: 'q', targets: [target('x', 'const x = 1')] }], {
      locale: 'zh',
      sourceLocation: false,
      sourceSnippet: false,
      className: false,
      text: false,
      domPath: false,
    })
    expect(markdown).toBe('# 源码标注\n\n## 标注 1\n问题：q\n\n### 目标 1\n')
  })

  it('chooses a longer fence when a snippet contains backticks', () => {
    const markdown = annotationsToMarkdown([{ id: 'a', question: '保留代码', targets: [target('x', 'const x = ```\nreturn x')] }], { locale: 'zh' })
    expect(markdown).toContain('````\nconst x = ```\nreturn x\n````')
  })

  it('keeps special text as content and includes configured metadata', () => {
    const markdown = annotationsToMarkdown([{ id: 'a', question: '显示 `x` 与 # 标签', targets: [target('x', '')] }], {
      locale: 'zh' as const,
      sourceSnippet: false,
      domPath: true,
    })
    expect(markdown).toContain('问题：显示 `x` 与 # 标签')
    expect(markdown).toContain('类名：`rounded [data-x="`"]`')
    expect(markdown).toContain('DOM 路径：`main > button`')
    expect(markdown).not.toContain('源码片段：')
  })
})
