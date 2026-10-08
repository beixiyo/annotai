/** 安装命令展示：包管理器 tabs + 命令 + 复制按钮联动 */
import { createMemo, createSignal, For } from 'solid-js'
import { highlightBash } from './CodeBlock'
import { CopyButton } from './CopyButton'
import { t } from './i18n'

type Manager = 'npm' | 'yarn' | 'pnpm' | 'bun'

const MANAGERS: Manager[] = ['npm', 'yarn', 'pnpm', 'bun']

const COMMANDS: Record<Manager, string> = {
  npm: 'npm install -D annotai',
  yarn: 'yarn add -D annotai',
  pnpm: 'pnpm add -D annotai',
  bun: 'bun add -d annotai',
}

export function InstallCommand(props: { onCopied?: () => void }) {
  const [manager, setManager] = createSignal<Manager>('npm')
  const command = createMemo(() => COMMANDS[manager()])
  return (
    <div class="group flex max-w-full min-w-0 items-center gap-2.5 rounded-md border border-line bg-surface px-4 py-2.5 font-mono text-sm text-muted transition-colors hover:text-ink">
      <div class="flex shrink-0 items-center gap-1" role="tablist" aria-label={ t('pmAria') }>
        <For each={ MANAGERS }>
          { (name) => (
            <button
              type="button"
              role="tab"
              aria-selected={ manager() === name }
              onClick={ () => setManager(name) }
              class={ `cursor-pointer rounded px-1.5 py-0.5 text-xs transition-colors ${
                manager() === name ? 'bg-bg font-medium text-ink' : 'text-subtle hover:text-muted'
              }` }
            >
              { name }
            </button>
          ) }
        </For>
      </div>
      <span class="truncate text-ink" innerHTML={ highlightBash(command()) } />
      <CopyButton text={ command() } label={ t('copyInstall') } onCopied={ () => props.onCopied?.() } />
    </div>
  )
}
