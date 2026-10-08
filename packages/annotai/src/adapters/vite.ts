/** Vite 宿主适配：开发转换、真实路径边界与模块索引生命周期 */
import type { ClientConfig, ContextOptions, CopyFormatter, HotKey, HoverPreviewOptions, Locale, PanelTheme, SourceTransform } from '@annotai/protocol'
import { readFile, realpath } from 'node:fs/promises'
import path from 'node:path'
import type { Plugin } from 'vite'
import { searchForWorkspaceRoot } from 'vite'
import { isWithin } from '../core/paths.js'
import { createSourceIndex } from '../core/source-index.js'
import type { SourceIndex } from '../core/source-index.js'
import type { EditorConfig } from '../editors/index.js'
import { createSourceService } from '../server/index.js'
import { reactTransform } from '../transforms/react.js'

const CLIENT_ID = '\0annotai:client'

/** 发布形态：客户端 bundle 随包分发在同目录；workspace 开发态回退解析内部包 */
async function readClientBundle() {
  try {
    return await readFile(new URL('./client.browser.js', import.meta.url), 'utf8')
  }
  catch {
    return readFile(new URL(import.meta.resolve('@annotai/client')), 'utf8')
  }
}
const BOOTSTRAP_ID = '\0annotai:bootstrap'
const ENDPOINT = '__annotai'

/** 创建开发期 Vite 插件；生产 build 不注册转换 */
export function annotate(options: AnnotaiOptions = {}): AnnotaiPlugin {
  const transforms = options.transforms ?? [reactTransform]
  const api = createSourceIndex()

  // configResolved 后才可用的路径与服务状态
  let base = '/'
  let projectRoot = ''
  let roots: string[] = []
  let service: ReturnType<typeof createSourceService> | undefined
  let cleanup: (() => void) | undefined

  // 模块 id 与真实路径的映射；变更时按两种 id 一并失效
  const canonicalFiles = new Map<string, string>()
  const snapshots = new Map<string, string>()

  return {
    name: 'annotai',
    enforce: 'pre',
    apply: 'serve',
    api,

    async configResolved(config) {
      base = config.base

      const root = options.projectRoot
        ? path.resolve(config.root, options.projectRoot)
        : searchForWorkspaceRoot(config.root)
      projectRoot = await realpath(root)

      const allowed = options.allowedRoots ?? [config.root]
      roots = await Promise.all(allowed.map((entry) => realpath(path.resolve(config.root, entry))))
    },

    resolveId(id) {
      if (id === CLIENT_ID || id === BOOTSTRAP_ID) return id
    },

    async load(id) {
      if (id === CLIENT_ID) return readClientBundle()
      if (id !== BOOTSTRAP_ID || !service) return null
      return bootstrapModule(clientConfig(service.token, options, base), options.formatCopy)
    },

    transformIndexHtml() {
      if (options.client === false) return []
      return [{
        tag: 'script',
        // \0 在 URL 中按 vite 约定编码为 __x00__，派生自 BOOTSTRAP_ID 避免双份字面量
        attrs: { type: 'module', src: `${base}@id/__x00__${BOOTSTRAP_ID.slice(1)}` },
        injectTo: 'body',
      }]
    },

    async transform(code, id, context) {
      // 本期只接受文件模块。资源查询与虚拟模块不应被当作 React 源码
      if (id.includes('\0') || id.includes('?') || id.split(/[\\/]/).includes('node_modules')) return null

      const adapter = transforms.find((transform) => transform.supports(id))
      if (!adapter) return null

      let file: string
      try {
        file = await realpath(id)
      }
      catch {
        return null
      }
      if (!roots.some((root) => isWithin(root, file))) return null

      canonicalFiles.set(id, file)
      // 解析失败时也不能继续暴露旧位置
      api.invalidate(file)

      const result = adapter.transform({ code, file, environment: context?.ssr ? 'server' : 'client' })
      api.replace(file, result.sources)
      snapshots.set(file, code)

      return { code: result.code, map: result.map }
    },

    configureServer(server) {
      service = createSourceService({
        index: api,
        roots,
        projectRoot,
        readSource: (file) => snapshots.get(file),
        editor: options.editor,
        surroundingLines: options.surroundingLines,
      })

      server.middlewares.use((req, res, next) => {
        // Vite 的 base middleware 可能先移除前缀，因此同时接受规范化后的路径
        const pathname = req.url?.split('?')[0]
        if (pathname !== `/${ENDPOINT}` && pathname !== `${base}${ENDPOINT}`) return next()
        service!.middleware(req, res, next)
      })

      const invalidate = (file: string) => {
        api.invalidate(file)
        snapshots.delete(file)

        const canonical = canonicalFiles.get(file)
        if (canonical) {
          api.invalidate(canonical)
          snapshots.delete(canonical)
        }
      }
      server.watcher.on('change', invalidate)
      server.watcher.on('unlink', invalidate)

      const close = () => {
        server.watcher.off('change', invalidate)
        server.watcher.off('unlink', invalidate)
        api.clear()
        canonicalFiles.clear()
        snapshots.clear()
        service?.close()
      }
      server.httpServer?.once('close', close)
      // middlewareMode 没有独立 HTTP server，通过 closeBundle 统一释放索引
      cleanup = close
    },

    closeBundle() {
      cleanup?.()
    },
  }
}

