// @vitest-environment node
import { icons } from '../plugin.mjs'

const env = { command: 'build', mode: 'production', root: '.' }

test('no tier: nothing is aliased, so the page keeps its CSS switch', () => {
  expect(icons().contribute(env).tokens.alias).toBeUndefined()
})

test.each(['quiet', 'balanced', 'vivid'])('tier %s resolves @weft/icons to that tier', tier => {
  expect(icons({ tier }).contribute(env).tokens.alias).toEqual({ '@weft/icons': `@weft/icons/${tier}` })
})

test('a bad option is refused by name', () => {
  expect(() => icons({ tier: 'loud' })).toThrow(/must be one of/)
  expect(() => icons({ size: 16 })).toThrow(/unknown option/)
})

test('its AGENTS section fits the 1 KB limit', () => {
  expect(Buffer.byteLength(icons().contribute(env).agents.text)).toBeLessThanOrEqual(1024)
})
