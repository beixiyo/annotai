/**
 * 演示录制：把站点 `?demo=solo` 独立页的回放动画录成 README 用的 GIF / MP4
 *
 * 流程：
 * 1. Playwright 打开独立页（deviceScaleFactor 2），等字体就绪
 * 2. CDP `Page.startScreencast` 持续抓帧落盘，同时用 MutationObserver 记录 `data-demo-loop` 变化时刻
 * 3. 跳过首个不完整循环，取「循环 N 开始 → 循环 N+1 开始」区间，首尾帧相同即无缝循环
 * 4. 按帧时间戳生成 ffmpeg concat 列表（每帧 duration = 与下一帧的时间差），保证输出时长等于真实时长
 * 5. ffmpeg 裁剪舞台区域，GIF 走 palettegen/paletteuse 两段式调色板，MP4 走 H.264
 *
 * 用法：pnpm --filter annotai-site record:demo [--url http://localhost:9981] [--lang en|zh|all]
 *       [--theme light|dark] [--out <dir>] [--width 720] [--fps 12] [--colors 128] [--mp4]
 * 站点未运行时自动启动 vite dev（端口取自 --url，默认与 vite.config.ts 一致的 9981），录完自动关闭；
 * annotai 包未构建时先构建一次
 * 依赖：仓库根 @playwright/test（含 chromium）、PATH 中的 ffmpeg / ffprobe
 */
import { chromium } from '@playwright/test'
import type { Browser, CDPSession, Page } from '@playwright/test'
import { type ChildProcess, execFile, spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs, promisify } from 'node:util'

const run = promisify(execFile)

const REPO_ROOT = resolve(fileURLToPath(new URL('.', import.meta.url)), '../../..')
const SITE_ROOT = join(REPO_ROOT, 'examples/site')
/** 站点 dev 服务默认地址，与 examples/site/vite.config.ts 的 server.port 保持一致 */
const DEFAULT_URL = 'http://localhost:9981'
/** 自动启动 dev 服务的就绪等待上限 */
const SERVER_READY_TIMEOUT_MS = 60_000
const DPR = 2
/** 舞台四周保留的留白（CSS px），让圆角边框不被裁掉 */
const PAD = 12
/** 独立页外层 `p-10` 的留白（CSS px），视口按舞台尺寸加这一圈 */
const PAGE_GUTTER = 40
const LOOP_TIMEOUT_MS = 40_000
const MP4_WIDTH = 1280
const MP4_MAX_FPS = 60

async function main() {
  const opts = parseOptions(process.argv.slice(2))
  const langs: Lang[] = opts.lang === 'all' ? ['en', 'zh'] : [opts.lang]
  await assertFfmpeg()

  const server = await ensureDevServer(opts.url)
  try {
    const browser = await chromium.launch()
    try {
      for (const lang of langs) {
        await recordOne(browser, opts, lang)
      }
    }
    finally {
      await browser.close()
    }
  }
  finally {
    server.stop()
  }
}

/**
 * 确保站点可访问：已在运行则直接复用；未运行且为本机地址时自动启动 vite dev，返回的 stop 只关闭自己启动的进程
 * vite 以独立进程组启动，stop 时整组结束，避免 pnpm → vite 的子进程残留
 */
async function ensureDevServer(url: string): Promise<{ stop: () => void }> {
  if (await isReachable(url)) return { stop: () => {} }

  const { hostname, port } = new URL(url)
  if (!['localhost', '127.0.0.1', '::1'].includes(hostname) || !port) {
    throw new Error(`无法访问 ${url}，且非本机地址无法自动启动 dev 服务`)
  }

  // dev 服务依赖 annotai 的构建产物（vite 插件与客户端）；缺失时先构建
  if (!existsSync(join(REPO_ROOT, 'packages/annotai/dist/adapters/vite.js'))) {
    console.log('record-demo: annotai 尚未构建，先执行 pnpm --filter annotai... build')
    await run('pnpm', ['--filter', 'annotai...', 'build'], { cwd: REPO_ROOT, maxBuffer: 64 * 1024 * 1024 })
  }

  console.log(`record-demo: ${url} 未运行，自动启动 vite dev（端口 ${port}）`)
  const child = spawn('pnpm', ['exec', 'vite', '--port', port, '--strictPort'], {
    cwd: SITE_ROOT,
    detached: true,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  const stderr: string[] = []
  child.stderr?.on('data', (chunk: Buffer) => stderr.push(chunk.toString()))
  const stop = () => killGroup(child)

  try {
    await waitUntilReachable(url, child, stderr)
  }
  catch (err) {
    stop()
    throw err
  }
  return { stop }
}

/** 轮询直到站点可访问；子进程提前退出或超时则报错并附带 stderr 末尾 */
async function waitUntilReachable(url: string, child: ChildProcess, stderr: string[]) {
  const deadline = Date.now() + SERVER_READY_TIMEOUT_MS
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      throw new Error(`vite dev 启动失败（退出码 ${child.exitCode}）：${stderr.join('').trim().split('\n').slice(-5).join('\n')}`)
    }
    if (await isReachable(url)) return
    await new Promise((done) => setTimeout(done, 300))
  }
  throw new Error(`vite dev 在 ${SERVER_READY_TIMEOUT_MS / 1000}s 内未就绪：${url}`)
}

