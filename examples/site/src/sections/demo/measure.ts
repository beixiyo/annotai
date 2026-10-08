/**
 * 回放元素几何测量与镜头换算
 * 测量走 offsetLeft/offsetTop 链，得到画布逻辑坐标：不受镜头缩放、入场动画、外层适配缩放等 transform 影响
 * 纯函数、无 Solid 依赖
 */

/** 相对元素的水平锚点 */
export type AnchorX = 'left' | 'center' | 'right'
/** 相对元素的垂直锚点 */
export type AnchorY = 'top' | 'center' | 'bottom'

/** 画布逻辑坐标中的点 */
export interface StageOffset {
  x: number
  y: number
}

/** 画布逻辑坐标中的矩形 */
export interface StageBox {
  x: number
  y: number
  width: number
  height: number
}

/** 镜头变换：先缩放再平移，transform-origin 为画布左上角 */
export interface CameraTransform {
  x: number
  y: number
  zoom: number
}

/**
 * 元素相对画布的布局矩形（未变换）
 * 沿 offsetParent 累加到 canvas 为止；元素不在 canvas 内时返回 null
 */
export function layoutBox(el: HTMLElement, canvas: HTMLElement): StageBox | null {
  let x = 0
  let y = 0
  let node: HTMLElement | null = el
  while (node && node !== canvas) {
    x += node.offsetLeft
    y += node.offsetTop
    node = node.offsetParent as HTMLElement | null
  }
  if (node !== canvas) return null
  return { x, y, width: el.offsetWidth, height: el.offsetHeight }
}

/** 矩形上的锚点 */
export function anchorPoint(box: StageBox, x: AnchorX, y: AnchorY): StageOffset {
  const ratio = { left: 0, top: 0, center: 0.5, right: 1, bottom: 1 }
  return { x: box.x + box.width * ratio[x], y: box.y + box.height * ratio[y] }
}

/** 矩形四周外扩 padding */
export function inflate(box: StageBox, padding: number): StageBox {
  return {
    x: box.x - padding,
    y: box.y - padding,
    width: box.width + padding * 2,
    height: box.height + padding * 2,
  }
}

/** 多个矩形的外接矩形；空数组返回 null */
export function unionBox(boxes: readonly StageBox[]): StageBox | null {
  if (boxes.length === 0) return null
  const left = Math.min(...boxes.map((box) => box.x))
  const top = Math.min(...boxes.map((box) => box.y))
  const right = Math.max(...boxes.map((box) => box.x + box.width))
  const bottom = Math.max(...boxes.map((box) => box.y + box.height))
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * 把焦点矩形放到视口中心并放大 zoom 倍；平移量钳制在画布内，镜头不露出画布外的空白
 * zoom ≤ 1 时回到原位
 */
export function cameraFor(focus: StageBox, zoom: number, viewport: { width: number; height: number }): CameraTransform {
  if (zoom <= 1) return { x: 0, y: 0, zoom: 1 }
  const cx = focus.x + focus.width / 2
  const cy = focus.y + focus.height / 2
  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
  return {
    x: clamp(viewport.width / 2 - cx * zoom, viewport.width - viewport.width * zoom, 0),
    y: clamp(viewport.height / 2 - cy * zoom, viewport.height - viewport.height * zoom, 0),
    zoom,
  }
}
