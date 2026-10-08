/** 构建时内联主题，确保注入客户端无需请求额外 CSS */
declare module '*.css?inline' {
  const css: string
  export default css
}
