/** 转换器、DOM 与浏览器客户端之间的连接常量；改名时三方同时生效 */

/** 原生元素上携带的源码索引 ID，服务端据此解析并校验位置 */
export const SOURCE_ATTRIBUTE = 'data-annotai'

/** 原生元素上明文写入的 `file:line:column`，供 DevTools 或其他工具直接读取 */
export const SOURCE_PATH_ATTRIBUTE = 'data-annotai-path'

/** 组件标签上明文写入的使用处 `file:line:column`，经 Vue attrs fallthrough 落到单根组件的根元素 */
export const SOURCE_USE_PATH_ATTRIBUTE = 'data-annotai-use-path'
