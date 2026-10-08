/** SSR 入口：预渲染脚本调用，输出整页 HTML 字符串 */
import { renderToString } from 'solid-js/web'
import { App } from './App'

export function render(): string {
  return renderToString(() => <App />)
}
