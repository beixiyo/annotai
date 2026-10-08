# annotai

**English** | [简体中文](README.zh-CN.md)

> **annotai** = annot**ate** + **AI** — annotate page elements into source context your AI can use

[![npm](https://img.shields.io/npm/v/annotai)](https://www.npmjs.com/package/annotai)
[![license](https://img.shields.io/badge/license-MIT-blue)](#license)
[![node](https://img.shields.io/badge/node-%3E%3D22.12-green)](https://nodejs.org)
[![vite](https://img.shields.io/badge/vite-7%20%7C%208-purple)](https://vitejs.dev)

Show AI exactly which element you're talking about: select elements in the browser, collect precise source context with your questions, and copy AI-ready Markdown. Hold Alt+Shift and click to open the source in your editor or IDE.

![demo](https://github.com/beixiyo/annotai/releases/download/v0.3.0/demo.gif)

Open the panel → select elements → type your question → pick the next spot (finished groups are kept automatically) → copy. Hover any element for a live source preview with the element's line highlighted and syntax coloring.

## How it compares

| Capability              | annotai                                                              | [code-inspector-plugin](https://github.com/zh-lx/code-inspector) | [agentation](https://github.com/benjitaylor/agentation) |
| ----------------------- | -------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------- |
| Source locating         | sourcemap-exact to line & column                                     | exact                                                            | inaccurate, no file path                                |
| Neovim jump             | ✔ socket discovery, cwd matching, UTF-16 column conversion           | ✘                                                                | ✘                                                       |
| Other editors           | `open` hook for anything; falls back to launch-ide                   | VSCode / Cursor / WebStorm                                       | ✘                                                       |
| Plain-text DOM location | `data-annotai-path="file:line:col"`, readable in DevTools            | ✘                                                                | ✘                                                       |
| Hover source preview    | ✔ highlighted element line + syntax coloring + auto scroll into view | ✘                                                                | ✘                                                       |
| Output for AI           | Markdown with paths, line/column and snippets — paste and go         | none (human-oriented jumping)                                    | CSS selectors, AI has to grep again                     |
| Question list           | select + annotate + field toggles, kept automatically per group      | ✘                                                                | ✘                                                       |
| Frameworks              | React / Vue / Solid                                                  | React / Vue etc.                                                 | React                                                   |
| Shape                   | build-time plugin, dev only, zero residue in production              | same                                                             | React runtime component, mounted in production too      |

## Getting started

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
  // put annotai before framework plugins
  plugins: [annotate({ editor: { name: 'nvim' } }), react()],
})
```

The toolbar injects itself — no components to mount. Production builds skip injection and never start the source service.

Common options (all optional):

```ts
annotate({
  editor: { name: 'nvim' }, // or an open hook for any editor
  hoverPreview: true, // hover source preview; { width, maxLines } to size the card
  locale: 'en', // UI & Markdown export language: 'en' | 'zh'
  hotKeys: ['altKey', 'shiftKey'], // [] disables the jump hotkey
  surroundingLines: 4, // context lines around exported snippets
  context: { domPath: false }, // Markdown field toggles
  animation: true, // respects prefers-reduced-motion
  theme: {
    dimOpacity: 0.4, // panel fade while selecting on the page (1 disables it)
    vars: { '--sn-primary': '#6366f1' }, // override any --sn-* CSS variable: panel palette, selection highlight, preview, token colors
  },
})
```

Everything the toolbar paints is driven by `--sn-*` CSS variables on its shadow host — `theme.vars` overrides any of them (panel palette `--sn-panel/--sn-text/--sn-line/...`, selection highlight `--sn-highlight*/--sn-drag-*`, hover preview `--sn-preview-*`, syntax tokens `--sn-tok-*`). Once set, the toolbar stops following the system light/dark scheme.

Customize what lands on the clipboard — annotai hands you the context:

```ts
annotate({
  // runs in the browser; must be self-contained (no closures / Node APIs)
  formatCopy: ({ annotations, fields }) => annotations.map((a) => a.question).join('\n'),
})
```

Alt+Shift click opens the source in the editor or IDE you're using: running IDEs such as VS Code, Cursor and WebStorm, as well as Neovim, are detected automatically. Pin one with the `CODE_EDITOR` env var (or in `.env.local`), or take full control with the `open` hook:

```ts
annotate({
  editor: {
    open: ({ file, line, column }) => execFile('code', ['--goto', `${file}:${line}:${column}`]),
  },
})
```

Vue / Solid ship their own built-in transforms:

```ts
import { annotate } from 'annotai/vite'
import { vueTransform } from 'annotai/vue'
// Solid: import { solidTransform } from 'annotai/solid'

export default defineConfig({
  plugins: [annotate({ transforms: [vueTransform] }), vue()],
})
```

You declare the framework because `.tsx/.jsx` can't tell React from Solid compile targets.

## License

MIT
