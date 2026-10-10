/** 本地 DOM 常量与协议包权威定义的一致性约束，防止双份定义漂移 */
import {
  SOURCE_ATTRIBUTE as PROTOCOL_SOURCE,
  SOURCE_PATH_ATTRIBUTE as PROTOCOL_SOURCE_PATH,
  SOURCE_USE_PATH_ATTRIBUTE as PROTOCOL_SOURCE_USE_PATH,
} from '@annotai/protocol'
import { expect, test } from 'vitest'
import { SOURCE_ATTRIBUTE, SOURCE_PATH_ATTRIBUTE, SOURCE_USE_PATH_ATTRIBUTE } from '../src/transforms/constants.js'

test('transforms 本地 DOM 常量与 protocol 权威常量一致', () => {
  expect(SOURCE_ATTRIBUTE).toBe(PROTOCOL_SOURCE)
  expect(SOURCE_PATH_ATTRIBUTE).toBe(PROTOCOL_SOURCE_PATH)
  expect(SOURCE_USE_PATH_ATTRIBUTE).toBe(PROTOCOL_SOURCE_USE_PATH)
})
