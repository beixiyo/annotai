/** 验证 Vue SFC template 的真实编译输出、原始 offset 与 source map */
import { compile } from '@vue/compiler-dom'
import { renderToString } from '@vue/server-renderer'
import { expect, test } from 'vitest'
import { createSSRApp } from 'vue'
import { vueTransform } from '../src/transforms/vue.js'

test('Vue HTML template 注入位置并经 Vue SSR 保留属性', async () => {
  const code = `<script setup lang="ts">const title = '标题'</script>
<template>
  <main class="page" :title="title"><button title="1 > 0">保存</button></main>
</template>`
  const file = '/project/App.vue'
  const result = vueTransform.transform({ code, file, environment: 'client' })
  const template = result.code.slice(result.code.indexOf('<template>') + '<template>'.length, result.code.lastIndexOf('</template>'))
  const compiled = compile(template, { mode: 'function' })
  const render = new Function('Vue', compiled.code)(await import('vue')) as (ctx: Record<string, unknown>, cache: unknown[]) => unknown
  const html = await renderToString(createSSRApp({
    render,
    setup: () => ({ title: '标题' }),
  }))

  expect(result.sources.map((source) => source.tag)).toEqual(['main', 'button'])
  expect(result.code).toContain('data-annotai=')
  expect(compiled.code).toContain('data-annotai')
  expect(html).toContain('data-annotai=')
  expect(html).toContain(`data-annotai-path="${file}:3:3"`)
  expect(html).toContain(`data-annotai-path="${file}:3:37"`)
  expect(html).toContain('title="标题"')
  expect(html).toContain('title="1 &gt; 0"')
  expect(html).toContain('>保存</button>')
  expect(code.slice(result.sources[0].start.offset, result.sources[0].end.offset)).toContain('<main')
  expect(result.sources[0].start.line).toBe(3)
  expect(result.sources[0].start.column).toBe(3)
  expect(result.sources[1].start.line).toBe(3)
  expect(result.sources[1].start.column).toBe(37)
})

test('Vue 非 HTML template 明确报告不支持', () => {
  expect(() =>
    vueTransform.transform({
      code: '<template lang="pug">main Hello</template>',
      file: '/project/App.vue',
      environment: 'client',
    })
  ).toThrow('template language "pug" is unsupported')
})

test('Vue 保留字段冲突会阻止覆盖业务标记', () => {
  expect(() =>
    vueTransform.transform({
      code: '<template><div data-annotai="business" /></template>',
      file: '/project/App.vue',
      environment: 'client',
    })
  ).toThrow('data-annotai is reserved')
  expect(() =>
    vueTransform.transform({
      code: '<template><div :data-annotai-path="business" /></template>',
      file: '/project/App.vue',
      environment: 'client',
    })
  ).toThrow('data-annotai-path is reserved')
})

test('Vue 组件标签不注入原生元素标记', () => {
  const result = vueTransform.transform({
    code: '<template><div><my-component /><MyComponent /></div></template>',
    file: '/project/App.vue',
    environment: 'client',
  })

  expect(result.sources.map((source) => source.tag)).toEqual(['div'])
  expect(result.code).toContain('<my-component />')
  expect(result.code).toContain('<MyComponent />')
})

test('Vue SFC 解析错误不会被静默吞掉', () => {
  expect(() =>
    vueTransform.transform({
      code: '<template><div>',
      file: '/project/App.vue',
      environment: 'client',
    })
  ).toThrow('missing end tag')
})