/** 站点是否可访问（任意 HTTP 响应即视为可访问） */
async function isReachable(url: string) {
  try {
    await fetch(url, { signal: AbortSignal.timeout(1500) })
    return true
  }
  catch {
    return false
  }
}

/** 结束自动启动的 dev 服务整个进程组；进程已退出时忽略 */
function killGroup(child: ChildProcess) {
  if (child.pid === undefined || child.exitCode !== null) return
  try {
    process.kill(-child.pid, 'SIGTERM')
  }
  catch {
    child.kill('SIGTERM')
  }
}

/** 录制并编码单个语言的演示 */
async function recordOne(browser: Browser, opts: Options, lang: Lang) {
  const workDir = await mkdtemp(join(tmpdir(), 'record-demo-'))
  const context = await browser.newContext({
    // 初始视口按独立页舞台宽度（DemoStandalone 的 w-[960px]）估算，加载后再按实际内容贴合
    viewport: { width: 960 + PAGE_GUTTER * 2, height: 600 + PAGE_GUTTER * 2 },
    deviceScaleFactor: DPR,
    colorScheme: opts.theme,
    reducedMotion: 'no-preference',
  })

  try {
    const page = await context.newPage()
    const capture = await captureLoop(page, `${opts.url.replace(/\/$/, '')}/?demo=solo&lang=${lang}`, workDir)

    const base = `demo${lang === 'zh' ? '.zh' : ''}${opts.theme === 'dark' ? '.dark' : ''}`
    const listPath = join(workDir, 'frames.txt')
    await writeFile(listPath, capture.concatList)

    const gifPath = join(opts.out, `${base}.gif`)
    await encodeGif({ listPath, crop: capture.crop, outPath: gifPath, width: opts.width, fps: opts.fps, colors: opts.colors })
    await report(gifPath, capture.frameCount)

    if (opts.mp4) {
      const mp4Path = join(opts.out, `${base}.mp4`)
      await encodeMp4({ listPath, crop: capture.crop, outPath: mp4Path, fps: capture.captureFps })
      await report(mp4Path, capture.frameCount)
    }
  }
  finally {
    await context.close()
    await rm(workDir, { recursive: true, force: true })
  }
}

/**
 * 抓取一个完整循环：返回 concat 列表、裁剪区域（图像像素）与帧统计
 * 时间轴统一用 epoch 秒：screencast 的 metadata.timestamp 与页面 timeOrigin + now() 同源于系统时钟
 */
