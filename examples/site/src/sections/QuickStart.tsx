/** 快速开始：安装、接入 Vite、框选复制三步，一步一行 */
import { createMemo, For } from 'solid-js'
import { CodeBlock } from '../CodeBlock'
import { t } from '../i18n'
import { InstallCommand } from '../InstallCommand'

export function QuickStart() {
  const steps = createMemo(() => [
    { title: t('qs1Title'), lang: 'bash' as const, code: '' },
    {
      title: t('qs2Title'),
      lang: 'ts' as const,
      code: `import { annotate } from 'annotai/vite'

export default defineConfig({
  plugins: [annotate()],
})`,
    },
    {
      title: t('qs3Title'),
      lang: 'bash' as const,
      code: `pnpm dev

${t('qs3Code')}`,
    },
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
                  { index() === 0
                    ? <InstallCommand />
                    : <CodeBlock code={ step.code } lang={ step.lang } /> }
                </div>
              </div>
            ) }
          </For>
        </div>
      </div>
    </section>
  )
}
