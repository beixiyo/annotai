/**
 * 各语法转换器注入的 DOM 属性名；发布形态自包含，不依赖 workspace 协议包
 * 权威定义在 @annotai/protocol（tests/constants.test.ts 保证两者一致）
 */
export const SOURCE_ATTRIBUTE = 'data-annotai'
export const SOURCE_PATH_ATTRIBUTE = 'data-annotai-path'
/** 组件标签上明文写入的使用处 `file:line:column`，传播到组件根元素；DOM 只带此明文时服务端按位置反查使用处记录 */
export const SOURCE_USE_PATH_ATTRIBUTE = 'data-annotai-use-path'
