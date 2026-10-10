/** 快速开始：安装、按框架接入 Vite、框选复制三步，一步一行；第二步随所选框架切换 vite.config 片段 */
import { createMemo, createSignal, For } from 'solid-js'
import { CodeBlock } from '../CodeBlock'
import { t } from '../i18n'
import { InstallCommand } from '../InstallCommand'

/** 接入框架的展示顺序 */
const FRAMEWORK_IDS: readonly QuickFramework[] = ['react', 'vue', 'solid']

/**
 * 各框架的 vite.config 片段，与 README 的接入示例保持一致
 * React 使用内置转换器；Vue / Solid 需显式传入对应的 transforms，`.tsx/.jsx` 无法区分编译目标
 */
const VITE_CONFIG: Record<QuickFramework, { label: string; code: string }> = {
  react: {
    label: 'React',
    code: `// pnpm add -D @vitejs/plugin-react
import react from '@vitejs/plugin-react'
import { annotate } from 'annotai/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [annotate(), react()],
})`,
  },
  vue: {
    label: 'Vue',
    code: `// pnpm add -D @vitejs/plugin-vue
import vue from '@vitejs/plugin-vue'
import { annotate } from 'annotai/vite'
import { vueTransform } from 'annotai/vue'
import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [annotate({ transforms: [vueTransform] }), vue()],
})`,
  },
  solid: {
    label: 'Solid',
    code: `// pnpm add -D vite-plugin-solid
import { annotate } from 'annotai/vite'
import { solidTransform } from 'annotai/solid'
import { defineConfig } from 'vite'
import solid from 'vite-plugin-solid'

export default defineConfig({
  plugins: [annotate({ transforms: [solidTransform] }), solid()],
})`,
  },
}

export function QuickStart() {
  const [framework, setFramework] = createSignal<QuickFramework>('react')

  const steps = createMemo(() => [
    { title: t('qs1Title') },
    { title: t('qs2Title') },
    { title: t('qs3Title'), code: `pnpm dev\n\n${t('qs3Code')}` },
  ])

  return (
    <section id="quickstart" class="border-b border-line">
      <div class="mx-auto max-w-7xl px-6 py-24">
        <h2 class="text-2xl font-semibold tracking-tight">{ t('qsTitle') }</h2>
        <p class="mt-3 max-w-lg text-muted">{ t('qsSubtitle') }</p>
        <div class="mt-12 flex flex-col gap-4">
          <For each={ steps() }>
            { (step, index) => (
              <div class="flex flex-col rounded-lg border border-line bg-surface p-6">
                <div class="flex items-center gap-3">
                  <span class="flex h-6 w-6 items-center justify-center rounded-full bg-invert font-mono text-xs text-on-invert">
                    { index() + 1 }
                  </span>
                  <h3 class="font-medium">{ step.title }</h3>
                </div>
                <div class="mt-4">
                  { index() === 0 && <InstallCommand /> }
                  { index() === 1 && (
                    <>
                      { /* 第二步：框架切换放在代码块上方、左对齐，只影响 vite.config 片段 */ }
                      <div role="radiogroup" aria-label={ t('qsFrameworkAria') } class="mb-4 flex w-fit items-center gap-1 rounded-full border border-line p-1">
                        <For each={ FRAMEWORK_IDS }>
                          { (id) => (
                            <button
                              type="button"
                              role="radio"
                              aria-checked={ framework() === id }
                              onClick={ () => setFramework(id) }
                              class={ `h-7 min-w-16 cursor-pointer rounded-full px-3 text-xs leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-subtle ${
                                framework() === id ? 'bg-invert font-medium text-on-invert' : 'text-muted hover:text-ink'
                              }` }
                            >
                              { VITE_CONFIG[id].label }
                            </button>
                          ) }
                        </For>
                      </div>
                      <CodeBlock code={ VITE_CONFIG[framework()].code } lang="ts" />
                    </>
                  ) }
                  { index() === 2 && <CodeBlock code={ step.code ?? '' } lang="bash" /> }
                </div>
              </div>
            ) }
          </For>
        </div>
      </div>
    </section>
  )
}

export type QuickFramework = 'react' | 'vue' | 'solid'
