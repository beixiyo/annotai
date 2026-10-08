/** 客户端入口：预渲染产物走 hydrate，dev 直连走 render */
import { hydrate, render } from 'solid-js/web'
import { App } from './App'
import { applyLocale, restoreLocale } from './i18n'
import { DemoStandalone } from './sections/demo'
import './styles.css'

declare global {
  /** solid 的 hydrate 读取 SSR 注入的 hydration 数据；手动预渲染时由本文件补最小契约 */
  var _$HY: { events: unknown[]; r: Record<string, unknown> } | undefined
}

const root = document.getElementById('root')!
const mount = () => <App />
const params = new URLSearchParams(location.search)

if (params.get('demo') === 'solo') {
  // 录制专用：丢弃预渲染内容，只挂载回放舞台；语言取 lang 参数且不写入存储
  const lang = params.get('lang')
  applyLocale(lang === 'en' ? 'en' : 'zh')
  root.textContent = ''
  render(() => <DemoStandalone />, root)
}
else if (root.childNodes.length > 0) {
  // renderToString 不注入 solid-start 那样的 hydration 脚本，手动补最小契约
  globalThis._$HY ??= { events: [], r: {} }
  hydrate(mount, root)
}
else {
  render(mount, root)
}

if (params.get('demo') !== 'solo') {
  // hydrate 后恢复存储的语言；首屏固定中文保证预渲染稳定
  restoreLocale()
}
