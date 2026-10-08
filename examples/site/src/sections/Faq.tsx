/** FAQ：搜索过滤 + 手风琴，同时是长列表与输入控件的标注场景载体 */
import { createMemo, createSignal, For } from 'solid-js'
import { t, type SiteMessageKey } from '../i18n'

interface FaqItem {
  question: string
  answer: string
}

const FAQ_KEYS: Array<[string, string]> = [
  ['faq1Q', 'faq1A'],
  ['faq2Q', 'faq2A'],
  ['faq3Q', 'faq3A'],
]

export function Faq() {
  const items = createMemo(() => FAQ_KEYS.map(([q, a]) => ({ question: t(q as SiteMessageKey), answer: t(a as SiteMessageKey) })))
  const [query, setQuery] = createSignal('')

  const filtered = createMemo(() => {
    const keyword = query().trim().toLowerCase()
    if (!keyword) return items()
    return items().filter(
      (item) =>
        item.question.toLowerCase().includes(keyword)
        || item.answer.toLowerCase().includes(keyword),
    )
  })

  return (
    <section id="faq" class="border-b border-line">
      <div class="mx-auto max-w-7xl px-6 py-24">
        <h2 class="text-2xl font-semibold tracking-tight">{ t('faqTitle') }</h2>
        <input
          type="search"
          value={ query() }
          onInput={ (event) => setQuery(event.currentTarget.value) }
          placeholder={ t('faqPlaceholder') }
          aria-label={ t('faqAria') }
          class="mt-8 w-full rounded-md border border-line bg-surface px-4 py-2.5 text-sm outline-none transition-colors placeholder:text-subtle focus:border-subtle"
        />
        <div class="mt-6 divide-y divide-line rounded-lg border border-line">
          <For each={ filtered() }>
            { (item) => (
              <details class="group px-5">
                <summary class="flex cursor-pointer list-none items-center justify-between py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
                  { item.question }
                  <span class="text-subtle transition-transform group-open:rotate-45" aria-hidden="true">+</span>
                </summary>
                <p class="pb-4 text-sm leading-relaxed text-muted">{ item.answer }</p>
              </details>
            ) }
          </For>
        </div>
      </div>
    </section>
  )
}
