/** 各语法转换器共用的版本号、DOM 属性文本与结果组装；不含任何框架解析逻辑 */
import type { SourcePosition, SourceRecord, TransformResult } from '@annotai/protocol'
import type MagicString from 'magic-string'
import { createHash } from 'node:crypto'
import { formatSourceLocation } from '../core/source-location.js'
import { SOURCE_ATTRIBUTE, SOURCE_PATH_ATTRIBUTE, SOURCE_USE_PATH_ATTRIBUTE } from './constants.js'

/** 文件路径与内容共同决定版本；旧 DOM 的 ID 不会静默解析到更新后的位置 */
export function createVersion(file: string, code: string) {
  return createHash('sha256').update(file).update('\0').update(code).digest('hex').slice(0, 24)
}

/** 按版本和起始 offset 生成索引 ID；同一文件内 offset 唯一 */
export function createSourceId(version: string, offset: number) {
  return `${version}-${offset}`
}

/** 注入到 opening tag 末尾的属性文本：索引 ID 与明文 `file:line:column` */
export function sourceAttributes(id: string, file: string, start: SourcePosition) {
  return ` ${SOURCE_ATTRIBUTE}="${id}" ${SOURCE_PATH_ATTRIBUTE}="${escapedLocation(file, start)}"`
}

/** 组件使用处标签注入的明文路径；使用处已登记为索引记录，服务端可按此位置反查 */
export function usePathAttribute(file: string, start: SourcePosition) {
  return ` ${SOURCE_USE_PATH_ATTRIBUTE}="${escapedLocation(file, start)}"`
}

/** 业务代码不能自行声明工具的保留属性，否则定位会被覆盖 */
export function isReservedAttribute(name: string) {
  return name === SOURCE_ATTRIBUTE || name === SOURCE_PATH_ATTRIBUTE || name === SOURCE_USE_PATH_ATTRIBUTE
}

/** 保留属性冲突时统一的错误文本 */
export function reservedAttributeError(file: string, name: string) {
  return new Error(`${file}: ${name} is reserved for annotai`)
}

/** 组装可序列化结果；source map 使用高精度映射以便上游继续合成 */
export function createTransformResult(output: MagicString, file: string, sources: SourceRecord[]): TransformResult {
  return {
    code: output.toString(),
    map: output.generateMap({ source: file, includeContent: true, hires: true }).toString(),
    sources,
  }
}

function escapeAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;')
}

function escapedLocation(file: string, start: SourcePosition) {
  return escapeAttribute(formatSourceLocation(file, start.line, start.column))
}
