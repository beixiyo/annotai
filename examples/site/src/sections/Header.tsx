/** 顶部导航：logo、锚点与语言切换 */
import { For } from 'solid-js'
import { locale, type SiteLocale, switchLocale, t } from '../i18n'
import { Logo } from '../Logo'

/** 语言切换选项：只有两种语言，用分段切换代替下拉，一眼可见当前语言 */
const LOCALES: { value: SiteLocale; label: string }[] = [
  { value: 'zh', label: '中' },
  { value: 'en', label: 'EN' },
]

export function Header() {
  return (
    <header class="sticky top-0 z-40 border-b border-line bg-bg/80 backdrop-blur">
      <div class="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
        <a href="#top" class="flex items-center gap-2.5 font-medium">
          <Logo size={ 20 } />
          <span>annotai</span>
        </a>
        <nav class="flex items-center gap-6 text-sm text-muted" aria-label={ t('navAria') }>
          <a href="#features" class="hidden whitespace-nowrap transition-colors hover:text-ink sm:inline">{ t('navFeatures') }</a>
          <a href="#quickstart" class="hidden whitespace-nowrap transition-colors hover:text-ink sm:inline">{ t('navQuickstart') }</a>
          <a href="#faq" class="hidden whitespace-nowrap transition-colors hover:text-ink sm:inline">{ t('navFaq') }</a>
          <div role="radiogroup" aria-label={ t('langAria') } class="flex items-center rounded-full border border-line p-0.5">
            <For each={ LOCALES }>
              { (item) => (
                <button
                  type="button"
                  role="radio"
                  aria-checked={ locale() === item.value }
                  onClick={ () => switchLocale(item.value) }
                  class={ `h-6 min-w-8 cursor-pointer rounded-full px-2 text-xs leading-none transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-subtle ${
                    locale() === item.value ? 'bg-invert font-medium text-on-invert' : 'text-muted hover:text-ink'
                  }` }
                >
                  { item.label }
                </button>
              ) }
            </For>
          </div>
          <a
            href="https://github.com/beixiyo/annotai"
            target="_blank"
            rel="noopener noreferrer"
            aria-label={ t('githubAria') }
            title={ t('githubAria') }
            class="flex size-7 items-center justify-center rounded-full text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-subtle"
          >
            <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
            </svg>
          </a>
        </nav>
      </div>
    </header>
  )
}
