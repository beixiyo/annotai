/** 明文源码位置 `file:line:column` 的生成与解析；转换器注入、服务端按使用处反查共用 */
/** 行与列均为一基；file 允许包含冒号（Windows 盘符路径） */
export function formatSourceLocation(file: string, line: number, column: number) {
  return `${file}:${line}:${column}`
}

/**
 * 解析明文位置文本；从右侧取两段数字，前置部分全部视为文件路径，盘符中的冒号不影响
 * 非法文本（缺段、非正整数、空路径）返回 undefined，由调用方决定错误语义
 */
export function parseSourceLocation(value: string) {
  const columnAt = value.lastIndexOf(':')
  if (columnAt < 0) return undefined
  const lineAt = value.lastIndexOf(':', columnAt - 1)
  if (lineAt < 0) return undefined
  const file = value.slice(0, lineAt)
  const line = Number(value.slice(lineAt + 1, columnAt))
  const column = Number(value.slice(columnAt + 1))
  if (!file || !Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return undefined
  return { file, line, column }
}
