/**
 * 演示框架切换：同一段标注流程按 React / Vue / Solid 展示对应的源文件名
 * 三个框架里“加入购物车”按钮的标记一致，切换只改文件名与 file:line:col，代码预览与剧本不变
 */
import { createSignal } from 'solid-js'

/** 演示框架的展示顺序 */
export const DEMO_FRAMEWORK_IDS: readonly DemoFramework[] = ['react', 'vue', 'solid']

/** 各框架的源文件名；Solid 与 React 同用 JSX 语法，沿用 .tsx */
export const DEMO_FRAMEWORKS: Record<DemoFramework, FrameworkProfile> = {
  react: { label: 'React', file: 'ProductCard.tsx' },
  vue: { label: 'Vue', file: 'ProductCard.vue' },
  solid: { label: 'Solid', file: 'ProductCard.tsx' },
}

/** 按钮在源文件中的行列位置（所有框架共用） */
export const DEMO_POSITION = '23:9'

/** 当前演示框架；切换后整个回放的文件名与位置标签同步更新 */
export const [demoFramework, setDemoFramework] = createSignal<DemoFramework>('react')

/** 框架的展示信息 */
export interface FrameworkProfile {
  /** 切换按钮文案 */
  label: string
  /** 源文件名 */
  file: string
}

export type DemoFramework = 'react' | 'vue' | 'solid'