async function captureLoop(page: Page, url: string, workDir: string): Promise<Capture> {
  const loopEvents: LoopEvent[] = []
  let onLoop: (() => void) | null = null
  await page.exposeBinding('__recordDemoLoop', (_src, loop: number, at: number) => {
    loopEvents.push({ loop, at })
    onLoop?.()
  })

  const pageErrors: string[] = []
  page.on('pageerror', err => pageErrors.push(err.message))

  await page.goto(url, { waitUntil: 'load' })
  const stage = page.locator('[data-demo-stage]').first()
  await stage.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => {
    const detail = pageErrors.length ? `\n页面错误：${pageErrors.join('\n')}` : ''
    throw new Error(`页面中未找到 [data-demo-stage]：${url}${detail}`)
  })
  await page.evaluate(() => document.fonts.ready.then(() => undefined))

  // 视口宽高都贴合页面内容（独立页宽度或舞台下方章节条变化时），避免舞台超出视口被截断
  const content = await page.evaluate(() => ({
    width: document.documentElement.scrollWidth,
    height: document.documentElement.scrollHeight,
  }))
  const vp = page.viewportSize()
  if (vp && (content.width > vp.width || content.height > vp.height)) {
    await page.setViewportSize({
      width: Math.ceil(Math.max(vp.width, content.width)),
      height: Math.ceil(Math.max(vp.height, content.height)),
    })
  }

  const rect = await stage.evaluate((el) => {
    const r = el.getBoundingClientRect()
    return { x: r.x, y: r.y, width: r.width, height: r.height }
  })

  // 抓帧：每帧立即 ack，写盘异步进行，最后统一等待
  const cdp = await page.context().newCDPSession(page)
  const frames: Frame[] = []
  const writes: Promise<void>[] = []
  cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
    void cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {})
    const path = join(workDir, `f${String(frames.length).padStart(6, '0')}.jpg`)
    frames.push({ path, at: metadata.timestamp ?? Date.now() / 1000 })
    writes.push(writeFile(path, data, 'base64'))
  })

  // 循环计数观察器：挂在 document 上而非舞台元素，舞台节点被重建时仍能读到最新计数
  await page.evaluate(() => {
    let last: string | null = null
    const check = () => {
      const value = document.querySelector('[data-demo-stage]')?.getAttribute('data-demo-loop') ?? null
      if (value === null || value === last) return
      last = value
      ;(window as unknown as RecordWindow).__recordDemoLoop(Number(value), (performance.timeOrigin + performance.now()) / 1000)
    }
    // 初始计数处于不完整循环中，只记下不回报
    last = document.querySelector('[data-demo-stage]')?.getAttribute('data-demo-loop') ?? null
    new MutationObserver(check).observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-demo-loop'],
    })
  })
  await startScreencast(cdp, page)
  let boundary: { start: number, end: number } | null = null
  try {
    boundary = await new Promise<{ start: number, end: number }>((done, fail) => {
      let timer = setTimeout(() => fail(new Error(`等待首个完整循环开始：${LOOP_TIMEOUT_MS / 1000}s 内 data-demo-loop 未变化`)), LOOP_TIMEOUT_MS)
      onLoop = () => {
        const n = loopEvents.length
        const prev = loopEvents[n - 2]
        const cur = loopEvents[n - 1]
        // 计数必须连续 +1；页面重载导致计数回退时以新值为起点重新计
        if (prev && cur.loop === prev.loop + 1) {
          clearTimeout(timer)
          return done({ start: prev.at, end: cur.at })
        }
        clearTimeout(timer)
        timer = setTimeout(() => fail(new Error(`等待循环结束：${LOOP_TIMEOUT_MS / 1000}s 内 data-demo-loop 未再变化`)), LOOP_TIMEOUT_MS)
      }
    })
  }
  finally {
    onLoop = null
    await cdp.send('Page.stopScreencast').catch(() => {})
  }
  await Promise.all(writes)

  const segment = sliceSegment(frames, boundary.start, boundary.end)

  // 以实际帧宽推算 CSS px → 图像像素比例，防止 screencast 被缩放时裁剪错位
  const scale = (await probeWidth(segment.firstPath)) / (page.viewportSize()?.width ?? 1)
  const crop = toEvenCrop({
    x: (rect.x - PAD) * scale,
    y: (rect.y - PAD) * scale,
    width: (rect.width + PAD * 2) * scale,
    height: (rect.height + PAD * 2) * scale,
  })

  return {
    concatList: segment.list,
    crop,
    frameCount: segment.count,
    captureFps: segment.fps,
  }
}

/** 启动 screencast；尺寸上限按视口 × DPR，避免被缩小 */
async function startScreencast(cdp: CDPSession, page: Page) {
  const vp = page.viewportSize()
  if (!vp) throw new Error('无法读取视口尺寸')
  await cdp.send('Page.startScreencast', {
    format: 'jpeg',
    quality: 95,
    everyNthFrame: 1,
    maxWidth: vp.width * DPR,
    maxHeight: vp.height * DPR,
  })
}

/**
 * 截取 [start, end) 区间的帧，生成 concat-demuxer 列表
 * 起点画面是 start 之前最后一帧（screencast 只在变化时出帧），末帧时长延续到 end
 */
