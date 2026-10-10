# annotai

[English](README.md) | **简体中文**

> **annotai** = annot**ate** + **AI** —— 把页面元素标注成 AI 可用的源码上下文

[![npm](https://img.shields.io/npm/v/annotai)](https://www.npmjs.com/package/annotai)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)
[![node](https://img.shields.io/badge/node-%3E%3D22.12-green)](https://nodejs.org)
[![vite](https://img.shields.io/badge/vite-7%20%7C%208-purple)](https://vitejs.dev)

让 AI 看见你在说哪个元素：在浏览器里框选页面元素，收集精确源码上下文与问题，复制 Markdown 直接交给 AI；按住 Alt+Shift 点击可在编辑器或 IDE 中打开源码

![demo](https://github.com/beixiyo/annotai/releases/download/v0.3.0/demo.zh.gif)

打开面板 → 框选元素 → 输入问题 → 继续选下一处（已写好的自动保留）→ 复制。悬停即可预览源码（元素行高亮、Prism 语法着色）

## 与同类工具对比

| 能力           | annotai                                             | [code-inspector-plugin](https://github.com/zh-lx/code-inspector) | [agentation](https://github.com/benjitaylor/agentation) |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| 源码定位       | sourcemap 精确到行列                                | 精确                                                             | 不准确，无文件路径                                      |
| Neovim 跳转    | ✔ socket 发现、cwd 匹配、UTF-16 列换算              | ✘                                                                | ✘                                                       |
| 其他编辑器     | `open` 钩子任意接入，无实例时回退 launch-ide        | VSCode / Cursor / WebStorm                                       | ✘                                                       |
| DOM 明文位置   | `data-annotai-path`（定义处）+ `data-annotai-use-path`（使用处），同一元素上 DevTools 直接可读 | `data-insp-path`，调用点覆盖定义处                               | ✘                                                       |
| 悬停源码预览   | ✔ 元素行高亮 + 语法着色 + 自动滚入可视区            | ✘                                                                | ✘                                                       |
| 交给 AI 的产物 | 带路径行列与源码片段的 Markdown，粘贴即用           | 无（面向人工跳转）                                               | CSS 选择器，AI 需二次 grep                              |
| 问题清单       | 框选 + 备注 + 字段开关，按组保存                    | ✘                                                                | ✘                                                       |
| 框架           | React / Vue / Solid                                 | React / Vue 等                                                   | React                                                   |
| 形态           | 构建期插件，仅 dev，产物零残留                      | 同                                                               | React 运行时组件，生产环境也挂载                        |

## 接入

```sh
npm install -D annotai
yarn add -D annotai
pnpm add -D annotai
bun add -d annotai
```

```ts
import react from '@vitejs/plugin-react'
import { annotate } from 'annotai/vite'
import { defineConfig } from 'vite'

export default defineConfig({
  // annotai 放在框架插件之前
  plugins: [annotate({ editor: { name: 'nvim' } }), react()],
})
```

工具栏自动注入，应用无需挂载组件；生产构建不注入、不启动源码服务

常用配置（全部可省略）：

```ts
annotate({
  editor: { name: 'nvim' },          // 或 open 钩子接任意编辑器
  hoverPreview: true,                // 悬停源码预览；{ width, maxLines } 定制卡片
  locale: 'zh',                      // 界面与导出语言，默认 'en'
  hotKeys: ['altKey', 'shiftKey'],   // [] 关闭跳转快捷键
  surroundingLines: 4,               // 导出片段的上下文行数
  context: { domPath: false },       // Markdown 字段开关
  animation: true,                   // 系统减少动态效果偏好优先
  theme: {
    dimOpacity: 0.4,                 // 选择模式下指针在页面上时面板的透明度（1 关闭淡出）
    vars: { '--sn-primary': '#6366f1' }, // 覆盖任意 --sn-* CSS 变量：面板色板、选择高亮、预览、语法 token 色
  },
})
```

工具的全部视觉都由 shadow host 上的 `--sn-*` CSS 变量驱动，`theme.vars` 可逐项覆盖（面板色板 `--sn-panel/--sn-text/--sn-line/…`、选择高亮 `--sn-highlight*/--sn-drag-*`、悬停预览 `--sn-preview-*`、语法 token `--sn-tok-*`）。设置后工具不再跟随系统深浅色切换

自定义剪贴板内容 —— annotai 把上下文交给你：

```ts
annotate({
  // 在浏览器执行；须自包含（不引用闭包或 Node API）
  formatCopy: ({ annotations, fields }) => annotations.map((a) => a.question).join('\n'),
})
```

Alt+Shift 点击会在你正在使用的编辑器或 IDE 中打开源码：自动识别正在运行的 VS Code、Cursor、WebStorm 等 IDE 和 Neovim；也可以用 `CODE_EDITOR` 环境变量（或写在 `.env.local`）指定，或用 `open` 钩子完全自定义：

```ts
annotate({
  editor: {
    open: ({ file, line, column }) => execFile('code', ['--goto', `${file}:${line}:${column}`]),
  },
})
```

### Vue / Solid 项目

默认按 React JSX 转换。Vue / Solid 项目换成内置的对应转换器即可（无需自己写）：

```ts
import { annotate } from 'annotai/vite'
import { vueTransform } from 'annotai/vue'
// Solid: import { solidTransform } from 'annotai/solid'

export default defineConfig({
  plugins: [annotate({ transforms: [vueTransform] }), vue()],
})
```

需要显式声明是因为 `.tsx/.jsx` 无法区分 React 还是 Solid 编译目标，只能由你说了算

## License

MIT
