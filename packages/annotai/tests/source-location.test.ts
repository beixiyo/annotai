/** 明文位置文本的生成与解析契约：Windows 盘符、属性转义解码后的值与非法输入 */
import { expect, test } from 'vitest'
import { formatSourceLocation, parseSourceLocation } from '../src/core/source-location.js'

test('解析从右侧取两段数字，盘符路径中的冒号归入文件名', () => {
  expect(parseSourceLocation('/workspace/src/App.tsx:12:5')).toEqual({ file: '/workspace/src/App.tsx', line: 12, column: 5 })
  expect(parseSourceLocation('C:\\Users\\es\\App.tsx:3:41')).toEqual({ file: 'C:\\Users\\es\\App.tsx', line: 3, column: 41 })
})

test('生成与解析互逆；getAttribute 解码后的路径（含 & 与引号）往返一致', () => {
  for (const file of ['/a/b.tsx', '/a&b/c" d.tsx', 'C:\\x&y\\z.tsx']) {
    expect(parseSourceLocation(formatSourceLocation(file, 7, 13))).toEqual({ file, line: 7, column: 13 })
  }
})

test('缺段、非正整数与空路径返回 undefined', () => {
  for (const value of ['', '/a.tsx', '/a.tsx:1', '/a.tsx:x:2', '/a.tsx:0:2', '/a.tsx:2:0', '/a.tsx:-2:3', ':12:5', '/a.tsx:1.5:2']) {
    expect(parseSourceLocation(value)).toBeUndefined()
  }
})
