/** 路径边界判断；nvim 实例匹配、Vite 允许目录和源码服务共用同一实现 */
import path from 'node:path'

/** 分段比较，避免 /project-other 被误认为 /project 的子目录；两者相等视为在内 */
export function isWithin(root: string, file: string) {
  const relative = path.relative(root, file)
  return relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}