function sliceSegment(frames: Frame[], start: number, end: number) {
  let first = 0
  for (let i = 0; i < frames.length; i++) {
    if (frames[i].at <= start) first = i
    else break
  }
  const picked = frames.slice(first).filter((f, i) => i === 0 || f.at < end)
  if (picked.length < 2) throw new Error(`循环区间内只抓到 ${picked.length} 帧，screencast 可能未工作`)

  const lines: string[] = []
  const intervals: number[] = []
  for (let i = 0; i < picked.length; i++) {
    const from = i === 0 ? start : picked[i].at
    const to = i + 1 < picked.length ? picked[i + 1].at : end
    const duration = Math.max(to - from, 0.001)
    if (i > 0 && i + 1 < picked.length) intervals.push(duration)
    lines.push(`file '${picked[i].path}'`, `duration ${duration.toFixed(6)}`)
  }
  // concat demuxer 会忽略最后一条 duration，重复末帧使其生效
  lines.push(`file '${picked[picked.length - 1].path}'`)

  // 采集帧率：取帧间隔中位数（运动段帧最密），上限 60
  intervals.sort((a, b) => a - b)
  const median = intervals[Math.floor(intervals.length / 2)] ?? 1 / 30
  const fps = Math.min(MP4_MAX_FPS, Math.max(1, Math.round(1 / median)))

  return { list: `${lines.join('\n')}\n`, count: picked.length, fps, firstPath: picked[0].path }
}

/**
 * GIF 编码：裁剪 → 定帧率 → lanczos 缩放 → 单条命令内 split 两段式调色板
 *
 * 默认参数取舍（en 一轮约 18s，同一份无损源实测）：
 * - 体积几乎全来自镜头推拉：整幅画面每帧都变，diff_mode=rectangle 与 mpdecimate 基本无效（mpdecimate 仅省 1%）
 * - 帧率：25 → 15 → 12fps 体积约 12.7 → 7.8 → 6.4MB（800px/256 色）；镜头是 1s 缓动，12fps 仍连贯
 * - 宽度：720 相比 800 省约 17%，小号说明文字仍清晰；640 时 idle 画面的小字明显变糊
 * - 颜色：平涂 UI 只需少量色阶，256 → 128 → 96 → 64 色体积约 6.4 → 4.4 → 4.0 → 3.6MB（720px/12fps），
 *   1:1 对比文字无差别；但 64 色下 AI 窗口大面积阴影与按钮光晕出现明显色带，128 色才平滑
 * - 抖动：none 最小且最锐；bayer(2/4) 大 12–25%，sierra2_4a 大约 4%，且抖动噪点让文字发虚
 * - stats_mode=diff 比 full 小约 3%，调色板偏向运动区域
 * 结论：720px / 12fps / 128 色 / 不抖动，约 4.2MB；CLI 的 --width / --fps / --colors 可覆盖
 */
async function encodeGif(params: { listPath: string; crop: Crop; outPath: string; width: number; fps: number; colors: number }) {
  const { listPath, crop, outPath, width, fps, colors } = params
  const filter = [
    `[0:v]crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b]`,
    `[a]palettegen=stats_mode=diff:max_colors=${colors}[p]`,
    '[b][p]paletteuse=dither=none:diff_mode=rectangle',
  ].join(';')
  await ffmpeg(['-f', 'concat', '-safe', '0', '-i', listPath, '-filter_complex', filter, '-loop', '0', outPath])
}

/** MP4 编码：H.264 yuv420p，宽 1280（偶数尺寸），faststart 便于网页内播放 */
async function encodeMp4(params: { listPath: string; crop: Crop; outPath: string; fps: number }) {
  const { listPath, crop, outPath, fps } = params
  const filter = `crop=${crop.width}:${crop.height}:${crop.x}:${crop.y},fps=${fps},scale=${MP4_WIDTH}:-2:flags=lanczos,format=yuv420p`
  await ffmpeg([
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    listPath,
    '-vf',
    filter,
    '-c:v',
    'libx264',
    '-preset',
    'slow',
    '-crf',
    '20',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    '-an',
    outPath,
  ])
}

/** 运行 ffmpeg，失败时附带 stderr 末尾便于排查 */
async function ffmpeg(args: string[]) {
  try {
    await run('ffmpeg', ['-y', '-hide_banner', '-loglevel', 'error', ...args], { maxBuffer: 64 * 1024 * 1024 })
  }
  catch (err) {
    const stderr = (err as { stderr?: string }).stderr ?? ''
    throw new Error(`ffmpeg 失败：${stderr.trim().split('\n').slice(-5).join('\n') || String(err)}`)
  }
}

/** 打印输出摘要：路径、时长、帧数、体积 */
async function report(path: string, sourceFrames: number) {
  const { stdout } = await run('ffprobe', [
    '-v',
    'error',
    '-count_frames',
    '-select_streams',
    'v:0',
    '-show_entries',
    'format=duration:stream=nb_read_frames,width,height',
    '-of',
    'json',
    path,
  ])
  const info = JSON.parse(stdout) as {
    format: { duration?: string }
    streams: { nb_read_frames?: string; width?: number; height?: number }[]
  }
  const s = info.streams[0] ?? {}
  const { size } = await stat(path)
  console.log([
    path,
    `${Number(info.format.duration ?? 0).toFixed(2)}s`,
    `${s.width}x${s.height}`,
    `${s.nb_read_frames} frames (captured ${sourceFrames})`,
    `${(size / 1024 / 1024).toFixed(2)} MB`,
  ].join('  '))
}

