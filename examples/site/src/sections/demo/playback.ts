/**
 * 回放调度：按时间线逐步推进步骤，支持从任意步骤起播与随时停止
 * 只管理时间与代际，画面由调用方按 step 派生；停止后过期的循环不会再写回状态
 */
import { createSignal, untrack } from 'solid-js'
import { type Step, STEPS, type TimelineEntry } from './script'

export interface PlaybackOptions {
  /** 每轮开始时读取的时间线（问题文案随语言变化，时长需按轮重算） */
  timeline: () => TimelineEntry[]
  /** 打字步骤的总字数，用于逐字推进 typedCount */
  questionLength: () => number
  /** 每字耗时（ms） */
  perChar: number
}

export interface Playback {
  step: () => Step
  /** 已打出的字数 */
  typedCount: () => number
  /** 播放轮次：每轮开始或跳转时 +1 */
  runKey: () => number
  playing: () => boolean
  /** 从指定步骤开始循环播放；正在播放时先停止 */
  play: (from?: Step) => void
  /** 停止，回到 idle */
  stop: () => void
}

/** 创建回放调度器；调用方负责在组件卸载时调用 stop */
export function createPlayback(options: PlaybackOptions): Playback {
  const [step, setStep] = createSignal<Step>(STEPS.idle)
  const [typedCount, setTypedCount] = createSignal(0)
  const [runKey, setRunKey] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)

  let generation = 0
  let timers: number[] = []

  function cancel() {
    generation += 1
    timers.forEach(clearTimeout)
    timers = []
  }

  async function loop(gen: number, from: Step) {
    const alive = () => gen === generation
    const wait = (ms: number) => new Promise<void>((resolve) => timers.push(window.setTimeout(resolve, ms)))
    let start = from

    while (alive()) {
      const timeline = options.timeline()
      const startIndex = Math.max(0, timeline.findIndex((entry) => entry.step === start))
      setRunKey((key) => key + 1)

      for (const entry of timeline.slice(startIndex)) {
        if (!alive()) return
        setStep(entry.step)
        // 打字步骤之前清空；之后保持全部字数，跳转到后续章节时文本完整
        setTypedCount(entry.step < STEPS.typing ? 0 : entry.step > STEPS.typing ? options.questionLength() : typedCount())

        if (entry.step === STEPS.typing) {
          setTypedCount(0)
          const total = options.questionLength()
          for (let i = 1; i <= total; i++) {
            await wait(options.perChar)
            if (!alive()) return
            setTypedCount(i)
          }
          await wait(Math.max(0, entry.hold - total * options.perChar))
        }
        else {
          await wait(entry.hold)
        }
      }
      start = STEPS.idle
    }
  }

  return {
    step,
    typedCount,
    runKey,
    playing,
    play(from = STEPS.idle) {
      cancel()
      setPlaying(true)
      // 循环首段同步读取的信号不应被调用方的 effect 追踪，否则每次推进都会重启回放
      untrack(() => void loop(generation, from))
    },
    stop() {
      cancel()
      setPlaying(false)
      setStep(STEPS.idle)
      setTypedCount(0)
    },
  }
}
