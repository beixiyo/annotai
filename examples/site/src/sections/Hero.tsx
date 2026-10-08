/** 首屏：主张、安装命令复制（Portal toast）与标注回放演示 */
import { createSignal, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { t } from '../i18n'
import { InstallCommand } from '../InstallCommand'
import { DemoPlayback } from './demo'


export function Hero() {
  const [copied, setCopied] = createSignal(false)

  let toastTimer = 0
  onCleanup(() => {
    if (toastTimer) window.clearTimeout(toastTimer)
  })

  /** CopyButton 复制完成后弹出页面级提示 */
  function notifyCopied() {
    setCopied(true)
    window.clearTimeout(toastTimer)
    toastTimer = window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <section id="top" class="border-b border-line">
      <div class="mx-auto max-w-7xl px-6 pt-16 pb-20 lg:pt-24 lg:pb-24">
        { /* 主张居中，演示独占下方整行；min-w-0 允许安装命令在窄屏内截断，而不是撑出视口 */ }
        <div class="mx-auto flex max-w-3xl min-w-0 flex-col items-center text-center">
          <p class="mb-5 font-mono text-xs tracking-widest text-subtle">ANNOTAI</p>
          <h1 class="text-4xl leading-tight font-semibold tracking-tight text-balance lg:text-6xl lg:leading-[1.08]">
            { t('heroTitleL1') }
            <br />
            { t('heroTitleL2') }
          </h1>
          <p class="mt-6 max-w-xl text-lg leading-relaxed text-pretty text-muted">
            { t('heroDesc') }
          </p>
          <div class="mt-9 flex max-w-full min-w-0 flex-wrap items-center justify-center gap-4">
            <a
              href="#quickstart"
              class="rounded-md bg-invert px-5 py-2.5 text-sm font-medium text-on-invert transition-opacity hover:opacity-85"
            >
              { t('heroCta') }
            </a>
            <InstallCommand onCopied={ notifyCopied } />
          </div>
        </div>

        <div class="mx-auto mt-14 max-w-5xl lg:mt-16">
          <DemoPlayback />
        </div>

        <Show when={ copied() }>
          <Portal mount={ document.body }>
            <div
              role="status"
              class="fixed bottom-6 left-1/2 z-50 -translate-x-1/2 rounded-md bg-invert px-4 py-2 text-sm text-on-invert shadow-lg"
            >
              { t('copyInstallDone') }
            </div>
          </Portal>
        </Show>
      </div>
    </section>
  )
}
