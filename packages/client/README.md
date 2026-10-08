# @annotai/client

独立浏览器标注工具（workspace 内部包，不单独发布，构建时并入 annotai 主包产物）：选择元素、拖框、编辑多条问题并复制 Markdown，通过宿主提供的源码服务解析位置和打开编辑器

## 文件职责

- `src/index.ts`：挂载装配（host/Shadow DOM、模块组装、监听器注册）与幂等卸载
- `src/session/`：会话模块组——`context`（共享上下文契约）、`interactions`（指针/键盘事件）、`actions`（面板动作与业务流程）、`render-loop`（渲染协调与焦点恢复）、`highlight-sync`（高亮协调）、`hover-preview`（悬停源码预览：Prism 高亮、元素行定位与自动滚动）、`requests`（请求代际）、`clipboard`（剪贴板降级）
- `src/defaults.ts`：配置默认值与归一化，是可选字段唯一的补全边界
- `src/dom.ts`：DOM 查询、选区与父子层级、元素上下文、源码服务错误类型
- `src/highlights.ts`：持久高亮框、目标切换、滚动/拖框即时同步
- `src/animation.ts`：WAAPI 动画（fill: none）、中断及减少动态效果偏好；Motion 只提供弹簧 linear() 曲线
- `src/panel.ts`：Lit 模板与原生控件，Tailwind 类直接表达布局、外观和交互状态；`annotai-*` 类名只作 JS/测试定位钩子
- `src/session/highlight.ts`：Prism 语法高亮，按扩展名推断语法，跨行 token 按行保留着色
- `src/panel-types.ts`：面板状态和回调契约
- `src/styles.css`：主题 token、Shadow DOM 基础重置、高亮层与预览 token 配色
- `src/styles.ts`：导出 Vite 内联 CSS，供 Shadow DOM 注入
- `src/markdown.ts`：Markdown 生成与目标去重
- `vite.config.ts`：Vite 库模式，自包含 ESM；声明文件由 tsc 输出
- `tests/client.test.ts`：真实 Chromium 中的 DOM 交互与生命周期
- `tests/animation.test.ts`：真实 Chromium 中暂停并推进 WAAPI，验证面板双向过渡、高亮接续、减少动态效果与卸载清理
- `tests/markdown.test.ts`：Node 环境下的 Markdown 公共行为

## 挂载与卸载

```ts
import { mountAnnotai } from '@annotai/client'
import type { ClientConfig } from '@annotai/protocol'

const config: ClientConfig = {
  endpoint: '/__annotai',
  token: '由源码服务生成的会话 token',
  // 以下均可省略：animation 默认 true，hotKeys 默认 ['altKey', 'shiftKey']，hoverPreview 默认开启，context 默认开启位置/片段/类名/文本
  animation: true,
  hotKeys: ['altKey', 'shiftKey'],
  hoverPreview: { width: 560, maxLines: 20 },
  context: { domPath: true },
}

const dispose = mountAnnotai(config)
// 页面或宿主生命周期结束时调用；可以重复调用
dispose()
```

同一页面由宿主挂载一个实例。包本身不启动源码服务，不读取文件系统，不要求 React 运行时。`dist/browser.js` 是仅供浏览器加载的自包含 ESM（lit/motion/prismjs 均已打包），Vite 宿主以文本形式注入；不提供 Node 导入

## 行为细节

### 悬停源码预览

- 按住热键立即显示；面板打开时悬停停留约 300ms 显示
- 预览卡显示元素自身位置（路径:行:列）并高亮元素行；片段自动换行，超出卡片高度时自动滚入可视区
- 请求按显示行数向服务端取片段，与 Markdown 导出的精简上下文互不影响
- 可编辑控件全部豁免，不触发预览请求

### 动画

- 只作用于工具自己的面板和选中高亮：原生 WAAPI 且 `fill: none`，结束或取消后不留下内联样式
- 默认启用，`animation: false` 显式禁用；系统 `prefers-reduced-motion` 优先，并响应运行时变更
- 按钮与面板约 300ms 无回弹弹簧尺寸过渡，文字保持原尺寸；快速反向切换从当前矩形接续
- 窗口变化、减少动态效果和卸载会立即取消过渡

### 界面与样式

- Lit 独立模板 API（`lit/html.js`），原生 button、textarea、checkbox、details 表达交互
- Lit 复用输入节点：`live` 同步可编辑值，`repeat` 按标注 id 保留多条问题身份；不注册全局自定义元素
- Tailwind 4 + `@tailwindcss/vite` 编译，`?inline` 随 ESM 注入 Shadow DOM；不加载 CDN、不向业务页面注入 preflight

### 错误处理

- 源码服务错误以 `SourceServiceError`（`status` + `code`）抛出
- `stale-source` / `source-not-found` 在面板统一提示重新选择元素

### 交互约定

- 无已保存问题和选区时，点击「源码标注」直接进入选择模式；已有问题时重新打开不自动选择
- Escape 只收起面板并保留选择，在途请求继续完成；「关闭」按钮才重置选择
- 顶部吸附工具栏「复制问题」统一复制已保存问题及 Markdown 上下文

### 启动按钮

- Logo 图标（可访问名「源码标注」），支持拖拽停靠：位移超过阈值才算拖动，普通点击不受影响，拖动结束的那次 click 会被吞掉
- 位置写入 localStorage（键 `annotai:launcher-position`），下次挂载恢复，窗口缩放时自动钔回视口内

## 测试

在仓库根运行 `pnpm test`、`pnpm typecheck` 和 `pnpm build` 会按依赖顺序构建。只运行本包测试时：

```sh
pnpm --filter @annotai/client exec playwright install chromium  # 首次
pnpm --filter @annotai/client test
```

- `vitest.config.ts` 注册 `emulateMedia` 浏览器命令，动画测试用它切换减少动态效果偏好
- 真实 Vite 插件与 Neovim 的端到端验收见仓库根 `pnpm test:e2e`
