import { readFileSync } from 'node:fs'
import { expect, it } from 'vitest'
import { lowerTheme, themeNames } from '../scripts/theme-css.mjs'

it('lowers each opt-in sheet byte for byte', () => {
  for (const path of [
    'warp.css',
    'components/button.css',
    'components/nav.css',
    'components/tabs.css',
    'components/link.css',
    'components/pill.css',
  ]) {
    const themed = readFileSync(`styles/themed/${path}`, 'utf8')
    const legacy = readFileSync(`styles/${path}`, 'utf8')
    expect(lowerTheme(themed, themeNames)).toBe(legacy)
    expect(themed).not.toBe(legacy)
  }
})

it('keeps existing variables and rejects missing fallbacks', () => {
  expect(lowerTheme('var(--old,var(--new,calc(1px + var(--raw))))', ['--new'])).toBe(
    'var(--old,calc(1px + var(--raw)))',
  )
  expect(() => lowerTheme('var(--new)', ['--new'])).toThrow('Missing fallback')
  expect(() => lowerTheme('var(--new,)', ['--new'])).toThrow('Missing fallback')
})
