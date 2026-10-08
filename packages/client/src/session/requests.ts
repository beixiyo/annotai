/** 会话内请求代际控制与源码服务通信 */
import { SourceServiceError } from '../dom.js'
import type { NormalizedClientConfig } from '../types.js'

/** 新请求作废旧请求，卸载后所有回写失效 */
export interface RequestLifecycle {
  /** 开始一次新请求：旧请求作废，返回本次的代号与信号 */
  begin(): { generation: number; signal: AbortSignal }
  /** 让所有在途请求的回写失效并中止 fetch */
  cancel(): void
  /** 代号是否仍是当前会话的最新请求 */
  isCurrent(generation: number): boolean
}

export function createRequestLifecycle(isDisposed: () => boolean): RequestLifecycle {
  let generation = 0
  let pending: AbortController | undefined

  function cancel() {
    generation += 1
    pending?.abort()
    pending = undefined
  }

  function begin() {
    cancel()
    const controller = new AbortController()
    pending = controller
    return { generation, signal: controller.signal }
  }

  function isCurrent(current: number) {
    return !isDisposed() && current === generation
  }

  return { begin, cancel, isCurrent }
}

/** 向源码服务发请求；非 2xx、带 error 字段或非 JSON 的响应抛出结构化错误 */
export async function request<T>(config: NormalizedClientConfig, payload: Record<string, unknown>, signal: AbortSignal) {
  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.token}` },
    body: JSON.stringify(payload),
    signal,
  })
  // 代理 502 HTML、base 路径错误等非 JSON 响应统一归为 request-failed，避免把解析异常抛给面板
  const body = await response.json().catch(() => undefined) as (T & { error?: string; message?: string; id?: string }) | undefined
  if (!body) throw new SourceServiceError(response.status, 'request-failed')
  if (!response.ok || body.error) {
    throw new SourceServiceError(
      response.status,
      body.error ?? 'request-failed',
      body.message,
      body.id,
    )
  }
  return body as T
}
