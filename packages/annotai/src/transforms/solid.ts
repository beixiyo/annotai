/** SolidJS JSX 适配器；复用无 React 运行时依赖的原生 JSX 注入逻辑，不关联组件调用点 */
import type { SourceTransform } from '@annotai/protocol'
import { reactTransform } from './react.js'

export const solidTransform: SourceTransform = {
  ...reactTransform,
  name: 'solid',
}
