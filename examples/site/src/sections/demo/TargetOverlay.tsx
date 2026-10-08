/**
 * 目标元素的选择反馈：高亮框与尺寸标签、元素右侧的悬停源码预览卡
 * 尚无选中时悬停与选中都用蓝色（客户端仅在已有选中时把悬停标为橙色）；颜色取自客户端 --sn-highlight* token
 */
import { type ParentProps, Show } from 'solid-js'
import { t } from '../../i18n'
import type { StageBox } from './measure'

export interface TargetOverlayProps {
  /** 目标外扩后的高亮矩形；未测量时为 null */
  box: StageBox | null
  /** 高亮标签文本 */
  label: string
  /** 显示悬停高亮 */
  hovered: boolean
  /** 显示选中高亮 */
  selected: boolean
  /** 显示悬停源码预览 */
  preview: boolean
  previewRef: (el: HTMLDivElement) => void
  /** 画布宽度：预览卡右缘不越出画布 */
  canvasWidth: number
}

/** 预览卡宽度与距画布右缘的最小留白（逻辑 px） */
const PREVIEW = { width: 204, margin: 10 } as const

/** 位置标签与 Markdown 中的源码坐标 */
export const DEMO_LOCATION = 'ProductCard.tsx:23:9'

export function TargetOverlay(props: TargetOverlayProps) {
  return (
    <Show when={ props.box }>
      { (box) => (
        <>
          <Show when={ props.hovered || props.selected }>
            <div
              class={ `pointer-events-none absolute animate-demo-pop rounded-[4px] border-2 transition-colors duration-200 ${
                props.selected ? 'border-[#3478f6] bg-[#3478f62a]' : 'border-[#3478f6] bg-[#3478f61c]'
              }` }
              style={ { left: `${box().x}px`, top: `${box().y}px`, width: `${box().width}px`, height: `${box().height}px` } }
            >
              <span
                class={ `absolute -top-[25px] -left-0.5 rounded-[5px] px-1.5 py-0.75 font-mono text-[11px] leading-4 whitespace-nowrap text-white transition-colors duration-200 ${
                  'bg-[#2466db]'
                }` }
              >
                { props.label }
              </span>
            </div>
          </Show>

          { /* 悬停源码预览：与客户端一致出现在元素右侧，目标行高亮 */ }
          <Show when={ props.preview }>
            <div
              ref={ props.previewRef }
              class="pointer-events-none absolute z-[5] animate-demo-rise rounded-lg border border-white/8 bg-[#1e1e2e] p-2.5 font-mono text-[10px] leading-[1.7] text-[#c2c2c2] shadow-[0_16px_40px_rgb(0_0_0/0.22)]"
              style={ {
                width: `${PREVIEW.width}px`,
                left: `${Math.min(box().x + box().width + PREVIEW.margin, props.canvasWidth - PREVIEW.width - PREVIEW.margin)}px`,
                top: `${box().y}px`,
              } }
            >
              <p class="mb-1 truncate text-[9.5px] text-[#8b8b9a]">/src/components/{ DEMO_LOCATION }</p>
              <CodeLine no={ 22 }>
                <Tag>{ '<div' }</Tag> <Attr>class</Attr>=<Str>"actions"</Str>
                <Tag>{ '>' }</Tag>
              </CodeLine>
              <CodeLine no={ 23 } active>
                { '  ' }
                <Tag>{ '<button' }</Tag> <Attr>class</Attr>=<Str>"btn-cart"</Str>
                <Tag>{ '>' }</Tag>
              </CodeLine>
              <CodeLine no={ 24 }>{ `    ${t('demoCart')}` }</CodeLine>
              <CodeLine no={ 25 }>
                { '  ' }
                <Tag>{ '</button>' }</Tag>
              </CodeLine>
            </div>
          </Show>
        </>
      ) }
    </Show>
  )
}

function CodeLine(props: ParentProps<{ no: number; active?: boolean }>) {
  return (
    <p class={ `flex gap-2.5 rounded px-1 whitespace-pre ${props.active ? 'bg-[#313244] text-[#e0e0e0]' : ''}` }>
      <span class="w-3.5 shrink-0 text-right text-[#5c5f77]">{ props.no }</span>
      <span class="truncate">{ props.children }</span>
    </p>
  )
}

const Tag = (props: { children: string }) => <span class="text-[#4ec9b0]">{ props.children }</span>
const Attr = (props: { children: string }) => <span class="text-[#d19a66]">{ props.children }</span>
const Str = (props: { children: string }) => <span class="text-[#98c379]">{ props.children }</span>
