/**
 * 拖拽与位置持久化
 *
 * 面板容器默认停靠右下角（panelBase 的 right/bottom）；一旦拖动，
 * 改用 left/top 内联定位并写入 localStorage，下次挂载恢复
 * 收起态拖启动按钮，展开态拖面板头部把手行，共用同一份持久化位置
 */

export interface LauncherPosition {
  left: number
  top: number
}

const STORAGE_KEY = 'annotai:launcher-position'

/** 读取持久化位置，解析失败或数据非法时返回 null */
export function readLauncherPosition(): LauncherPosition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const value = JSON.parse(raw) as Partial<LauncherPosition>
    const { left, top } = value
    if (typeof left !== 'number' || !Number.isFinite(left)) return null
    if (typeof top !== 'number' || !Number.isFinite(top)) return null
    return { left, top }
  }
  catch {
    return null
  }
}

export function writeLauncherPosition(position: LauncherPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position))
  }
  catch {
    // 隐私模式等场景下静默放弃持久化
  }
}

/** 把位置应用到面板容器：锚定 left/top，解除默认 right/bottom 停靠 */
export function applyLauncherPosition(panel: HTMLElement, position: LauncherPosition): void {
  panel.style.left = `${position.left}px`
  panel.style.top = `${position.top}px`
  panel.style.right = 'auto'
  panel.style.bottom = 'auto'
}

/** 视口内钳制，四周留 8px；容器尺寸变化或窗口缩放后保持可见 */
export function clampLauncherPosition(position: LauncherPosition, panel: HTMLElement): LauncherPosition {
  const margin = 8
  const maxWidth = Math.max(margin, window.innerWidth - panel.offsetWidth - margin)
  const maxHeight = Math.max(margin, window.innerHeight - panel.offsetHeight - margin)
  return {
    left: Math.min(Math.max(position.left, margin), maxWidth),
    top: Math.min(Math.max(position.top, margin), maxHeight),
  }
}

/** 判定面板容器是否已脱离默认停靠（被拖动过或恢复了持久化位置） */
export function isLauncherPositioned(panel: HTMLElement): boolean {
  return panel.style.left !== '' && panel.style.right === 'auto'
}

export interface DragOptions {
  /** 命中此判定时忽略按下（不进入拖拽）；展开态用于排除把手行内的按钮 */
  ignore?: (event: PointerEvent) => boolean
  /** 一次有效拖动结束（位置已应用）后回调，宿主可在此持久化 */
  onDragged?: (position: LauncherPosition) => void
}

/**
 * 绑定拖拽把手；返回解绑函数
 * 位移超过阈值才算拖动，普通点击不受影响；拖动结束后的那次 click 会被吞掉
 */
export function bindDrag(handle: HTMLElement, panel: HTMLElement, options: DragOptions = {}): () => void {
  const DRAG_THRESHOLD = 4
  let pointerId = -1
  let startX = 0
  let startY = 0
  let originLeft = 0
  let originTop = 0
  let dragging = false

  /** 拖动期间全局禁止选择，防止指针扫过页面文本时浏览器启动原生选择 */
  function setSelectLock(on: boolean) {
    document.documentElement.style.userSelect = on ? 'none' : ''
  }

  function onPointerDown(event: PointerEvent) {
    if (event.button !== 0 || options.ignore?.(event)) return
    // 阻止 mousedown 兼容事件：从把手开始的原生文本选择与拖拽不应启动；
    // click 不受 pointerdown preventDefault 影响，按钮点击与拖动后的吞 click 逻辑照常工作
    event.preventDefault()
    disarmSwallow()
    pointerId = event.pointerId
    dragging = false
    startX = event.clientX
    startY = event.clientY
    const rect = panel.getBoundingClientRect()
    originLeft = rect.left
    originTop = rect.top
    window.addEventListener('blur', onWindowBlur)
    // 合成事件没有活动 pointer，capture 会抛；拖拽依赖 pointermove 监听，捕获失败不影响功能
    try {
      handle.setPointerCapture(event.pointerId)
    }
    catch {
    }
  }

  function onPointerMove(event: PointerEvent) {
    if (pointerId === -1 || event.pointerId !== pointerId) return
    const dx = event.clientX - startX
    const dy = event.clientY - startY
    if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return
    if (!dragging) {
      dragging = true
      setSelectLock(true)
    }
    handle.style.cursor = 'grabbing'
    applyLauncherPosition(panel, clampLauncherPosition({ left: originLeft + dx, top: originTop + dy }, panel))
  }

  /**
   * 拖动后的 click 在捕获阶段吞掉，避免误开面板或误触把手行内按钮
   * 该 click 可能不会到达（松开在窗口外、系统取消等），因此在下一次按下与解绑时一并撤销，防止吞掉之后的真实点击
   */
  function swallowClick(event: Event) {
    disarmSwallow()
    event.stopImmediatePropagation()
    event.preventDefault()
  }

  function disarmSwallow() {
    handle.removeEventListener('click', swallowClick, { capture: true })
  }

  /** 原生拖拽一旦启动会接管指针并停止 pointermove，把手内一律禁止 */
  function onDragStart(event: DragEvent) {
    event.preventDefault()
  }

  function stopDragging() {
    if (!dragging) return
    dragging = false
    setSelectLock(false)
  }

  /**
   * 结束一次按下：复位状态，有效拖动则持久化当前位置
   * 只有正常 pointerup 之后才会跟随 click，需要吞掉；取消、失去捕获、窗口失焦不会产生 click
   */
  function finishPointer(expectClick: boolean) {
    if (pointerId === -1) return
    const releasedId = pointerId
    pointerId = -1
    window.removeEventListener('blur', onWindowBlur)
    handle.style.cursor = ''
    const wasDragging = dragging
    stopDragging()
    try {
      if (handle.hasPointerCapture(releasedId)) handle.releasePointerCapture(releasedId)
    }
    catch {
    }
    if (!wasDragging) return
    const rect = panel.getBoundingClientRect()
    options.onDragged?.({ left: rect.left, top: rect.top })
    if (expectClick) handle.addEventListener('click', swallowClick, { capture: true })
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    finishPointer(true)
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    finishPointer(false)
  }

  /** pointerup 之后的 lostpointercapture 已无活动指针，直接忽略；拖动中途失去捕获则按取消处理 */
  function onLostPointerCapture(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    finishPointer(false)
  }

  /** 拖动中窗口失焦（切换应用、在窗口外松开且未捕获）时收尾，避免按钮已松开仍跟随指针 */
  function onWindowBlur() {
    finishPointer(false)
  }

  handle.addEventListener('pointerdown', onPointerDown)
  handle.addEventListener('pointermove', onPointerMove)
  handle.addEventListener('pointerup', onPointerUp)
  handle.addEventListener('pointercancel', onPointerCancel)
  handle.addEventListener('lostpointercapture', onLostPointerCapture)
  handle.addEventListener('dragstart', onDragStart)

  return () => {
    // 解绑视为中断：复位指针与选择锁、撤销待吞 click，但不持久化（宿主正在卸载或替换把手）
    pointerId = -1
    window.removeEventListener('blur', onWindowBlur)
    handle.style.cursor = ''
    stopDragging()
    disarmSwallow()
    handle.removeEventListener('pointerdown', onPointerDown)
    handle.removeEventListener('pointermove', onPointerMove)
    handle.removeEventListener('pointerup', onPointerUp)
    handle.removeEventListener('pointercancel', onPointerCancel)
    handle.removeEventListener('lostpointercapture', onLostPointerCapture)
    handle.removeEventListener('dragstart', onDragStart)
  }
}
