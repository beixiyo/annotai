/** 官站双语字典与语言切换；SSR/首屏固定中文保证预渲染稳定，切换仅客户端生效 */
import { createSignal } from 'solid-js'

export type SiteLocale = 'zh' | 'en'

const STORAGE_KEY = 'annotai:site-locale'

const zh = {
  navFeatures: '特性',
  navQuickstart: '快速开始',
  navFaq: 'FAQ',
  navAria: '页面导航',
  langAria: '切换语言',

  heroTitleL1: '让 AI 看见你',
  heroTitleL2: '在说哪个元素',
  heroDesc: '在浏览器里框选元素，复制带 file:line:col 的 Markdown 交给 AI，或按住 Alt+Shift 点击跳转到编辑器中的源码',
  heroCta: '快速开始',
  copyInstall: '复制安装命令',
  pmAria: '选择包管理器',
  copyInstallDone: '安装命令已复制',

  fTitle: '为什么用 annotai',
  fSubtitle: '把「那个蓝色的按钮」翻译成 AI 和编辑器都能精确定位的源码坐标',
  f1Title: '框选标注',
  f1Desc: '拖拽即选，自动解析到组件源码位置，不用手写选择器',
  f2Title: '明文位置',
  f2Desc: '每个元素带 data-annotai-path，DevTools 里直接可读',
  f3Title: '复制 Markdown',
  f3Desc: '把标注整理成结构化问题清单，粘贴给任何 AI 工具即可',
  f4Title: '编辑器跳转',
  f4Desc: 'Alt+Shift 点击直达编辑器中的源码行列',

  qsTitle: '快速开始',
  qsSubtitle: '三步接入，dev 服务即开即用',
  qs1Title: '安装',
  qs2Title: '接入 Vite',
  qs3Title: '框选、复制、跳转',
  qs3Code: `# 页面右下角打开面板 → 框选元素 → 备注问题
# 复制 Markdown 交给 AI，或 Alt+Shift 点击跳转到编辑器`,
  qsCopy: '复制命令',

  faqTitle: '常见问题',
  faqPlaceholder: '搜索问题，如 HMR、框架',
  faqAria: '搜索常见问题',
  faq1Q: '支持哪些前端框架？',
  faq1A: 'React、Vue 3、Solid',
  faq2Q: '生产构建会注入标注属性吗？',
  faq2A: '不会。属性注入与源码服务仅在 dev / preview 启用，build 产物零残留',
  faq3Q: 'HMR 之后旧标注还能用吗？',
  faq3A: '文件变动后，旧标注会提示重新框选，不会指向错误的源码',

  demoStageAria: '标注流程演示：选中页面上的「加入购物车」按钮，写下“改为红色”，复制给 AI 后按钮变红',
  demoNavShop: '商店',
  demoNavJournal: '专栏',
  demoCategory: '音频 · 头戴式',
  demoProduct: 'Aero 降噪耳机',
  demoRating: '4.9 · 2.3k 评价',
  demoPrice: '¥ 2,399',
  demoDesc: '40 小时续航，自适应降噪，轻至 250g',
  demoCart: '加入购物车',
  demoQuestion: '改为红色',
  demoStop: '结束选择',
  demoCopy: '复制问题',
  demoEmptySelecting: '点击或框选页面区域',
  demoEmptyHint: '写好问题再选下一处，已写好的会自动保留；最后一起复制给 AI',
  demoSelected: '当前选择（1 个元素）',
  demoLineCol: '第 23 行 · 第 9 列',
  demoPlaceholder: '描述你想让 AI 修改的内容',
  demoCopiedToast: '问题已复制',
  demoAgentTitle: 'AI 助手',
  demoMdTitle: '# 源码标注',
  demoMdAnnotation: '## 标注 1',
  demoMdQuestion: '问题：',
  demoMdLocation: '位置：',
  demoAgentEdited: '已修改',
  demoChSelect: '选中元素',
  demoChSelectDesc: '点一下，拿到 file:line:col',
  demoChAnnotate: '写下问题',
  demoChAnnotateDesc: '用一句话说清想改成什么',
  demoChHandoff: '交给 AI',
  demoChHandoffDesc: '粘贴 Markdown，AI 直接改对那一行',
} as const

export type SiteMessageKey = keyof typeof zh