/** 可选字段原样透传，默认值由浏览器客户端统一归一化 */
function clientConfig(token: string, options: AnnotaiOptions, base: string): ClientConfig {
  return {
    endpoint: `${base}${ENDPOINT}`,
    token,
    context: options.context,
    hotKeys: options.hotKeys,
    animation: options.animation,
    hoverPreview: options.hoverPreview,
    locale: options.locale,
    theme: options.theme,
  }
}

/** 浏览器引导模块：挂载工具并在 HMR 销毁时卸载 */
function bootstrapModule(config: ClientConfig, formatCopy?: CopyFormatter) {
  // 函数无法过 JSON：以源码内联进浏览器模块，用户函数须自包含
  const formatter = formatCopy ? `, formatCopy: ${formatCopy.toString()}` : ''
  const source = JSON.stringify(config).replace(/}$/, formatter + '}')
  return [
    `import { mountAnnotai } from ${JSON.stringify(CLIENT_ID)}`,
    `export const dispose = mountAnnotai(${source})`,
    'if (import.meta.hot) import.meta.hot.dispose(dispose)',
  ].join('\n')
}

/** Vite 的 Plugin.api 是 any，显式收窄以便其他插件或测试读取索引 */
export type AnnotaiPlugin = Omit<Plugin, 'api'> & { api: SourceIndex }

/** Vite 接入配置；具体转换协议不依赖 Vite */
export interface AnnotaiOptions {
  /** Markdown 相对路径基准；不扩大允许读取的目录。 @default Vite 检测的 workspace root */
  projectRoot?: string
  /** 是否注入浏览器标注工具。 @default true */
  client?: boolean
  /** 是否启用浏览器交互动画；系统减少动态效果偏好优先。 @default true */
  animation?: boolean
  /** 界面与 Markdown 导出的语言。 @default 'zh' */
  locale?: Locale
  /** 自定义剪贴板内容：接收全部标注与字段开关，返回原样复制的字符串。函数以源码内联进浏览器，须自包含（不引用闭包或 Node API） */
  formatCopy?: CopyFormatter
  /** 悬停元素时在其右侧显示源码预览；按住热键或打开面板时悬停触发。传对象可同时配置预览卡尺寸。 @default true */
  hoverPreview?: boolean | HoverPreviewOptions
  /** 面板视觉覆盖：淡出透明度（theme.dimOpacity）与任意 --sn-* CSS 变量（theme.vars）；纯数据，随配置内联进浏览器。 @default 内置主题 */
  theme?: PanelTheme
  /** 浏览器上下文字段覆盖。 @default 位置、片段、类名、文本开启，DOM 路径关闭 */
  context?: Partial<ContextOptions>
  /** 打开编辑器的组合键；空数组会关闭快捷键。 @default ['altKey', 'shiftKey'] */
  hotKeys?: HotKey[]
  /** 编辑器适配设置。 @default Neovim 自动匹配 */
  editor?: EditorConfig
  /** 源码片段前后附加行数。 @default 4 */
  surroundingLines?: number
  /** 语法适配器，按顺序选择第一个支持当前文件的适配器。 @default [reactTransform] */
  transforms?: SourceTransform[]
  /** 可处理源码的目录；相对路径基于 Vite root。符号链接按真实路径校验。 @default [vite.root] */
  allowedRoots?: string[]
}
