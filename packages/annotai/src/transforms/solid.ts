/** SolidJS JSX 适配器；复用 React 的原生元素定位与组件使用处传播，无 React 运行时依赖 */
import type { SourceTransform } from '@annotai/protocol'
import { reactTransform } from './react.js'

export const solidTransform: SourceTransform = {
  ...reactTransform,
  name: 'solid',
}