/** 读取图像宽度（px） */
async function probeWidth(path: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=width', '-of', 'csv=p=0', path])
  const width = Number(stdout.trim())
  if (!width) throw new Error(`无法读取帧尺寸：${path}`)
  return width
}

/** 检查 ffmpeg / ffprobe 是否可用 */
async function assertFfmpeg() {
  for (const bin of ['ffmpeg', 'ffprobe']) {
    await run(bin, ['-version']).catch(() => {
      throw new Error(`未找到 ${bin}，请先安装（例如 brew install ffmpeg）`)
    })
  }
}

/** 裁剪区域取整到偶数像素，兼容 yuv420p */
function toEvenCrop(c: Crop): Crop {
  const even = (n: number) => Math.max(0, Math.round(n / 2) * 2)
  return { x: even(c.x), y: even(c.y), width: even(c.width), height: even(c.height) }
}

/** 解析命令行参数（--key value / --flag） */
/** 命令行选项定义；默认值即公共契约（--out 默认 <repo>/docs，在归一化时补上） */
const CLI_OPTIONS = {
  url: { type: 'string', default: DEFAULT_URL },
  lang: { type: 'string', default: 'all' },
  theme: { type: 'string', default: 'light' },
  out: { type: 'string' },
  width: { type: 'string', default: '720' },
  fps: { type: 'string', default: '12' },
  colors: { type: 'string', default: '128' },
  mp4: { type: 'boolean', default: false },
} as const

/** 解析并校验命令行（strict：未知选项、缺值由 node:util parseArgs 直接报错） */
function parseOptions(argv: string[]): Options {
  const { values } = parseArgs({ args: argv, options: CLI_OPTIONS, strict: true })
  const pick = <T extends string>(name: string, value: string, allowed: readonly T[]): T => {
    if (!allowed.includes(value as T)) throw new Error(`--${name} 只能是 ${allowed.join(' | ')}，收到 ${value}`)
    return value as T
  }
  const int = (name: string, raw: string, min = 1, max = Number.POSITIVE_INFINITY) => {
    const value = Number(raw)
    if (!Number.isInteger(value) || value < min || value > max) {
      const range = Number.isFinite(max) ? `${min}–${max}` : `≥ ${min}`
      throw new Error(`--${name} 需要 ${range} 的整数，收到 ${raw}`)
    }
    return value
  }

  return {
    url: values.url,
    lang: pick('lang', values.lang, ['en', 'zh', 'all'] as const),
    theme: pick('theme', values.theme, ['light', 'dark'] as const),
    out: resolve(values.out ?? join(REPO_ROOT, 'docs')),
    width: int('width', values.width),
    fps: int('fps', values.fps),
    colors: int('colors', values.colors, 2, 256),
    mp4: values.mp4,
  }
}

type Lang = 'en' | 'zh'

interface Options {
  /** 站点地址；本机地址未运行时自动启动 vite dev @default 'http://localhost:9981' */
  url: string
  /** @default 'all' */
  lang: Lang | 'all'
  /** @default 'light' */
  theme: 'light' | 'dark'
  /** 输出目录 @default '<repo>/docs' */
  out: string
  /** GIF 宽度 @default 720 */
  width: number
  /** GIF 帧率：镜头推拉每帧都是整幅重绘，体积随帧率线性增长；12fps 下 1s 缓动仍连贯 @default 12 */
  fps: number
  /** GIF 调色板颜色数（2–256） @default 128 */
  colors: number
  /** 同时输出 MP4 @default false */
  mp4: boolean
}

interface Frame {
  path: string
  /** 帧时间（epoch 秒） */
  at: number
}

interface LoopEvent {
  loop: number
  /** 变化时刻（epoch 秒） */
  at: number
}

interface Crop {
  x: number
  y: number
  width: number
  height: number
}

interface Capture {
  concatList: string
  crop: Crop
  frameCount: number
  captureFps: number
}

interface RecordWindow {
  __recordDemoLoop: (loop: number, at: number) => void
}

// 入口放在文件末尾：模块级常量（CLI_OPTIONS 等）初始化后才执行，避免 TDZ
main().catch((err: unknown) => {
  console.error(`record-demo: ${err instanceof Error ? err.message : String(err)}`)
  process.exitCode = 1
})
