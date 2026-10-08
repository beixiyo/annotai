/** 特性区：四张卡片网格 */
import { createMemo, type JSX } from 'solid-js'
import { t, type SiteMessageKey } from '../i18n'

interface Feature {
  title: string
  description: string
}

const FEATURE_KEYS: Array<[SiteMessageKey, SiteMessageKey]> = [
  ['f1Title', 'f1Desc'],
  ['f2Title', 'f2Desc'],
  ['f3Title', 'f3Desc'],
  ['f4Title', 'f4Desc'],
]

export function Features() {
  const features = createMemo(() => FEATURE_KEYS.map(([title, desc]) => ({ title: t(title), description: t(desc) })))
  return (
    <section id="features" class="border-b border-line">
      <div class="mx-auto max-w-7xl px-6 py-24">
        <h2 class="text-2xl font-semibold tracking-tight">{ t('fTitle') }</h2>
        <p class="mt-3 max-w-lg text-muted">{ t('fSubtitle') }</p>
        <div class="mt-12 grid gap-4 sm:grid-cols-2">
          <FeatureList features={ features() } />
        </div>
      </div>
    </section>
  )
}

function FeatureList(props: { features: Feature[] }): JSX.Element {
  return (
    <>
      { props.features.map((feature) => <FeatureCard title={ feature.title } description={ feature.description } />) }
    </>
  )
}

function FeatureCard(props: Feature) {
  return (
    <div class="rounded-lg border border-line bg-surface p-6 transition-colors hover:border-subtle">
      <h3 class="font-medium">{ props.title }</h3>
      <p class="mt-2.5 text-sm leading-relaxed text-muted">{ props.description }</p>
    </div>
  )
}
