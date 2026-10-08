/** 宿主持有的源码索引；转换器输出可通过任意传输通道提交到这里 */
import type { SourceRecord } from '@annotai/protocol'

/** 创建隔离索引；由宿主在更新、删除和关闭时管理生命周期 */
export function createSourceIndex() {
  const modules = new Map<string, SourceRecord[]>()
  const records = new Map<string, SourceRecord>()

  const invalidate = (file: string) => {
    for (const record of modules.get(file) ?? []) records.delete(record.id)
    modules.delete(file)
  }

  return {
    /** 原子替换模块记录，撤销旧版本的全部 ID */
    replace(file: string, sources: SourceRecord[]) {
      invalidate(file)
      const copies = structuredClone(sources)
      modules.set(file, copies)
      for (const source of copies) records.set(source.id, source)
    },
    /** 使文件记录失效；重复调用安全 */
    invalidate,
    /** 返回记录副本，调用方不能修改共享索引 */
    resolveSource(id: string) {
      const record = records.get(id)
      return record ? structuredClone(record) : undefined
    },
    /** 返回某文件的位置快照 */
    getSources(file: string) {
      return structuredClone(modules.get(file) ?? [])
    },
    /** 释放全部记录；重复调用安全 */
    clear() {
      modules.clear()
      records.clear()
    },
  }
}

/** 宿主源码索引；服务与适配器只依赖这个接口 */
export type SourceIndex = ReturnType<typeof createSourceIndex>
