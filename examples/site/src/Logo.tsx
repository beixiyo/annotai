/** 品牌标识:虚线选框与定位圆点,呼应产品的框选动作 */

export function Logo(props: { size?: number }) {
  return (
    <svg
      width={ props.size ?? 20 }
      height={ props.size ?? 20 }
      viewBox="0 0 32 32"
      aria-hidden="true"
    >
      <rect width="32" height="32" rx="7" class="fill-invert" />
      <rect
        x="9"
        y="9"
        width="14"
        height="14"
        fill="none"
        class="stroke-on-invert"
        stroke-width="2"
        stroke-dasharray="4 3"
      />
      <circle cx="16" cy="16" r="2.5" class="fill-on-invert" />
    </svg>
  )
}
