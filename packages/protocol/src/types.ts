/** 构建工具与语法转换器之间的协议，所有结果均可跨进程序列化 */
export interface TransformInput {
  /** 原始模块源码 */
  code: string
  /** 已由宿主解析和校验的绝对文件路径 */
  file: string
  /** 本次转换的执行环境 */
  environment: 'client' | 'server'
}

/** 原始源码坐标；行与列均从 1 开始，列使用 UTF-16 单元 */
export interface SourcePosition {
  line: number
  column: number
  offset: number
}

/** 单个原生元素的实现位置；不冒充组件调用位置 */
export interface SourceRecord {
  id: string
  file: string
  tag: string
  start: SourcePosition
  end: SourcePosition
}

/** 可序列化的转换结果，map 使用标准 source map JSON 字符串 */
export interface TransformResult {
  code: string
  map: string
  sources: SourceRecord[]
}

/** 框架适配器仅转换源码，不管理文件系统、索引或服务 */
export interface SourceTransform {
  name: string
  supports(file: string): boolean
  transform(input: TransformInput): TransformResult
}
