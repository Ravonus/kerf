import { expect, test } from 'vitest'
import { defineState } from '../src/scope'
import { acceptScopeReruns } from '../src/hmr'

test('a dev server that accepts re-runs keeps the first scope', () => {
  const first = defineState('rerun', () => ({}))
  acceptScopeReruns()
  expect(defineState('rerun', () => ({}))).toBe(first)
})
