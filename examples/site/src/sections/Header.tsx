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
        </nav>
      </div>
    </header>
  )
}
