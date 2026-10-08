/**
 * 演示画布里的被标注页面：浏览器外框 + 一张商品详情页
 * 只负责渲染；“加入购物车”按钮是标注目标，applied 状态由回放编排传入
 */
import { t } from '../../i18n'

export interface MockAppProps {
  /** AI 修改已生效：目标按钮变红 */
  applied: boolean
  /** 页面内容区（不含浏览器顶栏），供光标与镜头取锚点 */
  appRef: (el: HTMLDivElement) => void
  /** 标注目标：加入购物车按钮 */
  targetRef: (el: HTMLSpanElement) => void
}

export function MockApp(props: MockAppProps) {
  return (
    <div class="absolute inset-0 flex flex-col bg-bg">
      { /* 浏览器顶栏：macOS 交通灯 + 地址栏 */ }
      <div class="flex h-10 shrink-0 items-center gap-3 border-b border-line bg-surface px-4">
        <div class="flex gap-1.5" aria-hidden="true">
          <span class="size-2.5 rounded-full bg-[#ff5f57] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <span class="size-2.5 rounded-full bg-[#febc2e] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
          <span class="size-2.5 rounded-full bg-[#28c840] shadow-[inset_0_0_0_0.5px_rgb(0_0_0/0.12)]" />
        </div>
        <div class="mx-auto flex h-6 w-64 items-center justify-center gap-1.5 rounded-md border border-line bg-bg font-mono text-[11px] text-subtle">
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
          localhost:5173/products/aero
        </div>
        <span class="w-10.5" />
      </div>

      <div ref={ props.appRef } class="relative flex-1">
        { /* 站点导航 */ }
        <div class="flex h-12 items-center justify-between px-7 text-[13px]">
          <span class="font-semibold tracking-tight">Aero</span>
          <div class="flex items-center gap-5 text-muted">
            <span>{ t('demoNavShop') }</span>
            <span>{ t('demoNavJournal') }</span>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M6 7h12l-1 13H7z" />
              <path d="M9 7a3 3 0 0 1 6 0" />
            </svg>
          </div>
        </div>

        { /* 商品详情：左图右文 */ }
        <div class="mt-3 flex gap-7 px-7">
          <div class="grid size-53 shrink-0 place-items-center rounded-xl bg-surface text-subtle">
            <svg width="112" height="112" viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
              <path d="M14 38V32a18 18 0 0 1 36 0v6" />
              <rect x="9" y="36" width="11" height="17" rx="4" />
              <rect x="44" y="36" width="11" height="17" rx="4" />
            </svg>
          </div>

          <div class="min-w-0 flex-1 pt-1">
            <p class="text-[11px] tracking-wide text-subtle uppercase">{ t('demoCategory') }</p>
            <p class="mt-1.5 text-[22px] leading-tight font-semibold tracking-tight">{ t('demoProduct') }</p>
            <p class="mt-1.5 text-xs text-muted">★ { t('demoRating') }</p>
            <p class="mt-2.5 text-[22px] font-semibold tabular-nums">{ t('demoPrice') }</p>
            <p class="mt-2 text-xs leading-relaxed text-muted">{ t('demoDesc') }</p>
            <div class="mt-8 flex items-center gap-2">
              <span
                ref={ props.targetRef }
                class={ `inline-flex h-8 items-center rounded-md px-4 text-[13px] font-medium transition-[background-color,color,box-shadow] duration-500 ${
                  props.applied
                    ? 'bg-[#e5484d] text-white shadow-[0_0_0_4px_rgb(229_72_77/0.18)]'
                    : 'bg-invert text-on-invert'
                }` }
              >
                { t('demoCart') }
              </span>
              <span class="grid size-8 place-items-center rounded-md border border-line text-muted" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" />
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
