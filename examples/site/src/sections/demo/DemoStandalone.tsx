/**
 * 演示独立页：只渲染回放舞台，供 scripts/record-demo.ts 录制 GIF / MP4
 * 入口由 index.tsx 按 `?demo=solo` 分流；语言由 `lang` 参数指定且不写入存储
 */
import { DemoPlayback } from './DemoPlayback'

export function DemoStandalone() {
  return (
    <main class="grid min-h-dvh place-items-center bg-bg p-10">
      <div class="w-[960px]">
        <DemoPlayback autoplay />
      </div>
    </main>
  )
}