const en: Record<SiteMessageKey, string> = {
  navFeatures: 'Features',
  navQuickstart: 'Quick Start',
  navFaq: 'FAQ',
  navAria: 'Page navigation',
  langAria: 'Language',

  heroTitleL1: 'Let AI see exactly',
  heroTitleL2: 'which element you mean',
  heroDesc: 'Select elements in the browser, copy Markdown with file:line:col to your AI, or Alt+Shift click to jump to the source in your editor.',
  heroCta: 'Quick Start',
  copyInstall: 'Copy install command',
  pmAria: 'Package manager',
  copyInstallDone: 'Install command copied',

  fTitle: 'Why annotai',
  fSubtitle: 'Turn "that blue button over there" into source coordinates both AI and editors resolve precisely',
  f1Title: 'Select & annotate',
  f1Desc: 'Drag to select; resolved to component source locations, no hand-written selectors.',
  f2Title: 'Plain-text location',
  f2Desc: 'Every element carries data-annotai-path, readable right in DevTools.',
  f3Title: 'Copy as Markdown',
  f3Desc: 'Turns annotations into a structured question list — paste into any AI tool.',
  f4Title: 'Editor jump',
  f4Desc: 'Alt+Shift click jumps to the exact line and column in your editor.',

  qsTitle: 'Quick Start',
  qsSubtitle: 'Three steps; works as soon as the dev server starts.',
  qs1Title: 'Install',
  qs2Title: 'Add to Vite',
  qs3Title: 'Select, copy, jump',
  qs3Code: `# Open the panel at bottom-right → select elements → note questions
# Copy Markdown to your AI, or Alt+Shift click to jump to your editor`,
  qsCopy: 'Copy command',

  faqTitle: 'FAQ',
  faqPlaceholder: 'Search questions, e.g. HMR, framework',
  faqAria: 'Search frequently asked questions',
  faq1Q: 'Which frameworks are supported?',
  faq1A: 'React, Vue 3 and Solid.',
  faq2Q: 'Do production builds get annotation attributes?',
  faq2A: 'No. Attribute injection and the source service only run in dev/preview; build output has zero residue.',
  faq3Q: 'Do old annotations survive HMR?',
  faq3A: 'After a file changes, old annotations prompt re-selection instead of pointing at the wrong source.',

  demoStageAria: 'Annotation demo: select the "Add to cart" button on a page, write "Make it red", copy it to AI, and the button turns red',
  demoNavShop: 'Shop',
  demoNavJournal: 'Journal',
  demoCategory: 'Audio · Over-ear',
  demoProduct: 'Aero Headphones',
  demoRating: '4.9 · 2.3k reviews',
  demoPrice: '$349',
  demoDesc: '40-hour battery, adaptive noise canceling, just 250 g.',
  demoCart: 'Add to cart',
  demoQuestion: 'Make it red',
  demoStop: 'Stop selecting',
  demoCopy: 'Copy questions',
  demoEmptySelecting: 'Click or drag to select a region',
  demoEmptyHint: 'Type a question, pick the next spot — finished ones are kept. Copy them all to AI.',
  demoSelected: 'Selection (1)',
  demoLineCol: 'Line 23 · Col 9',
  demoPlaceholder: 'Describe what you want AI to change',
  demoCopiedToast: 'Questions copied',
  demoAgentTitle: 'AI assistant',
  demoMdTitle: '# Source Notes',
  demoMdAnnotation: '## Annotation 1',
  demoMdQuestion: 'Question: ',
  demoMdLocation: 'Location: ',
  demoAgentEdited: 'Edited',
  demoChSelect: 'Select',
  demoChSelectDesc: 'Click an element, get its file:line:col',
  demoChAnnotate: 'Annotate',
  demoChAnnotateDesc: 'Say what should change, in plain words',
  demoChHandoff: 'Hand to AI',
  demoChHandoffDesc: 'Paste the Markdown, AI fixes that exact line',
}

const dictionaries: Record<SiteLocale, Record<SiteMessageKey, string>> = { zh, en }

/** 首屏固定中文（预渲染与 E2E 稳定）；客户端挂载后恢复上次选择 */
const [locale, setLocale] = createSignal<SiteLocale>('zh')

export { locale }

export function t(key: SiteMessageKey): string {
  return dictionaries[locale()][key]
}

/** 读取本地存储；隐私模式或禁用存储时 localStorage 访问会抛错，按无存储处理 */
function readStoredLocale(): SiteLocale | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'zh' || saved === 'en' ? saved : null
  }
  catch {
    return null
  }
}

/** 切换当前语言并同步 <html lang>，不写入存储 */
export function applyLocale(next: SiteLocale) {
  setLocale(next)
  document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en'
}

/** 客户端恢复语言：优先本地存储，无存储时按浏览器语言判定 */
export function restoreLocale() {
  const fromNavigator: SiteLocale = navigator.language.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  applyLocale(readStoredLocale() ?? fromNavigator)
}

/** 用户主动切换语言：生效并记住选择 */
export function switchLocale(next: SiteLocale) {
  applyLocale(next)
  try {
    localStorage.setItem(STORAGE_KEY, next)
  }
  catch {
    // 存储不可用时本次会话仍生效，只是不记忆
  }
}
